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

import {randomUUID} from 'node:crypto';
import type {APIConfig} from '@fluxer/api/src/config/APIConfig';
import {GuildDataRepository} from '@fluxer/api/src/guild/repositories/GuildDataRepository';
import type {ILogger} from '@fluxer/api/src/ILogger';
import {KVAccountDeletionQueueService} from '@fluxer/api/src/infrastructure/KVAccountDeletionQueueService';
import {getMetricsService, initializeMetricsService} from '@fluxer/api/src/infrastructure/MetricsService';
import {InstanceConfigRepository} from '@fluxer/api/src/instance/InstanceConfigRepository';
import {ipBanCache} from '@fluxer/api/src/middleware/IpBanMiddleware';
import {initializeServiceSingletons, shutdownReportService} from '@fluxer/api/src/middleware/ServiceMiddleware';
import {
	ensureVoiceResourcesInitialized,
	getGatewayService,
	getKVClient,
	getLiveKitServiceInstance,
	getVoiceRoomStoreInstance,
	setInjectedWorkerService,
} from '@fluxer/api/src/middleware/ServiceRegistry';
import {ReportRepository} from '@fluxer/api/src/report/ReportRepository';
import {NatsApiRpcListener} from '@fluxer/api/src/rpc/NatsApiRpcListener';
import {initializeSearch, shutdownSearch} from '@fluxer/api/src/SearchFactory';
import {warmupAdminSearchIndexes} from '@fluxer/api/src/search/SearchWarmup';
import {VisionarySlotInitializer} from '@fluxer/api/src/stripe/VisionarySlotInitializer';
import {UserRepository} from '@fluxer/api/src/user/repositories/UserRepository';
import {VoiceDataInitializer} from '@fluxer/api/src/voice/VoiceDataInitializer';
import {VoiceReconciliationWorker} from '@fluxer/api/src/voice/VoiceReconciliationWorker';
import {VoiceRuntimeResetService} from '@fluxer/api/src/voice/VoiceRuntimeResetService';
import {JetStreamWorkerQueue} from '@fluxer/api/src/worker/JetStreamWorkerQueue';
import {WorkerService} from '@fluxer/api/src/worker/WorkerService';
import {JetStreamConnectionManager} from '@fluxer/nats/src/JetStreamConnectionManager';
import {NatsConnectionManager} from '@fluxer/nats/src/NatsConnectionManager';

let natsRpcListener: NatsApiRpcListener | null = null;
let jsConnectionManager: JetStreamConnectionManager | null = null;
let voiceReconciliationWorker: VoiceReconciliationWorker | null = null;

export function createInitializer(config: APIConfig, logger: ILogger): () => Promise<void> {
	return async (): Promise<void> => {
		logger.info('Initializing API service...');

		const kvClient = getKVClient();
		ipBanCache.setRefreshSubscriber(kvClient);
		await ipBanCache.initialize();
		logger.info('IP ban cache initialized');

		initializeMetricsService();
		logger.info('Metrics service initialized');

		await initializeServiceSingletons();
		logger.info('Service singletons initialized');

		if (!config.dev.testModeEnabled) {
			jsConnectionManager = new JetStreamConnectionManager({
				url: config.nats.jetStreamUrl,
				token: config.nats.authToken || undefined,
				name: 'api-worker',
			});
			await jsConnectionManager.connect();
			const workerQueue = new JetStreamWorkerQueue(jsConnectionManager);
			await workerQueue.ensureInfrastructure();
			setInjectedWorkerService(new WorkerService(workerQueue));
			logger.info('JetStream worker service initialized');
		}

		try {
			const userRepository = new UserRepository();
			const kvDeletionQueue = new KVAccountDeletionQueueService(kvClient, userRepository);

			if (await kvDeletionQueue.needsRebuild()) {
				logger.warn('KV deletion queue needs rebuild, rebuilding...');
				await kvDeletionQueue.rebuildState();
			} else {
				logger.info('KV deletion queue state is healthy');
			}
		} catch (error) {
			logger.error({error}, 'Failed to verify KV deletion queue state');
			throw error;
		}

		logger.info({search_url: config.search.url}, 'Initializing search...');
		let searchInitialized = false;
		try {
			await initializeSearch();
			searchInitialized = true;
			logger.info('Search initialized');
		} catch (error) {
			logger.warn({error}, 'Search initialisation failed; continuing startup without search');
		}

		// All API replicas share the same Meilisearch cluster, so only one should warm it.
		if (searchInitialized) {
			const warmupLockKey = 'fluxer:search:warmup:admin';
			const warmupLockToken = randomUUID();
			const warmupLockTtlSeconds = 60 * 60;
			const acquiredWarmupLock = await kvClient.setnx(warmupLockKey, warmupLockToken, warmupLockTtlSeconds);
			if (!acquiredWarmupLock) {
				logger.info('Another API instance is warming search indexes, skipping warmup');
			} else {
				try {
					await warmupAdminSearchIndexes({
						userRepository: new UserRepository(),
						guildRepository: new GuildDataRepository(),
						reportRepository: new ReportRepository(),
						logger,
					});
				} catch (error) {
					logger.error({error}, 'Admin search warmup failed (continuing startup)');
				} finally {
					try {
						await kvClient.releaseLock(warmupLockKey, warmupLockToken);
					} catch (error) {
						logger.warn({error}, 'Failed to release admin search warmup lock');
					}
				}
			}
		}

		if (config.voice.enabled && config.voice.defaultRegion) {
			const voiceDataInitializer = new VoiceDataInitializer();
			await voiceDataInitializer.initialize();
			await ensureVoiceResourcesInitialized();
			logger.info('Voice data initialized');

			const liveKitService = getLiveKitServiceInstance();
			const voiceRoomStore = getVoiceRoomStoreInstance();
			if (!liveKitService || !voiceRoomStore) {
				logger.warn('Voice runtime services were not available after initialization; skipping reset worker setup');
			} else {
				const voiceRuntimeResetService = new VoiceRuntimeResetService({
					gatewayService: getGatewayService(),
					liveKitService,
					voiceRoomStore,
					kvClient,
					metricsService: getMetricsService(),
					logger,
				});

				const startupResetLockKey = 'fluxer:voice:startup-reset';
				const startupResetLockToken = randomUUID();
				const startupResetLockTtlSeconds = 5 * 60;
				const acquiredStartupResetLock = await kvClient.setnx(
					startupResetLockKey,
					startupResetLockToken,
					startupResetLockTtlSeconds,
				);

				if (!acquiredStartupResetLock) {
					logger.info('Another API instance is already performing startup voice runtime reset; skipping duplicate reset');
				} else {
					try {
						const resetResult = await voiceRuntimeResetService.resetAllRooms({reason: 'startup'});
						logger.info(resetResult, 'Startup voice runtime reset complete');
					} catch (error) {
						logger.error({error}, 'Startup voice runtime reset failed (continuing startup)');
					} finally {
						try {
							await kvClient.releaseLock(startupResetLockKey, startupResetLockToken);
						} catch (error) {
							logger.warn({error}, 'Failed to release startup voice runtime reset lock');
						}
					}
				}

				voiceReconciliationWorker = new VoiceReconciliationWorker({
					gatewayService: getGatewayService(),
					liveKitService,
					voiceRoomStore,
					kvClient,
					metricsService: getMetricsService(),
					logger,
				});
				voiceReconciliationWorker.start();
				logger.info('Voice reconciliation worker started');
			}
		}

		if (config.dev.testModeEnabled && config.stripe.enabled) {
			const visionarySlotInitializer = new VisionarySlotInitializer();
			await visionarySlotInitializer.initialize();
			logger.info('Stripe visionary slots initialized');
		}

		if (config.dev.testModeEnabled) {
			const instanceConfigRepository = new InstanceConfigRepository();
			try {
				await instanceConfigRepository.setSsoConfig({
					enabled: false,
					authorizationUrl: null,
					tokenUrl: null,
					clientId: null,
				});
				logger.info('Reset SSO config to disabled for test mode');
			} catch (error) {
				logger.warn({error}, 'Failed to reset SSO config for test mode');
			}
		}

		if (!config.dev.testModeEnabled) {
			const connectionManager = new NatsConnectionManager({
				url: config.nats.coreUrl,
				token: config.nats.authToken,
				name: 'api-rpc-listener',
			});
			natsRpcListener = new NatsApiRpcListener(connectionManager, logger);
			await natsRpcListener.start();
		}

		logger.info('API service initialization complete');
	};
}

export function createShutdown(logger: ILogger): () => Promise<void> {
	return async (): Promise<void> => {
		logger.info('Shutting down API service...');

		if (natsRpcListener) {
			try {
				await natsRpcListener.stop();
				natsRpcListener = null;
			} catch (error) {
				logger.error({error}, 'Error shutting down NATS API RPC listener');
			}
		}

		if (jsConnectionManager) {
			try {
				await jsConnectionManager.drain();
				jsConnectionManager = null;
			} catch (error) {
				logger.error({error}, 'Error draining JetStream worker connection');
			}
		}

		setInjectedWorkerService(undefined);

		if (voiceReconciliationWorker) {
			try {
				voiceReconciliationWorker.stop();
				voiceReconciliationWorker = null;
			} catch (error) {
				logger.error({error}, 'Error stopping voice reconciliation worker');
			}
		}

		try {
			await shutdownSearch();
			logger.info('Search service shut down');
		} catch (error) {
			logger.error({error}, 'Error shutting down search service');
		}

		try {
			ipBanCache.shutdown();
			logger.info('IP ban cache shut down');
		} catch (error) {
			logger.error({error}, 'Error shutting down IP ban cache');
		}

		try {
			shutdownReportService();
			logger.info('Report service shut down');
		} catch (error) {
			logger.error({error}, 'Error shutting down report service');
		}

		logger.info('API service shutdown complete');
	};
}
