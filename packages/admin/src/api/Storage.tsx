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

import {ApiClient, type ApiResult} from '@fluxer/admin/src/api/Client';
import type {Session} from '@fluxer/admin/src/types/App';
import type {AdminConfig as Config} from '@fluxer/admin/src/types/Config';
import type {
	CreateStorageFolderRequest,
	DeleteStorageFolderRequest,
	DeleteStorageObjectRequest,
	ListStorageObjectsResponse,
	RenameStorageFolderRequest,
	RenameStorageObjectRequest,
	StorageDownloadUrlResponse,
	StorageOperationResponse,
	UploadStorageObjectsResponse,
} from '@fluxer/schema/src/domains/admin/AdminStorageSchemas';

export async function listStorageObjects(
	config: Config,
	session: Session,
	bucket?: string,
	prefix?: string,
): Promise<ApiResult<ListStorageObjectsResponse>> {
	const client = new ApiClient(config, session);
	return client.post<ListStorageObjectsResponse>('/admin/storage/list', {
		...(bucket ? {bucket} : {}),
		...(prefix ? {prefix} : {}),
	});
}

export async function getStorageDownloadUrl(
	config: Config,
	session: Session,
	bucket: string,
	key: string,
): Promise<ApiResult<StorageDownloadUrlResponse>> {
	const client = new ApiClient(config, session);
	return client.post<StorageDownloadUrlResponse>('/admin/storage/download-url', {bucket, key});
}

export async function createStorageFolder(
	config: Config,
	session: Session,
	data: CreateStorageFolderRequest,
	auditLogReason?: string,
): Promise<ApiResult<StorageOperationResponse>> {
	const client = new ApiClient(config, session);
	return client.post<StorageOperationResponse>('/admin/storage/folders/create', data, auditLogReason);
}

export async function deleteStorageObject(
	config: Config,
	session: Session,
	data: DeleteStorageObjectRequest,
	auditLogReason?: string,
): Promise<ApiResult<StorageOperationResponse>> {
	const client = new ApiClient(config, session);
	return client.post<StorageOperationResponse>('/admin/storage/objects/delete', data, auditLogReason);
}

export async function deleteStorageFolder(
	config: Config,
	session: Session,
	data: DeleteStorageFolderRequest,
	auditLogReason?: string,
): Promise<ApiResult<StorageOperationResponse>> {
	const client = new ApiClient(config, session);
	return client.post<StorageOperationResponse>('/admin/storage/folders/delete', data, auditLogReason);
}

export async function renameStorageObject(
	config: Config,
	session: Session,
	data: RenameStorageObjectRequest,
	auditLogReason?: string,
): Promise<ApiResult<StorageOperationResponse>> {
	const client = new ApiClient(config, session);
	return client.post<StorageOperationResponse>('/admin/storage/objects/rename', data, auditLogReason);
}

export async function renameStorageFolder(
	config: Config,
	session: Session,
	data: RenameStorageFolderRequest,
	auditLogReason?: string,
): Promise<ApiResult<StorageOperationResponse>> {
	const client = new ApiClient(config, session);
	return client.post<StorageOperationResponse>('/admin/storage/folders/rename', data, auditLogReason);
}

export async function uploadStorageObjects(
	config: Config,
	session: Session,
	data: {bucket: string; prefix?: string; files: Array<File>},
	auditLogReason?: string,
): Promise<ApiResult<UploadStorageObjectsResponse>> {
	const client = new ApiClient(config, session);
	const form = new FormData();
	form.append('bucket', data.bucket);
	if (data.prefix) {
		form.append('prefix', data.prefix);
	}
	for (const file of data.files) {
		form.append('files', file, file.name);
	}
	return client.postForm<UploadStorageObjectsResponse>('/admin/storage/objects/upload', form, auditLogReason);
}
