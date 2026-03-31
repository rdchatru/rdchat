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

import {Platform} from '@app/lib/Platform';
import {getElectronAPI, isNativeMacOS} from '@app/utils/NativeUtils';
import {
	checkAndroidPermissions,
	openAndroidPermissionSettings,
	requestAndroidPermissions,
} from '@app/utils/TauriAndroidBridge';

type PermissionKind =
	| 'microphone'
	| 'camera'
	| 'notifications'
	| 'files'
	| 'screen'
	| 'accessibility'
	| 'input-monitoring';

export type NativePermissionResult = 'granted' | 'denied' | 'not-determined' | 'unsupported';

const permissionCache = new Map<
	PermissionKind,
	{
		value: NativePermissionResult;
		timestamp: number;
	}
>();

const CACHE_DURATION = 1000;

type AndroidPermissionKind = Extract<PermissionKind, 'microphone' | 'camera' | 'notifications' | 'files'>;

const isAndroidPermissionKind = (kind: PermissionKind): kind is AndroidPermissionKind => {
	return kind === 'microphone' || kind === 'camera' || kind === 'notifications' || kind === 'files';
};

const mapAndroidPermissionResult = (value?: string): NativePermissionResult => {
	switch (value) {
		case 'granted':
			return 'granted';
		case 'denied':
			return 'denied';
		case 'prompt':
		case 'prompt-with-rationale':
			return 'not-determined';
		default:
			return 'unsupported';
	}
};

export function getCachedPermission(kind: PermissionKind): NativePermissionResult | null {
	const cached = permissionCache.get(kind);
	if (!cached) return null;

	const age = Date.now() - cached.timestamp;
	if (age > CACHE_DURATION) {
		permissionCache.delete(kind);
		return null;
	}

	return cached.value;
}

const setCachedPermission = (kind: PermissionKind, value: NativePermissionResult): void => {
	permissionCache.set(kind, {value, timestamp: Date.now()});
};

export async function checkNativePermission(kind: PermissionKind): Promise<NativePermissionResult> {
	if (Platform.isTauriAndroid && isAndroidPermissionKind(kind)) {
		const permissions = await checkAndroidPermissions([kind]);
		const result = mapAndroidPermissionResult(permissions[kind]);
		setCachedPermission(kind, result);
		return result;
	}

	const electronApi = getElectronAPI();
	if (!electronApi) {
		const result = 'unsupported';
		setCachedPermission(kind, result);
		return result;
	}

	if (!isNativeMacOS()) {
		const result = 'granted';
		setCachedPermission(kind, result);
		return result;
	}

	let result: NativePermissionResult;

	if (kind === 'input-monitoring') {
		const hasAccess = await electronApi.checkInputMonitoringAccess();
		result = hasAccess ? 'granted' : 'denied';
		setCachedPermission(kind, result);
		return result;
	}

	if (kind === 'accessibility') {
		const isTrusted = await electronApi.checkAccessibility(false);
		result = isTrusted ? 'granted' : 'denied';
		setCachedPermission(kind, result);
		return result;
	}

	if (kind === 'notifications' || kind === 'files') {
		result = 'unsupported';
		setCachedPermission(kind, result);
		return result;
	}

	const status = await electronApi.checkMediaAccess(kind);
	switch (status) {
		case 'granted':
			result = 'granted';
			break;
		case 'denied':
		case 'restricted':
			result = 'denied';
			break;
		case 'not-determined':
			result = 'not-determined';
			break;
		default:
			result = 'not-determined';
			break;
	}

	setCachedPermission(kind, result);
	return result;
}

export async function requestNativePermission(kind: PermissionKind): Promise<NativePermissionResult> {
	if (Platform.isTauriAndroid && isAndroidPermissionKind(kind)) {
		const permissions = await requestAndroidPermissions([kind]);
		const result = mapAndroidPermissionResult(permissions[kind]);
		setCachedPermission(kind, result);
		return result;
	}

	const electronApi = getElectronAPI();
	if (!electronApi) return 'unsupported';

	if (!isNativeMacOS()) {
		return 'granted';
	}

	if (kind === 'input-monitoring') {
		const hasAccess = await electronApi.checkInputMonitoringAccess();
		return hasAccess ? 'granted' : 'denied';
	}

	if (kind === 'accessibility') {
		const isTrusted = await electronApi.checkAccessibility(true);
		return isTrusted ? 'granted' : 'denied';
	}

	if (kind === 'notifications' || kind === 'files') {
		return 'unsupported';
	}

	const granted = await electronApi.requestMediaAccess(kind);
	return granted ? 'granted' : 'denied';
}

export async function ensureNativePermission(kind: PermissionKind): Promise<NativePermissionResult> {
	const current = await checkNativePermission(kind);

	if (current === 'granted' || current === 'unsupported') {
		return current;
	}

	if (current === 'not-determined') {
		return requestNativePermission(kind);
	}

	return 'denied';
}

export async function openNativePermissionSettings(kind: PermissionKind): Promise<void> {
	if (Platform.isTauriAndroid && isAndroidPermissionKind(kind)) {
		await openAndroidPermissionSettings(kind);
		return;
	}

	const electronApi = getElectronAPI();
	if (!electronApi) return;

	if (!isNativeMacOS()) {
		return;
	}

	switch (kind) {
		case 'accessibility':
			await electronApi.openAccessibilitySettings();
			break;
		case 'input-monitoring':
			await electronApi.openInputMonitoringSettings();
			break;
		case 'microphone':
		case 'camera':
		case 'screen':
			await electronApi.openMediaAccessSettings(kind);
			break;
		case 'notifications':
		case 'files':
			break;
	}
}
