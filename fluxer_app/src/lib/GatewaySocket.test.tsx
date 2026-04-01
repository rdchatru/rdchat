/*
 * Copyright (C) 2026 Fluxer Contributors
 *
 * This file is part of Fluxer.
 *
 * Fluxer is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Fluxer is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Fluxer. If not, see <https://www.gnu.org/licenses/>.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@app/lib/AppStorage', () => ({
	default: {
		clearExcept: vi.fn(),
	},
}));

vi.mock('@app/stores/AuthenticationStore', () => ({
	default: {
		handleConnectionClosed: vi.fn(),
	},
}));

vi.mock('@app/stores/GeoIPStore', () => ({
	default: {
		latitude: null,
		longitude: null,
	},
}));

vi.mock('@app/stores/gateway/GatewayConnectionStore', () => ({
	default: {
		logout: vi.fn(),
	},
}));

vi.mock('@app/stores/LayerManager', () => ({
	default: {
		closeAll: vi.fn(),
	},
}));

vi.mock('@app/stores/MobileLayoutStore', () => ({
	default: {
		isMobileLayout: () => false,
	},
}));

vi.mock('@app/stores/RuntimeConfigStore', () => ({
	default: {
		relayDirectoryUrl: null,
	},
}));

vi.mock('@app/stores/voice/MediaEngineFacade', () => ({
	default: {
		connectionId: null,
	},
}));

vi.mock('@app/lib/RelayClient', () => ({
	default: {
		selectRelay: vi.fn(),
	},
}));

vi.mock('@app/lib/TauriMobileTransport', () => ({
	createAppWebSocket: vi.fn(),
}));

import {GatewaySocket, GatewayState} from '@app/lib/GatewaySocket';

const defaultOptions = {
	token: 'test-token',
	apiVersion: 1,
	properties: {
		os: 'linux',
		browser: 'vitest',
		device: 'test-device',
		locale: 'en-US',
		user_agent: 'vitest',
		browser_version: '1.0.0',
		os_version: '1.0.0',
		build_timestamp: '2026-04-01T00:00:00.000Z',
	},
	compression: 'none' as const,
};

function createGatewaySocket(): GatewaySocket {
	return new GatewaySocket('wss://gateway.example.test', defaultOptions);
}

describe('GatewaySocket foreground recovery', () => {
	beforeEach(() => {
		Object.defineProperty(navigator, 'onLine', {
			configurable: true,
			value: true,
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('reconnects immediately when the socket was already reconnecting', () => {
		const socket = createGatewaySocket();
		const openSocket = vi.fn();
		(socket as any).openSocket = openSocket;
		(socket as any).connectionState = GatewayState.Reconnecting;
		(socket as any).reconnectTimeoutId = window.setTimeout(() => {}, 60_000);

		socket.recoverOnForeground();

		expect((socket as any).reconnectTimeoutId).toBeNull();
		expect(openSocket).toHaveBeenCalledTimes(1);
		expect(socket.getState()).toBe(GatewayState.Connecting);
	});

	it('reconnects a stale connected socket on foreground', () => {
		const socket = createGatewaySocket();
		const openSocket = vi.fn();
		(socket as any).openSocket = openSocket;
		(socket as any).connectionState = GatewayState.Connected;
		(socket as any).socket = {readyState: WebSocket.CLOSED};

		socket.recoverOnForeground();

		expect(openSocket).toHaveBeenCalledTimes(1);
		expect(socket.getState()).toBe(GatewayState.Connecting);
	});

	it('does not reconnect when the gateway is already connected', () => {
		const socket = createGatewaySocket();
		const openSocket = vi.fn();
		(socket as any).openSocket = openSocket;
		(socket as any).connectionState = GatewayState.Connected;
		(socket as any).socket = {readyState: WebSocket.OPEN};

		socket.recoverOnForeground();

		expect(openSocket).not.toHaveBeenCalled();
		expect(socket.getState()).toBe(GatewayState.Connected);
	});

	it('does not interrupt an active connection attempt', () => {
		const socket = createGatewaySocket();
		const openSocket = vi.fn();
		(socket as any).openSocket = openSocket;
		(socket as any).connectionState = GatewayState.Connecting;
		(socket as any).socket = {readyState: WebSocket.CONNECTING};

		socket.recoverOnForeground();

		expect(openSocket).not.toHaveBeenCalled();
		expect(socket.getState()).toBe(GatewayState.Connecting);
	});

	it('skips foreground recovery while offline', () => {
		Object.defineProperty(navigator, 'onLine', {
			configurable: true,
			value: false,
		});

		const socket = createGatewaySocket();
		const openSocket = vi.fn();
		(socket as any).openSocket = openSocket;
		(socket as any).connectionState = GatewayState.Reconnecting;

		socket.recoverOnForeground();

		expect(openSocket).not.toHaveBeenCalled();
		expect(socket.getState()).toBe(GatewayState.Reconnecting);
	});
});
