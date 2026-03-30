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

import type {ChannelID, GuildID, UserID} from '@fluxer/api/src/BrandedTypes';
import {createChannelID, createGuildID, createUserID} from '@fluxer/api/src/BrandedTypes';
import type {ILogger} from '@fluxer/api/src/ILogger';
import type {IGatewayService} from '@fluxer/api/src/infrastructure/IGatewayService';
import type {ILiveKitService} from '@fluxer/api/src/infrastructure/ILiveKitService';
import type {IMetricsService} from '@fluxer/api/src/infrastructure/IMetricsService';
import {parseParticipantIdentity} from '@fluxer/api/src/infrastructure/VoiceRoomContext';
import type {IVoiceRoomStore} from '@fluxer/api/src/infrastructure/IVoiceRoomStore';
import type {IKVProvider} from '@fluxer/kv_client/src/IKVProvider';

interface GatewayVoiceStateEntry {
	readonly connectionId: string;
	readonly userId: string;
}

interface GatewayPendingJoinEntry {
	readonly connectionId: string;
	readonly userId: string;
}

interface VoiceRuntimeResetServiceOptions {
	gatewayService: IGatewayService;
	liveKitService: ILiveKitService;
	voiceRoomStore: IVoiceRoomStore;
	kvClient: IKVProvider;
	metricsService: IMetricsService;
	logger: ILogger;
}

interface DiscoveredVoiceRoom {
	readonly key: string;
	readonly guildId?: GuildID;
	readonly channelId: ChannelID;
	readonly roomName: string;
}

interface RoomResetResult {
	readonly roomsReset: number;
	readonly liveKitParticipantsDisconnected: number;
	readonly gatewayConnectionsDisconnected: number;
	readonly pendingJoinsObserved: number;
	readonly errors: number;
}

export interface VoiceRuntimeResetResult {
	readonly roomsDiscovered: number;
	readonly roomsReset: number;
	readonly liveKitParticipantsDisconnected: number;
	readonly gatewayConnectionsDisconnected: number;
	readonly pendingJoinsObserved: number;
	readonly errors: number;
}

const ROOM_KEY_PREFIX = 'voice:room:server:';

export class VoiceRuntimeResetService {
	private readonly gatewayService: IGatewayService;
	private readonly liveKitService: ILiveKitService;
	private readonly voiceRoomStore: IVoiceRoomStore;
	private readonly kvClient: IKVProvider;
	private readonly metricsService: IMetricsService;
	private readonly logger: ILogger;

	constructor(options: VoiceRuntimeResetServiceOptions) {
		this.gatewayService = options.gatewayService;
		this.liveKitService = options.liveKitService;
		this.voiceRoomStore = options.voiceRoomStore;
		this.kvClient = options.kvClient;
		this.metricsService = options.metricsService;
		this.logger = options.logger.child({service: 'VoiceRuntimeResetService'});
	}

	async resetAllRooms(options: {reason: string}): Promise<VoiceRuntimeResetResult> {
		const startedAt = Date.now();
		const keys = await this.kvClient.scan(`${ROOM_KEY_PREFIX}*`, 1000);
		const rooms: Array<DiscoveredVoiceRoom> = [];
		let errors = 0;

		for (const key of keys) {
			const room = this.parseRoomKey(key);
			if (!room) {
				errors++;
				this.logger.warn({key}, 'Found malformed voice room key during runtime reset; deleting key');
				await this.kvClient.del(key);
				continue;
			}
			rooms.push(room);
		}

		this.logger.warn(
			{
				reason: options.reason,
				roomCount: rooms.length,
			},
			'Resetting active voice runtime state',
		);

		let roomsReset = 0;
		let liveKitParticipantsDisconnected = 0;
		let gatewayConnectionsDisconnected = 0;
		let pendingJoinsObserved = 0;

		for (const room of rooms) {
			const result = await this.resetRoom(room);
			roomsReset += result.roomsReset;
			liveKitParticipantsDisconnected += result.liveKitParticipantsDisconnected;
			gatewayConnectionsDisconnected += result.gatewayConnectionsDisconnected;
			pendingJoinsObserved += result.pendingJoinsObserved;
			errors += result.errors;
		}

		const durationMs = Date.now() - startedAt;
		this.metricsService.counter({
			name: 'fluxer.voice.runtime_reset.runs',
			value: 1,
			dimensions: {reason: options.reason},
		});
		this.metricsService.gauge({
			name: 'fluxer.voice.runtime_reset.rooms_discovered',
			value: rooms.length,
			dimensions: {reason: options.reason},
		});
		this.metricsService.counter({
			name: 'fluxer.voice.runtime_reset.rooms_reset',
			value: roomsReset,
			dimensions: {reason: options.reason},
		});
		this.metricsService.counter({
			name: 'fluxer.voice.runtime_reset.livekit_disconnected',
			value: liveKitParticipantsDisconnected,
			dimensions: {reason: options.reason},
		});
		this.metricsService.counter({
			name: 'fluxer.voice.runtime_reset.gateway_disconnected',
			value: gatewayConnectionsDisconnected,
			dimensions: {reason: options.reason},
		});
		this.metricsService.counter({
			name: 'fluxer.voice.runtime_reset.pending_joins_observed',
			value: pendingJoinsObserved,
			dimensions: {reason: options.reason},
		});
		this.metricsService.counter({
			name: 'fluxer.voice.runtime_reset.errors',
			value: errors,
			dimensions: {reason: options.reason},
		});
		this.metricsService.histogram({
			name: 'fluxer.voice.runtime_reset.duration',
			valueMs: durationMs,
			dimensions: {reason: options.reason},
		});

		this.logger.warn(
			{
				reason: options.reason,
				roomsDiscovered: rooms.length,
				roomsReset,
				liveKitParticipantsDisconnected,
				gatewayConnectionsDisconnected,
				pendingJoinsObserved,
				errors,
				durationMs,
			},
			'Voice runtime reset complete',
		);

		return {
			roomsDiscovered: rooms.length,
			roomsReset,
			liveKitParticipantsDisconnected,
			gatewayConnectionsDisconnected,
			pendingJoinsObserved,
			errors,
		};
	}

	private async resetRoom(room: DiscoveredVoiceRoom): Promise<RoomResetResult> {
		let roomsReset = 0;
		let liveKitParticipantsDisconnected = 0;
		let gatewayConnectionsDisconnected = 0;
		let pendingJoinsObserved = 0;
		let errors = 0;

		const pinnedServer = await this.voiceRoomStore.getPinnedRoomServer(room.guildId, room.channelId);
		if (!pinnedServer) {
			this.logger.warn({roomName: room.roomName}, 'Room had no pinned voice server during runtime reset; deleting key');
			await this.kvClient.del(room.key);
			roomsReset = 1;
			return {
				roomsReset,
				liveKitParticipantsDisconnected,
				gatewayConnectionsDisconnected,
				pendingJoinsObserved,
				errors,
			};
		}

		try {
			const listResult = await this.liveKitService.listParticipants({
				guildId: room.guildId,
				channelId: room.channelId,
				regionId: pinnedServer.regionId,
				serverId: pinnedServer.serverId,
			});

			if (listResult.status === 'ok') {
				for (const participant of listResult.participants) {
					const parsedParticipant = parseParticipantIdentity(participant.identity);
					if (!parsedParticipant) {
						errors++;
						this.logger.warn(
							{roomName: room.roomName, identity: participant.identity},
							'Could not parse LiveKit participant identity during runtime reset',
						);
						continue;
					}

					try {
						await this.liveKitService.disconnectParticipant({
							userId: parsedParticipant.userId,
							guildId: room.guildId,
							channelId: room.channelId,
							connectionId: parsedParticipant.connectionId,
							regionId: pinnedServer.regionId,
							serverId: pinnedServer.serverId,
						});
						liveKitParticipantsDisconnected++;
					} catch (error) {
						errors++;
						this.logger.error(
							{
								error,
								roomName: room.roomName,
								connectionId: parsedParticipant.connectionId,
								userId: parsedParticipant.userId.toString(),
							},
							'Failed to disconnect LiveKit participant during runtime reset',
						);
					}
				}
			} else {
				errors++;
				this.logger.warn(
					{
						roomName: room.roomName,
						errorCode: listResult.errorCode,
						retryable: listResult.retryable,
					},
					'Failed to list LiveKit participants during runtime reset',
				);
			}
		} catch (error) {
			errors++;
			this.logger.error({error, roomName: room.roomName}, 'Unexpected error listing LiveKit participants');
		}

		const [voiceStatesResult, pendingJoinsResult] = await Promise.allSettled([
			this.gatewayService.getVoiceStatesForChannel({
				guildId: room.guildId,
				channelId: room.channelId,
			}),
			this.gatewayService.getPendingJoinsForChannel({
				guildId: room.guildId,
				channelId: room.channelId,
			}),
		]);

		let voiceStates: Array<GatewayVoiceStateEntry> = [];
		if (voiceStatesResult.status === 'fulfilled') {
			voiceStates = voiceStatesResult.value.voiceStates;
		} else {
			errors++;
			this.logger.error(
				{error: voiceStatesResult.reason, roomName: room.roomName},
				'Failed to fetch gateway voice states during runtime reset',
			);
		}

		let pendingJoins: Array<GatewayPendingJoinEntry> = [];
		if (pendingJoinsResult.status === 'fulfilled') {
			pendingJoins = pendingJoinsResult.value.pendingJoins;
		} else {
			errors++;
			this.logger.error(
				{error: pendingJoinsResult.reason, roomName: room.roomName},
				'Failed to fetch gateway pending joins during runtime reset',
			);
		}

		pendingJoinsObserved = pendingJoins.length;
		const disconnectedConnectionIds = new Set<string>();

		for (const voiceState of voiceStates) {
			const disconnected = await this.disconnectGatewayConnection(
				room,
				voiceState.userId,
				voiceState.connectionId,
				'voice_state',
			);
			if (disconnected) {
				gatewayConnectionsDisconnected++;
				disconnectedConnectionIds.add(voiceState.connectionId);
			} else {
				errors++;
			}
		}

		for (const pendingJoin of pendingJoins) {
			if (disconnectedConnectionIds.has(pendingJoin.connectionId)) {
				continue;
			}
			const disconnected = await this.disconnectGatewayConnection(
				room,
				pendingJoin.userId,
				pendingJoin.connectionId,
				'pending_join',
			);
			if (disconnected) {
				gatewayConnectionsDisconnected++;
			}
		}

		try {
			await this.voiceRoomStore.deleteRoomServer(room.guildId, room.channelId);
			roomsReset = 1;
		} catch (error) {
			errors++;
			this.logger.error({error, roomName: room.roomName}, 'Failed to delete pinned room server during runtime reset');
		}

		return {
			roomsReset,
			liveKitParticipantsDisconnected,
			gatewayConnectionsDisconnected,
			pendingJoinsObserved,
			errors,
		};
	}

	private async disconnectGatewayConnection(
		room: DiscoveredVoiceRoom,
		userIdRaw: string,
		connectionId: string,
		source: 'voice_state' | 'pending_join',
	): Promise<boolean> {
		let userId: UserID;
		try {
			userId = createUserID(BigInt(userIdRaw));
		} catch {
			this.logger.warn(
				{roomName: room.roomName, userId: userIdRaw, connectionId, source},
				'Could not parse gateway user id during runtime reset',
			);
			return false;
		}

		try {
			const result = await this.gatewayService.disconnectVoiceUserIfInChannel({
				guildId: room.guildId,
				channelId: room.channelId,
				userId,
				connectionId,
			});

			if (result.ignored) {
				this.logger.debug(
					{roomName: room.roomName, userId: userId.toString(), connectionId, source},
					'Gateway ignored voice disconnect during runtime reset',
				);
				return false;
			}

			return result.success;
		} catch (error) {
			this.logger.error(
				{error, roomName: room.roomName, userId: userId.toString(), connectionId, source},
				'Failed to disconnect gateway voice entry during runtime reset',
			);
			return false;
		}
	}

	private parseRoomKey(key: string): DiscoveredVoiceRoom | null {
		if (!key.startsWith(ROOM_KEY_PREFIX)) {
			return null;
		}

		const suffix = key.slice(ROOM_KEY_PREFIX.length);
		if (suffix.startsWith('dm:')) {
			const channelIdStr = suffix.slice(3);
			try {
				const channelId = createChannelID(BigInt(channelIdStr));
				return {
					key,
					channelId,
					roomName: `dm_channel_${channelId.toString()}`,
				};
			} catch {
				return null;
			}
		}

		if (suffix.startsWith('guild:')) {
			const parts = suffix.split(':');
			if (parts.length !== 3) {
				return null;
			}

			try {
				const guildId = createGuildID(BigInt(parts[1]));
				const channelId = createChannelID(BigInt(parts[2]));
				return {
					key,
					guildId,
					channelId,
					roomName: `guild_${guildId.toString()}_channel_${channelId.toString()}`,
				};
			} catch {
				return null;
			}
		}

		return null;
	}
}
