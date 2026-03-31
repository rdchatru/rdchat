import {Platform} from '@app/lib/Platform';

type TauriInvoke = <T = unknown>(command: string, args?: Record<string, unknown>) => Promise<T>;

type AndroidPermissionState = 'granted' | 'prompt' | 'prompt-with-rationale' | 'denied';

interface AndroidPushAccount {
	userId: string;
	token: string;
	gatewayEndpoint: string;
	webAppEndpoint: string;
	relayDirectoryUrl?: string | null;
}

interface AndroidPushSyncPayload {
	enabled: boolean;
	appFocused: boolean;
	suppressWhileFocused: boolean;
	accounts: Array<AndroidPushAccount>;
}

interface TauriCoreGlobal {
	core?: {
		invoke?: TauriInvoke;
	};
}

interface TauriInternalsGlobal {
	invoke?: TauriInvoke;
}

interface AndroidNotificationClick {
	url: string;
	targetUserId?: string | null;
}

function getTauriInvoke(): TauriInvoke | null {
	const internals = window.__TAURI_INTERNALS__ as TauriInternalsGlobal | undefined;
	if (typeof internals?.invoke === 'function') {
		return internals.invoke.bind(internals);
	}

	const tauri = window.__TAURI__ as TauriCoreGlobal | undefined;
	if (typeof tauri?.core?.invoke === 'function') {
		return tauri.core.invoke.bind(tauri.core);
	}

	return null;
}

function hasAndroidBridge(): boolean {
	return Platform.isTauriAndroid && getTauriInvoke() != null;
}

export async function checkAndroidPermissions(
	permissions?: Array<string>,
): Promise<Record<string, AndroidPermissionState>> {
	const invoke = getTauriInvoke();
	if (!hasAndroidBridge() || !invoke) {
		return {};
	}

	return invoke<Record<string, AndroidPermissionState>>('mobile_check_permissions', {permissions});
}

export async function requestAndroidPermissions(
	permissions?: Array<string>,
): Promise<Record<string, AndroidPermissionState>> {
	const invoke = getTauriInvoke();
	if (!hasAndroidBridge() || !invoke) {
		return {};
	}

	return invoke<Record<string, AndroidPermissionState>>('mobile_request_permissions', {permissions});
}

export async function openAndroidPermissionSettings(kind: string): Promise<void> {
	const invoke = getTauriInvoke();
	if (!hasAndroidBridge() || !invoke) {
		return;
	}

	await invoke('mobile_open_permission_settings', {kind});
}

export async function syncAndroidPushState(payload: AndroidPushSyncPayload): Promise<void> {
	const invoke = getTauriInvoke();
	if (!hasAndroidBridge() || !invoke) {
		return;
	}

	await invoke('mobile_sync_push_state', {payload});
}

export async function consumeAndroidNotificationClicks(): Promise<Array<AndroidNotificationClick>> {
	const invoke = getTauriInvoke();
	if (!hasAndroidBridge() || !invoke) {
		return [];
	}

	return invoke<Array<AndroidNotificationClick>>('mobile_consume_notification_clicks');
}
