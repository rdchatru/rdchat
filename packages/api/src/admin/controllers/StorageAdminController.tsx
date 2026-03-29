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

import {requireAdminACL, requireAnyAdminACL} from '@fluxer/api/src/middleware/AdminMiddleware';
import {RateLimitMiddleware} from '@fluxer/api/src/middleware/RateLimitMiddleware';
import {OpenAPI} from '@fluxer/api/src/middleware/ResponseTypeMiddleware';
import {AdminRateLimitConfigs} from '@fluxer/api/src/rate_limit_configs/AdminRateLimitConfig';
import {RateLimitConfigs} from '@fluxer/api/src/RateLimitConfig';
import type {HonoApp} from '@fluxer/api/src/types/HonoEnv';
import {Validator} from '@fluxer/api/src/Validator';
import {AdminACLs} from '@fluxer/constants/src/AdminACLs';
import {
	CreateStorageFolderRequest,
	DeleteStorageFolderRequest,
	DeleteStorageObjectRequest,
	ListStorageObjectsRequest,
	ListStorageObjectsResponse,
	RenameStorageFolderRequest,
	RenameStorageObjectRequest,
	StorageDownloadUrlRequest,
	StorageDownloadUrlResponse,
	StorageOperationResponse,
	UploadStorageObjectsResponse,
} from '@fluxer/schema/src/domains/admin/AdminStorageSchemas';

type ParsedFormValue = string | File | Array<string | File> | undefined;

function getFormString(value: ParsedFormValue): string | undefined {
	if (typeof value === 'string') {
		return value;
	}
	if (Array.isArray(value)) {
		const first = value[0];
		return typeof first === 'string' ? first : undefined;
	}
	return undefined;
}

function getFormFiles(value: ParsedFormValue): Array<File> {
	if (value instanceof File) {
		return [value];
	}
	if (Array.isArray(value)) {
		return value.filter((item): item is File => item instanceof File);
	}
	return [];
}

export function StorageAdminController(app: HonoApp) {
	app.post(
		'/admin/storage/list',
		RateLimitMiddleware(RateLimitConfigs.ADMIN_LOOKUP),
		requireAnyAdminACL([AdminACLs.STORAGE_VIEW, AdminACLs.STORAGE_MANAGE]),
		Validator('json', ListStorageObjectsRequest),
		OpenAPI({
			operationId: 'list_storage_objects',
			summary: 'Browse configured storage buckets',
			responseSchema: ListStorageObjectsResponse,
			statusCode: 200,
			security: 'adminApiKey',
			tags: 'Admin',
			description: 'Lists folders and files in a configured bucket prefix for the admin storage dashboard.',
		}),
		async (ctx) => {
			const adminService = ctx.get('adminService');
			return ctx.json(await adminService.listStorageObjects(ctx.req.valid('json')));
		},
	);

	app.post(
		'/admin/storage/download-url',
		RateLimitMiddleware(RateLimitConfigs.ADMIN_LOOKUP),
		requireAnyAdminACL([AdminACLs.STORAGE_VIEW, AdminACLs.STORAGE_MANAGE]),
		Validator('json', StorageDownloadUrlRequest),
		OpenAPI({
			operationId: 'get_storage_download_url',
			summary: 'Create a presigned download URL for a storage object',
			responseSchema: StorageDownloadUrlResponse,
			statusCode: 200,
			security: 'adminApiKey',
			tags: 'Admin',
			description: 'Generates a short-lived download URL for a file in one of the configured buckets.',
		}),
		async (ctx) => {
			const adminService = ctx.get('adminService');
			return ctx.json(await adminService.getStorageDownloadUrl(ctx.req.valid('json')));
		},
	);

	app.post(
		'/admin/storage/folders/create',
		RateLimitMiddleware(AdminRateLimitConfigs.ADMIN_GUILD_MODIFY),
		requireAdminACL(AdminACLs.STORAGE_MANAGE),
		Validator('json', CreateStorageFolderRequest),
		OpenAPI({
			operationId: 'create_storage_folder',
			summary: 'Create a folder marker in storage',
			responseSchema: StorageOperationResponse,
			statusCode: 200,
			security: 'adminApiKey',
			tags: 'Admin',
			description: 'Creates an empty folder marker so the prefix is visible in the admin storage dashboard.',
		}),
		async (ctx) => {
			const adminService = ctx.get('adminService');
			const adminUserId = ctx.get('adminUserId');
			const auditLogReason = ctx.get('auditLogReason');
			return ctx.json(await adminService.createStorageFolder(ctx.req.valid('json'), adminUserId, auditLogReason));
		},
	);

	app.post(
		'/admin/storage/folders/delete',
		RateLimitMiddleware(AdminRateLimitConfigs.ADMIN_GUILD_MODIFY),
		requireAdminACL(AdminACLs.STORAGE_MANAGE),
		Validator('json', DeleteStorageFolderRequest),
		OpenAPI({
			operationId: 'delete_storage_folder',
			summary: 'Delete a storage folder',
			responseSchema: StorageOperationResponse,
			statusCode: 200,
			security: 'adminApiKey',
			tags: 'Admin',
			description: 'Deletes all objects under a folder prefix in one of the configured buckets.',
		}),
		async (ctx) => {
			const adminService = ctx.get('adminService');
			const adminUserId = ctx.get('adminUserId');
			const auditLogReason = ctx.get('auditLogReason');
			return ctx.json(await adminService.deleteStorageFolder(ctx.req.valid('json'), adminUserId, auditLogReason));
		},
	);

	app.post(
		'/admin/storage/folders/rename',
		RateLimitMiddleware(AdminRateLimitConfigs.ADMIN_GUILD_MODIFY),
		requireAdminACL(AdminACLs.STORAGE_MANAGE),
		Validator('json', RenameStorageFolderRequest),
		OpenAPI({
			operationId: 'rename_storage_folder',
			summary: 'Rename a storage folder',
			responseSchema: StorageOperationResponse,
			statusCode: 200,
			security: 'adminApiKey',
			tags: 'Admin',
			description: 'Moves every object under a folder prefix into a newly named sibling folder.',
		}),
		async (ctx) => {
			const adminService = ctx.get('adminService');
			const adminUserId = ctx.get('adminUserId');
			const auditLogReason = ctx.get('auditLogReason');
			return ctx.json(await adminService.renameStorageFolder(ctx.req.valid('json'), adminUserId, auditLogReason));
		},
	);

	app.post(
		'/admin/storage/objects/delete',
		RateLimitMiddleware(AdminRateLimitConfigs.ADMIN_GUILD_MODIFY),
		requireAdminACL(AdminACLs.STORAGE_MANAGE),
		Validator('json', DeleteStorageObjectRequest),
		OpenAPI({
			operationId: 'delete_storage_object',
			summary: 'Delete a storage object',
			responseSchema: StorageOperationResponse,
			statusCode: 200,
			security: 'adminApiKey',
			tags: 'Admin',
			description: 'Deletes a single object from one of the configured buckets.',
		}),
		async (ctx) => {
			const adminService = ctx.get('adminService');
			const adminUserId = ctx.get('adminUserId');
			const auditLogReason = ctx.get('auditLogReason');
			return ctx.json(await adminService.deleteStorageObject(ctx.req.valid('json'), adminUserId, auditLogReason));
		},
	);

	app.post(
		'/admin/storage/objects/rename',
		RateLimitMiddleware(AdminRateLimitConfigs.ADMIN_GUILD_MODIFY),
		requireAdminACL(AdminACLs.STORAGE_MANAGE),
		Validator('json', RenameStorageObjectRequest),
		OpenAPI({
			operationId: 'rename_storage_object',
			summary: 'Rename a storage object',
			responseSchema: StorageOperationResponse,
			statusCode: 200,
			security: 'adminApiKey',
			tags: 'Admin',
			description: 'Renames a single object inside its current folder.',
		}),
		async (ctx) => {
			const adminService = ctx.get('adminService');
			const adminUserId = ctx.get('adminUserId');
			const auditLogReason = ctx.get('auditLogReason');
			return ctx.json(await adminService.renameStorageObject(ctx.req.valid('json'), adminUserId, auditLogReason));
		},
	);

	app.post(
		'/admin/storage/objects/upload',
		RateLimitMiddleware(AdminRateLimitConfigs.ADMIN_GUILD_MODIFY),
		requireAdminACL(AdminACLs.STORAGE_MANAGE),
		OpenAPI({
			operationId: 'upload_storage_objects',
			summary: 'Upload files into a storage bucket',
			responseSchema: UploadStorageObjectsResponse,
			statusCode: 200,
			security: 'adminApiKey',
			tags: 'Admin',
			description: 'Uploads one or more files into the selected bucket and prefix.',
		}),
		async (ctx) => {
			const adminService = ctx.get('adminService');
			const adminUserId = ctx.get('adminUserId');
			const auditLogReason = ctx.get('auditLogReason');
			const body = await ctx.req.parseBody();
			const files = getFormFiles(body['files']);

			return ctx.json(
				await adminService.uploadStorageObjects(
					{
						bucket: getFormString(body['bucket']) ?? '',
						prefix: getFormString(body['prefix']),
						files,
					},
					adminUserId,
					auditLogReason,
				),
			);
		},
	);
}
