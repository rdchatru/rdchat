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

import {createChannelID, createGuildID} from '@fluxer/api/src/BrandedTypes';
import type {IMetricsService} from '@fluxer/api/src/infrastructure/IMetricsService';
import {VoiceRoomStore} from '@fluxer/api/src/infrastructure/VoiceRoomStore';
import {NoopLogger} from '@fluxer/api/src/test/mocks/NoopLogger';
import {MockGatewayService} from '@fluxer/api/src/test/mocks/MockGatewayService';
import {MockKVProvider} from '@fluxer/api/src/test/mocks/MockKVProvider';
import {MockLiveKitService} from '@fluxer/api/src/test/mocks/MockLiveKitService';
import {VoiceRuntimeResetService} from '@fluxer/api/src/voice/VoiceRuntimeResetService';
import {describe, expect, it} from 'vitest';

function createMetricsService(): IMetricsService {
	return {
		counter: () => {},
		gauge: () => {},
		histogram: () => {},
		crash: () => {},
		batch: () => {},
		isEnabled: () => false,
	};
}

describe('VoiceRuntimeResetService', () => {
	it('disconnects active participants, clears gateway state, and removes pinned room assignments', async () => {
		const guildId = createGuildID(111n);
		const channelId = createChannelID(222n);
		const kvClient = new MockKVProvider();
		const voiceRoomStore = new VoiceRoomStore(kvClient);
		const gatewayService = new MockGatewayService({
			getVoiceStatesForChannelResult: [{connectionId: 'conn-1', userId: '333', channelId: '222'}],
			getPendingJoinsForChannelResult: [{connectionId: 'conn-2', userId: '444', tokenNonce: 'nonce', expiresAt: Date.now() + 60_000}],
		});
		const liveKitService = new MockLiveKitService({
			listParticipantsResult: {
				status: 'ok',
				participants: [{identity: 'user_333_conn-1'}, {identity: 'user_555_conn-3'}],
			},
		});

		await voiceRoomStore.pinRoomServer(guildId, channelId, 'us-east', 'server-1', 'wss://voice.example.com');

		const service = new VoiceRuntimeResetService({
			gatewayService,
			liveKitService,
			voiceRoomStore,
			kvClient,
			metricsService: createMetricsService(),
			logger: new NoopLogger(),
		});

		const result = await service.resetAllRooms({reason: 'test'});

		expect(result).toEqual({
			roomsDiscovered: 1,
			roomsReset: 1,
			liveKitParticipantsDisconnected: 2,
			gatewayConnectionsDisconnected: 2,
			pendingJoinsObserved: 1,
			errors: 0,
		});
		expect(liveKitService.disconnectParticipantSpy).toHaveBeenCalledTimes(2);
		expect(gatewayService.disconnectVoiceUserIfInChannelSpy).toHaveBeenCalledTimes(2);
		expect(await voiceRoomStore.getPinnedRoomServer(guildId, channelId)).toBeNull();
		expect(await kvClient.get('voice:room:server:guild:111:222')).toBeNull();
		expect(await voiceRoomStore.getServerOccupancy('us-east', 'server-1')).toEqual([]);
		expect(await voiceRoomStore.getRegionOccupancy('us-east')).toEqual([]);
	});

	it('still clears pinned room assignments when listing LiveKit participants fails', async () => {
		const guildId = createGuildID(111n);
		const channelId = createChannelID(222n);
		const kvClient = new MockKVProvider();
		const voiceRoomStore = new VoiceRoomStore(kvClient);
		const gatewayService = new MockGatewayService({
			getVoiceStatesForChannelResult: [{connectionId: 'conn-1', userId: '333', channelId: '222'}],
		});
		const liveKitService = new MockLiveKitService({
			listParticipantsResult: {
				status: 'error',
				errorCode: 'server_unavailable',
				retryable: true,
			},
		});

		await voiceRoomStore.pinRoomServer(guildId, channelId, 'us-east', 'server-1', 'wss://voice.example.com');

		const service = new VoiceRuntimeResetService({
			gatewayService,
			liveKitService,
			voiceRoomStore,
			kvClient,
			metricsService: createMetricsService(),
			logger: new NoopLogger(),
		});

		const result = await service.resetAllRooms({reason: 'test'});

		expect(result.roomsReset).toBe(1);
		expect(result.liveKitParticipantsDisconnected).toBe(0);
		expect(result.gatewayConnectionsDisconnected).toBe(1);
		expect(result.errors).toBe(1);
		expect(await voiceRoomStore.getPinnedRoomServer(guildId, channelId)).toBeNull();
	});
});
