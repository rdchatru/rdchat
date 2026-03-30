declare module '@tauri-apps/plugin-http' {
	export const fetch: typeof globalThis.fetch;
}

declare module '@tauri-apps/plugin-websocket' {
	export interface Message {
		type: 'Text' | 'Binary' | 'Ping' | 'Pong' | 'Close';
		data: string | Array<number> | {code: number; reason: string} | null;
	}

	export interface WebSocket {
		addListener(callback: (message: Message) => void): () => void;
		send(message: string | Array<number>): Promise<void>;
		disconnect(): Promise<void>;
	}

	const WebSocketPlugin: {
		connect(url: string, config?: {headers?: HeadersInit}): Promise<WebSocket>;
	};

	export default WebSocketPlugin;
}
