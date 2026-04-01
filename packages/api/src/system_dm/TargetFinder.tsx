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

import {createUserID, type GuildID, type UserID} from '@fluxer/api/src/BrandedTypes';
import type {IUserSearchService} from '@fluxer/api/src/search/IUserSearchService';
import type {IUserRepository} from '@fluxer/api/src/user/IUserRepository';
import type {UserSearchFilters} from '@fluxer/schema/src/contracts/search/SearchDocumentTypes';
import {snowflakeToDate} from '@fluxer/snowflake/src/Snowflake';

const SEARCH_BATCH_SIZE = 1000;

export interface SystemDmTargetFilters {
	registrationStart?: Date;
	registrationEnd?: Date;
	excludedGuildIds?: Set<GuildID>;
	targetUserIds?: Set<UserID>;
}

interface BuiltSystemDmFilters {
	excludedGuildIds: Set<GuildID>;
	searchFilters: UserSearchFilters;
	targetUserIds?: Set<UserID>;
}

function buildFilters(filters: SystemDmTargetFilters): BuiltSystemDmFilters {
	const excludedGuildIds = filters.excludedGuildIds ?? new Set<GuildID>();
	const searchFilters: UserSearchFilters = {
		isSystem: false,
	};

	if (filters.registrationStart) {
		searchFilters.createdAtGreaterThanOrEqual = Math.floor(filters.registrationStart.getTime() / 1000);
	}
	if (filters.registrationEnd) {
		searchFilters.createdAtLessThanOrEqual = Math.floor(filters.registrationEnd.getTime() / 1000);
	}

	return {excludedGuildIds, searchFilters, targetUserIds: filters.targetUserIds};
}

function isWithinRegistrationRange(userId: UserID, searchFilters: UserSearchFilters): boolean {
	const createdAtSec = Math.floor(snowflakeToDate(BigInt(userId)).getTime() / 1000);
	if (
		searchFilters.createdAtGreaterThanOrEqual !== undefined &&
		createdAtSec < searchFilters.createdAtGreaterThanOrEqual
	) {
		return false;
	}
	if (searchFilters.createdAtLessThanOrEqual !== undefined && createdAtSec > searchFilters.createdAtLessThanOrEqual) {
		return false;
	}
	return true;
}

async function resolveExplicitTargets(
	userRepository: IUserRepository,
	targetUserIds: Set<UserID>,
	searchFilters: UserSearchFilters,
	excludedGuildIds: Set<GuildID>,
): Promise<Array<UserID>> {
	if (targetUserIds.size === 0) {
		return [];
	}

	const users = await userRepository.listUsers(Array.from(targetUserIds));
	const allowed = users
		.filter((user) => !user.isSystem)
		.map((user) => user.id)
		.filter((userId) => isWithinRegistrationRange(userId, searchFilters));

	return filterExcludedGuilds(userRepository, allowed, excludedGuildIds);
}

async function filterExcludedGuilds(
	userRepository: IUserRepository,
	ids: Array<UserID>,
	excludedGuildIds: Set<GuildID>,
): Promise<Array<UserID>> {
	if (excludedGuildIds.size === 0) {
		return ids;
	}

	const allowed: Array<UserID> = [];
	for (const userId of ids) {
		const guildIds = await userRepository.getUserGuildIds(userId);
		const isExcluded = guildIds.some((guildId) => excludedGuildIds.has(guildId));
		if (!isExcluded) {
			allowed.push(userId);
		}
	}
	return allowed;
}

export async function collectSystemDmTargets(
	deps: {
		userRepository: IUserRepository;
		userSearchService: IUserSearchService;
	},
	filters: SystemDmTargetFilters,
): Promise<Array<UserID>> {
	const {excludedGuildIds, searchFilters, targetUserIds} = buildFilters(filters);
	const {userRepository, userSearchService} = deps;

	if (targetUserIds && targetUserIds.size > 0) {
		return resolveExplicitTargets(userRepository, targetUserIds, searchFilters, excludedGuildIds);
	}

	const userIds: Array<UserID> = [];
	let offset = 0;
	while (true) {
		const result = await userSearchService.search('', searchFilters, {
			limit: SEARCH_BATCH_SIZE,
			offset,
		});
		if (result.hits.length === 0) {
			break;
		}

		const candidateIds = result.hits.map((hit) => createUserID(BigInt(hit.id)));
		const filteredIds = await filterExcludedGuilds(userRepository, candidateIds, excludedGuildIds);
		userIds.push(...filteredIds);

		if (result.hits.length < SEARCH_BATCH_SIZE) {
			break;
		}

		offset += result.hits.length;
	}

	return userIds;
}
