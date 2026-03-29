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

/** @jsxRuntime automatic */
/** @jsxImportSource hono/jsx */

import {hasAnyPermission} from '@fluxer/admin/src/AccessControlList';
import {getErrorDisplayString} from '@fluxer/admin/src/api/Errors';
import {getStorageDownloadUrl, listStorageObjects, uploadStorageObjects} from '@fluxer/admin/src/api/Storage';
import {
	buildDesktopReleasePath,
	buildDesktopReleasePrefix,
	DESKTOP_ARCHES,
	DESKTOP_CHANNELS,
	DESKTOP_PLATFORMS,
	type DesktopArch,
	type DesktopChannel,
	type DesktopPlatform,
	DesktopReleasesPage,
} from '@fluxer/admin/src/pages/DesktopReleasesPage';
import {redirectWithFlash} from '@fluxer/admin/src/middleware/Auth';
import {getRouteContext} from '@fluxer/admin/src/routes/RouteContext';
import type {RouteFactoryDeps} from '@fluxer/admin/src/routes/RouteTypes';
import {getPageConfig} from '@fluxer/admin/src/SelfHostedOverride';
import type {AppVariables} from '@fluxer/admin/src/types/App';
import {getFiles, getOptionalString, getRequiredString, type ParsedBody} from '@fluxer/admin/src/utils/Forms';
import {AdminACLs} from '@fluxer/constants/src/AdminACLs';
import {Hono} from 'hono';

const STORAGE_VIEW_ACLS = [AdminACLs.STORAGE_VIEW, AdminACLs.STORAGE_MANAGE];

function pickEnumValue<T extends string>(value: string | undefined, allowed: ReadonlyArray<T>, fallback: T): T {
	if (!value) {
		return fallback;
	}

	return allowed.includes(value as T) ? (value as T) : fallback;
}

function getSelectedChannel(value: string | undefined): DesktopChannel {
	return pickEnumValue(value, DESKTOP_CHANNELS, 'stable');
}

function getSelectedPlatform(value: string | undefined): DesktopPlatform {
	return pickEnumValue(value, DESKTOP_PLATFORMS, 'win32');
}

function getSelectedArch(value: string | undefined): DesktopArch {
	return pickEnumValue(value, DESKTOP_ARCHES, 'x64');
}

function getDesktopReleasesRedirectUrl(
	basePath: string,
	bucket: string | undefined,
	channel: DesktopChannel,
	platform: DesktopPlatform,
	arch: DesktopArch,
): string {
	return buildDesktopReleasePath(basePath, {
		bucket,
		channel,
		platform,
		arch,
	});
}

function getPreferredDownloadsBucket(buckets: Array<string>, fallback: string): string {
	return buckets.find((bucket) => /downloads?/iu.test(bucket)) ?? fallback;
}

export function createDesktopReleasesRoutes({config, assetVersion, requireAuth}: RouteFactoryDeps) {
	const router = new Hono<{Variables: AppVariables}>();

	router.get('/desktop-releases', requireAuth, async (c) => {
		const {session, currentAdmin, flash, csrfToken, adminAcls} = getRouteContext(c);
		const pageConfig = getPageConfig(c, config);
		const requestedBucket = c.req.query('bucket');
		const selectedChannel = getSelectedChannel(c.req.query('channel'));
		const selectedPlatform = getSelectedPlatform(c.req.query('platform'));
		const selectedArch = getSelectedArch(c.req.query('arch'));
		const prefix = buildDesktopReleasePrefix(selectedChannel, selectedPlatform, selectedArch);

		let browseResult;
		let browseError;
		let selectedBucket = requestedBucket ?? '';

		if (hasAnyPermission(adminAcls, STORAGE_VIEW_ACLS)) {
			const initialResult = await listStorageObjects(pageConfig, session, requestedBucket, prefix);
			if (initialResult.ok) {
				let resolvedResult = initialResult.data;
				let resolvedBucket = requestedBucket ?? getPreferredDownloadsBucket(initialResult.data.buckets, initialResult.data.current_bucket);

				if (!requestedBucket && resolvedBucket !== initialResult.data.current_bucket) {
					const preferredBucketResult = await listStorageObjects(pageConfig, session, resolvedBucket, prefix);
					if (preferredBucketResult.ok) {
						resolvedResult = preferredBucketResult.data;
					} else {
						browseError = preferredBucketResult.error;
					}
				}

				browseResult = resolvedResult;
				selectedBucket = resolvedBucket;
			} else {
				browseError = initialResult.error;
			}
		}

		return c.html(
			<DesktopReleasesPage
				config={pageConfig}
				session={session}
				currentAdmin={currentAdmin}
				flash={flash}
				adminAcls={adminAcls}
				assetVersion={assetVersion}
				csrfToken={csrfToken}
				selectedBucket={selectedBucket}
				selectedChannel={selectedChannel}
				selectedPlatform={selectedPlatform}
				selectedArch={selectedArch}
				browseResult={browseResult}
				browseError={browseError}
			/>,
		);
	});

	router.post('/desktop-releases', requireAuth, async (c) => {
		const session = c.get('session')!;
		const pageConfig = getPageConfig(c, config);

		try {
			const formData = (await c.req.parseBody()) as ParsedBody;
			const action = c.req.query('action');
			const selectedChannel = getSelectedChannel(getOptionalString(formData, 'channel'));
			const selectedPlatform = getSelectedPlatform(getOptionalString(formData, 'platform'));
			const selectedArch = getSelectedArch(getOptionalString(formData, 'arch'));
			const bucket = getOptionalString(formData, 'bucket');
			const redirectUrl = getDesktopReleasesRedirectUrl(
				config.basePath,
				bucket,
				selectedChannel,
				selectedPlatform,
				selectedArch,
			);
			const auditLogReason = getOptionalString(formData, 'audit_log_reason');

			if (!bucket) {
				return redirectWithFlash(c, redirectUrl, {message: 'Bucket is required', type: 'error'});
			}

			const prefix = buildDesktopReleasePrefix(selectedChannel, selectedPlatform, selectedArch);

			if (action === 'upload-files') {
				const files = getFiles(formData, 'files');
				if (files.length === 0) {
					return redirectWithFlash(c, redirectUrl, {message: 'Select at least one file to upload', type: 'error'});
				}

				const result = await uploadStorageObjects(
					pageConfig,
					session,
					{
						bucket,
						prefix,
						files,
					},
					auditLogReason,
				);

				return redirectWithFlash(c, redirectUrl, {
					message: result.ok ? `Uploaded ${result.data.uploaded_keys.length} file(s)` : getErrorDisplayString(result.error),
					type: result.ok ? 'success' : 'error',
				});
			}

			if (action === 'upload-manifest') {
				const manifestJson = getRequiredString(formData, 'manifest_json');
				if (!manifestJson) {
					return redirectWithFlash(c, redirectUrl, {message: 'Manifest JSON is required', type: 'error'});
				}

				const manifestFile = new File([manifestJson], 'manifest.json', {type: 'application/json'});
				const result = await uploadStorageObjects(
					pageConfig,
					session,
					{
						bucket,
						prefix,
						files: [manifestFile],
					},
					auditLogReason,
				);

				return redirectWithFlash(c, redirectUrl, {
					message: result.ok ? 'Uploaded manifest.json' : getErrorDisplayString(result.error),
					type: result.ok ? 'success' : 'error',
				});
			}

			return redirectWithFlash(c, redirectUrl, {message: 'Unknown action', type: 'error'});
		} catch {
			return redirectWithFlash(c, `${config.basePath}/desktop-releases`, {message: 'Invalid form data', type: 'error'});
		}
	});

	router.get('/desktop-releases/download', requireAuth, async (c) => {
		const session = c.get('session')!;
		const pageConfig = getPageConfig(c, config);
		const bucket = c.req.query('bucket');
		const key = c.req.query('key');
		const selectedChannel = getSelectedChannel(c.req.query('channel'));
		const selectedPlatform = getSelectedPlatform(c.req.query('platform'));
		const selectedArch = getSelectedArch(c.req.query('arch'));
		const redirectUrl = getDesktopReleasesRedirectUrl(
			config.basePath,
			bucket,
			selectedChannel,
			selectedPlatform,
			selectedArch,
		);

		if (!bucket || !key) {
			return redirectWithFlash(c, redirectUrl, {message: 'Bucket and key are required', type: 'error'});
		}

		const result = await getStorageDownloadUrl(pageConfig, session, bucket, key);
		if (!result.ok) {
			return redirectWithFlash(c, redirectUrl, {message: getErrorDisplayString(result.error), type: 'error'});
		}

		return c.redirect(result.data.url);
	});

	return router;
}
