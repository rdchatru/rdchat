import {Platform} from '@app/lib/Platform';
import type {fetch as tauriPluginFetch} from '@tauri-apps/plugin-http';

type TauriHttpFetch = typeof tauriPluginFetch;

interface TauriWebSocketMessage {
	type: 'Text' | 'Binary' | 'Ping' | 'Pong' | 'Close';
	data: string | Array<number> | {code: number; reason: string} | null;
}

interface TauriWebSocketConnection {
	addListener(callback: (message: TauriWebSocketMessage) => void): () => void;
	send(message: string | Array<number>): Promise<void>;
	disconnect(): Promise<void>;
}

type TauriWebSocketModule = {
	default: {
		connect(url: string, config?: {headers?: HeadersInit}): Promise<TauriWebSocketConnection>;
	};
};

export type AppWebSocket = Pick<
	WebSocket,
	| 'binaryType'
	| 'readyState'
	| 'send'
	| 'close'
	| 'addEventListener'
	| 'removeEventListener'
>;

export function shouldUseTauriNativeNetworking(): boolean {
	return Platform.isTauri && Platform.isNativeMobileApp;
}

export async function getTauriHttpFetch(): Promise<TauriHttpFetch> {
	const module = await import('@tauri-apps/plugin-http');
	return module.fetch as TauriHttpFetch;
}

export function installTauriFetchPolyfill(): void {
	if (!shouldUseTauriNativeNetworking()) {
		return;
	}

	const nativeFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const tauriFetch = await getTauriHttpFetch();
		return tauriFetch(input, init);
	};

	globalThis.fetch = nativeFetch as typeof fetch;
}

class TauriMobileWebSocketAdapter implements AppWebSocket {
	binaryType: BinaryType = 'blob';
	readyState: 0 | 1 | 2 | 3 = WebSocket.CONNECTING;

	private socket: TauriWebSocketConnection | null = null;
	private removePluginListener: (() => void) | null = null;
	private readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

	constructor(
		private readonly url: string,
		private readonly config?: {headers?: HeadersInit},
	) {
		void this.connect();
	}

	addEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
		if (!listener) {
			return;
		}

		let eventListeners = this.listeners.get(type);
		if (!eventListeners) {
			eventListeners = new Set();
			this.listeners.set(type, eventListeners);
		}
		eventListeners.add(listener);
	}

	removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
		if (!listener) {
			return;
		}
		this.listeners.get(type)?.delete(listener);
	}

	send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
		if (!this.socket || this.readyState !== WebSocket.OPEN) {
			throw new Error('WebSocket is not open');
		}

		void this.sendNative(data).catch((error) => {
			this.dispatchEvent('error', new Event('error'), error);
		});
	}

	close(_code?: number, _reason?: string): void {
		if (this.readyState === WebSocket.CLOSING || this.readyState === WebSocket.CLOSED) {
			return;
		}

		this.readyState = WebSocket.CLOSING;
		void this.disconnectNative();
	}

	private async connect(): Promise<void> {
		try {
			const module = (await import('@tauri-apps/plugin-websocket')) as TauriWebSocketModule;
			this.socket = await module.default.connect(this.url, this.config);
			this.removePluginListener = this.socket.addListener((message) => {
				void this.handlePluginMessage(message);
			});
			this.readyState = WebSocket.OPEN;
			this.dispatchEvent('open', new Event('open'));
		} catch (error) {
			this.readyState = WebSocket.CLOSED;
			this.dispatchEvent('error', new Event('error'), error);
			this.dispatchClose({code: 1006, reason: error instanceof Error ? error.message : String(error), wasClean: false});
		}
	}

	private async sendNative(data: string | ArrayBufferLike | Blob | ArrayBufferView): Promise<void> {
		if (!this.socket) {
			return;
		}

		if (typeof data === 'string') {
			await this.socket.send(data);
			return;
		}

		if (data instanceof Blob) {
			const arrayBuffer = await data.arrayBuffer();
			await this.socket.send(Array.from(new Uint8Array(arrayBuffer)));
			return;
		}

		const bytes =
			ArrayBuffer.isView(data)
				? new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
				: new Uint8Array(data);
		await this.socket.send(Array.from(bytes));
	}

	private async disconnectNative(): Promise<void> {
		const socket = this.socket;
		this.socket = null;

		try {
			this.removePluginListener?.();
			this.removePluginListener = null;
			await socket?.disconnect();
		} finally {
			this.dispatchClose({code: 1000, reason: '', wasClean: true});
		}
	}

	private async handlePluginMessage(message: TauriWebSocketMessage): Promise<void> {
		switch (message.type) {
			case 'Text':
				this.dispatchEvent('message', new MessageEvent('message', {data: message.data}));
				return;
			case 'Binary': {
				const bytes = new Uint8Array(message.data as Array<number>);
				const data =
					this.binaryType === 'arraybuffer'
						? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
						: new Blob([bytes]);
				this.dispatchEvent('message', new MessageEvent('message', {data}));
				return;
			}
			case 'Close': {
				const closeFrame = message.data as {code: number; reason: string} | null;
				this.dispatchClose({
					code: closeFrame?.code ?? 1000,
					reason: closeFrame?.reason ?? '',
					wasClean: true,
				});
				return;
			}
			case 'Ping':
			case 'Pong':
				return;
		}
	}

	private dispatchClose(init: CloseEventInit): void {
		this.readyState = WebSocket.CLOSED;
		this.dispatchEvent('close', new CloseEvent('close', init));
	}

	private dispatchEvent(type: string, event: Event, error?: unknown): void {
		if (error && 'error' in event) {
			(event as Event & {error?: unknown}).error = error;
		}

		for (const listener of this.listeners.get(type) ?? []) {
			if (typeof listener === 'function') {
				listener(event);
			} else {
				listener.handleEvent(event);
			}
		}
	}
}

export function createAppWebSocket(url: string, config?: {headers?: HeadersInit}): AppWebSocket {
	if (shouldUseTauriNativeNetworking()) {
		return new TauriMobileWebSocketAdapter(url, config);
	}

	return new WebSocket(url);
}
