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
import {
	createStorageFolder,
	deleteStorageFolder,
	deleteStorageObject,
	getStorageDownloadUrl,
	listStorageObjects,
	renameStorageFolder,
	renameStorageObject,
	uploadStorageObjects,
} from '@fluxer/admin/src/api/Storage';
import {getErrorDisplayString} from '@fluxer/admin/src/api/Errors';
import {redirectWithFlash} from '@fluxer/admin/src/middleware/Auth';
import {StorageDashboardPage} from '@fluxer/admin/src/pages/StorageDashboardPage';
import {getRouteContext} from '@fluxer/admin/src/routes/RouteContext';
import type {RouteFactoryDeps} from '@fluxer/admin/src/routes/RouteTypes';
import {getPageConfig} from '@fluxer/admin/src/SelfHostedOverride';
import type {AppVariables} from '@fluxer/admin/src/types/App';
import {getFiles, getOptionalString, getRequiredString, type ParsedBody} from '@fluxer/admin/src/utils/Forms';
import {AdminACLs} from '@fluxer/constants/src/AdminACLs';
import {Hono} from 'hono';

const STORAGE_VIEW_ACLS = [AdminACLs.STORAGE_VIEW, AdminACLs.STORAGE_MANAGE];

function buildStorageRedirectUrl(basePath: string, bucket?: string | null, prefix?: string | null): string {
	const params = new URLSearchParams();
	if (bucket) {
		params.set('bucket', bucket);
	}
	if (prefix) {
		params.set('prefix', prefix);
	}
	const query = params.toString();
	return `${basePath}/storage${query ? `?${query}` : ''}`;
}

export function createStorageRoutes({config, assetVersion, requireAuth}: RouteFactoryDeps) {
	const router = new Hono<{Variables: AppVariables}>();

	router.get('/storage', requireAuth, async (c) => {
		const {session, currentAdmin, flash, adminAcls, csrfToken} = getRouteContext(c);
		const pageConfig = getPageConfig(c, config);
		const bucket = c.req.query('bucket');
		const prefix = c.req.query('prefix');

		let browseResult;
		let browseError;

		if (hasAnyPermission(adminAcls, STORAGE_VIEW_ACLS)) {
			const result = await listStorageObjects(pageConfig, session, bucket, prefix);
			if (result.ok) {
				browseResult = result.data;
			} else {
				browseError = result.error;
			}
		}

		return c.html(
			<StorageDashboardPage
				config={pageConfig}
				session={session}
				currentAdmin={currentAdmin}
				flash={flash}
				adminAcls={adminAcls}
				assetVersion={assetVersion}
				csrfToken={csrfToken}
				browseResult={browseResult}
				browseError={browseError}
			/>,
		);
	});

	router.post('/storage', requireAuth, async (c) => {
		const session = c.get('session')!;
		const pageConfig = getPageConfig(c, config);

		try {
			const formData = (await c.req.parseBody()) as ParsedBody;
			const action = c.req.query('action');
			const bucket = getOptionalString(formData, 'bucket') ?? c.req.query('bucket');
			const currentPrefix = getOptionalString(formData, 'current_prefix') ?? getOptionalString(formData, 'prefix');
			const redirectUrl = buildStorageRedirectUrl(config.basePath, bucket, currentPrefix);
			const auditLogReason = getOptionalString(formData, 'audit_log_reason');

			if (action === 'create-folder') {
				const targetBucket = getRequiredString(formData, 'bucket');
				const name = getRequiredString(formData, 'name');
				if (!targetBucket || !name) {
					return redirectWithFlash(c, redirectUrl, {message: 'Bucket and folder name are required', type: 'error'});
				}

				const result = await createStorageFolder(
					pageConfig,
					session,
					{
						bucket: targetBucket,
						prefix: getOptionalString(formData, 'prefix'),
						name,
					},
					auditLogReason,
				);

				return redirectWithFlash(c, redirectUrl, {
					message: result.ok ? 'Folder created' : getErrorDisplayString(result.error),
					type: result.ok ? 'success' : 'error',
				});
			}

			if (action === 'upload') {
				const targetBucket = getRequiredString(formData, 'bucket');
				const files = getFiles(formData, 'files');
				if (!targetBucket || files.length === 0) {
					return redirectWithFlash(c, redirectUrl, {message: 'Bucket and files are required', type: 'error'});
				}

				const result = await uploadStorageObjects(
					pageConfig,
					session,
					{
						bucket: targetBucket,
						prefix: getOptionalString(formData, 'prefix'),
						files,
					},
					auditLogReason,
				);

				return redirectWithFlash(c, redirectUrl, {
					message: result.ok ? `Uploaded ${result.data.uploaded_keys.length} file(s)` : getErrorDisplayString(result.error),
					type: result.ok ? 'success' : 'error',
				});
			}

			if (action === 'delete-object') {
				const targetBucket = getRequiredString(formData, 'bucket');
				const key = getRequiredString(formData, 'key');
				if (!targetBucket || !key) {
					return redirectWithFlash(c, redirectUrl, {message: 'Bucket and key are required', type: 'error'});
				}

				const result = await deleteStorageObject(pageConfig, session, {bucket: targetBucket, key}, auditLogReason);
				return redirectWithFlash(c, redirectUrl, {
					message: result.ok ? 'File deleted' : getErrorDisplayString(result.error),
					type: result.ok ? 'success' : 'error',
				});
			}

			if (action === 'delete-folder') {
				const targetBucket = getRequiredString(formData, 'bucket');
				const prefix = getRequiredString(formData, 'prefix');
				if (!targetBucket || !prefix) {
					return redirectWithFlash(c, redirectUrl, {message: 'Bucket and folder prefix are required', type: 'error'});
				}

				const result = await deleteStorageFolder(pageConfig, session, {bucket: targetBucket, prefix}, auditLogReason);
				return redirectWithFlash(c, redirectUrl, {
					message: result.ok ? 'Folder deleted' : getErrorDisplayString(result.error),
					type: result.ok ? 'success' : 'error',
				});
			}

			if (action === 'rename-object') {
				const targetBucket = getRequiredString(formData, 'bucket');
				const key = getRequiredString(formData, 'key');
				const newName = getRequiredString(formData, 'new_name');
				if (!targetBucket || !key || !newName) {
					return redirectWithFlash(c, redirectUrl, {message: 'Bucket, key, and new name are required', type: 'error'});
				}

				const result = await renameStorageObject(
					pageConfig,
					session,
					{bucket: targetBucket, key, new_name: newName},
					auditLogReason,
				);
				return redirectWithFlash(c, redirectUrl, {
					message: result.ok ? 'File renamed' : getErrorDisplayString(result.error),
					type: result.ok ? 'success' : 'error',
				});
			}

			if (action === 'rename-folder') {
				const targetBucket = getRequiredString(formData, 'bucket');
				const prefix = getRequiredString(formData, 'prefix');
				const newName = getRequiredString(formData, 'new_name');
				if (!targetBucket || !prefix || !newName) {
					return redirectWithFlash(c, redirectUrl, {
						message: 'Bucket, folder prefix, and new name are required',
						type: 'error',
					});
				}

				const result = await renameStorageFolder(
					pageConfig,
					session,
					{bucket: targetBucket, prefix, new_name: newName},
					auditLogReason,
				);
				return redirectWithFlash(c, redirectUrl, {
					message: result.ok ? 'Folder renamed' : getErrorDisplayString(result.error),
					type: result.ok ? 'success' : 'error',
				});
			}

			return redirectWithFlash(c, redirectUrl, {message: 'Unknown action', type: 'error'});
		} catch {
			return redirectWithFlash(c, `${config.basePath}/storage`, {message: 'Invalid form data', type: 'error'});
		}
	});

	router.get('/storage/download', requireAuth, async (c) => {
		const session = c.get('session')!;
		const pageConfig = getPageConfig(c, config);
		const bucket = c.req.query('bucket');
		const key = c.req.query('key');
		const prefix = c.req.query('prefix');
		const redirectUrl = buildStorageRedirectUrl(config.basePath, bucket, prefix);

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
