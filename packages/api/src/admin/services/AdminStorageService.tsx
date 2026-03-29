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

import {Config} from '@fluxer/api/src/Config';
import type {IStorageService} from '@fluxer/api/src/infrastructure/IStorageService';
import {InputValidationError} from '@fluxer/errors/src/domains/core/InputValidationError';
import type {
	CreateStorageFolderRequest,
	DeleteStorageFolderRequest,
	DeleteStorageObjectRequest,
	ListStorageObjectsRequest,
	ListStorageObjectsResponse,
	RenameStorageFolderRequest,
	RenameStorageObjectRequest,
	StorageDownloadUrlRequest,
	StorageDownloadUrlResponse,
	StorageEntry,
	StorageOperationResponse,
	UploadStorageObjectsResponse,
} from '@fluxer/schema/src/domains/admin/AdminStorageSchemas';

interface AdminStorageServiceDeps {
	storageService: IStorageService;
}

function normalizePath(value: string | undefined): string {
	const trimmed = (value ?? '').trim();
	if (trimmed === '') {
		return '';
	}

	return trimmed.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/{2,}/g, '/');
}

function normalizePrefix(prefix: string | undefined): string {
	const normalized = normalizePath(prefix).replace(/\/+$/, '');
	return normalized === '' ? '' : `${normalized}/`;
}

function joinPrefix(parentPrefix: string, name: string): string {
	return `${parentPrefix}${name}/`;
}

function basenameFromKey(key: string): string {
	const normalized = normalizePath(key).replace(/\/+$/, '');
	const parts = normalized.split('/');
	return parts[parts.length - 1] ?? normalized;
}

function getParentPrefix(prefixOrKey: string): string {
	const normalized = normalizePath(prefixOrKey).replace(/\/+$/, '');
	if (normalized === '') {
		return '';
	}

	const parts = normalized.split('/');
	parts.pop();
	return parts.length === 0 ? '' : `${parts.join('/')}/`;
}

function toIsoString(date: Date | undefined): string | undefined {
	return date ? date.toISOString() : undefined;
}

function chunkKeys(keys: Array<string>, size: number): Array<Array<string>> {
	const chunks: Array<Array<string>> = [];
	for (let index = 0; index < keys.length; index += size) {
		chunks.push(keys.slice(index, index + size));
	}
	return chunks;
}

export class AdminStorageService {
	constructor(private readonly deps: AdminStorageServiceDeps) {}

	private getBuckets(): Array<string> {
		return [...new Set(Object.values(Config.s3.buckets).filter((bucket): bucket is string => bucket.trim() !== ''))].sort();
	}

	private getBucket(bucket: string | undefined): string {
		const buckets = this.getBuckets();
		if (buckets.length === 0) {
			throw InputValidationError.create('bucket', 'No storage buckets are configured.');
		}

		const candidate = bucket?.trim() || buckets[0];
		if (!buckets.includes(candidate)) {
			throw InputValidationError.create('bucket', `Unknown storage bucket: ${candidate}`);
		}

		return candidate;
	}

	private requireEntryName(name: string, field: string): string {
		const normalized = normalizePath(name).replace(/\/+$/, '');
		if (normalized === '') {
			throw InputValidationError.create(field, 'A name is required.');
		}
		if (normalized.includes('/')) {
			throw InputValidationError.create(field, 'Nested paths are not allowed here. Open the folder first.');
		}
		return normalized;
	}

	private requireFileKey(key: string, field: string): string {
		const normalized = normalizePath(key);
		if (normalized === '' || normalized.endsWith('/')) {
			throw InputValidationError.create(field, 'A file key is required.');
		}
		return normalized;
	}

	private requireFolderPrefix(prefix: string, field: string): string {
		const normalized = normalizePrefix(prefix);
		if (normalized === '') {
			throw InputValidationError.create(field, 'A folder prefix is required.');
		}
		return normalized;
	}

	private async ensureObjectDoesNotExist(bucket: string, key: string): Promise<void> {
		const metadata = await this.deps.storageService.getObjectMetadata(bucket, key);
		if (metadata) {
			throw InputValidationError.create('key', 'An object with that name already exists.');
		}
	}

	private async ensureFolderDoesNotExist(bucket: string, prefix: string): Promise<void> {
		const existing = await this.deps.storageService.listObjects({bucket, prefix});
		if (existing.length > 0) {
			throw InputValidationError.create('prefix', 'A folder with that name already exists.');
		}
	}

	async listObjects(data: ListStorageObjectsRequest): Promise<ListStorageObjectsResponse> {
		const bucket = this.getBucket(data.bucket);
		const prefix = normalizePrefix(data.prefix);
		const buckets = this.getBuckets();
		const objects = await this.deps.storageService.listObjects({bucket, prefix});

		const folders = new Map<string, StorageEntry>();
		const files: Array<StorageEntry> = [];

		for (const object of objects) {
			if (!object.key.startsWith(prefix)) {
				continue;
			}

			const relativeKey = object.key.slice(prefix.length);
			if (relativeKey === '') {
				continue;
			}

			const slashIndex = relativeKey.indexOf('/');
			if (slashIndex !== -1) {
				const folderName = relativeKey.slice(0, slashIndex);
				if (folderName !== '') {
					const folderKey = joinPrefix(prefix, folderName);
					if (!folders.has(folderKey)) {
						folders.set(folderKey, {
							type: 'folder',
							name: folderName,
							key: folderKey,
							last_modified: toIsoString(object.lastModified),
						});
					}
				}
				continue;
			}

			files.push({
				type: 'file',
				name: relativeKey,
				key: object.key,
				last_modified: toIsoString(object.lastModified),
			});
		}

		await Promise.all(
			files.map(async (entry) => {
				const metadata = await this.deps.storageService.getObjectMetadata(bucket, entry.key).catch(() => null);
				if (!metadata) {
					return;
				}
				entry.size = metadata.contentLength;
				entry.content_type = metadata.contentType;
			}),
		);

		const entries = [...folders.values(), ...files].sort((left, right) => {
			if (left.type !== right.type) {
				return left.type === 'folder' ? -1 : 1;
			}
			return left.name.localeCompare(right.name);
		});

		return {
			buckets,
			current_bucket: bucket,
			current_prefix: prefix,
			parent_prefix: prefix === '' ? null : getParentPrefix(prefix),
			entries,
		};
	}

	async getDownloadUrl(data: StorageDownloadUrlRequest): Promise<StorageDownloadUrlResponse> {
		const bucket = this.getBucket(data.bucket);
		const key = this.requireFileKey(data.key, 'key');
		return {
			url: await this.deps.storageService.getPresignedDownloadURL({bucket, key}),
		};
	}

	async createFolder(data: CreateStorageFolderRequest): Promise<StorageOperationResponse> {
		const bucket = this.getBucket(data.bucket);
		const parentPrefix = normalizePrefix(data.prefix);
		const folderName = this.requireEntryName(data.name, 'name');
		const folderPrefix = joinPrefix(parentPrefix, folderName);

		await this.ensureFolderDoesNotExist(bucket, folderPrefix);
		await this.deps.storageService.uploadObject({
			bucket,
			key: folderPrefix,
			body: new Uint8Array(),
			contentType: 'application/x-directory',
		});

		return {
			ok: true,
			prefix: folderPrefix,
			affected_keys: 1,
		};
	}

	async uploadObjects(data: {bucket: string; prefix?: string; files: Array<File>}): Promise<UploadStorageObjectsResponse> {
		const bucket = this.getBucket(data.bucket);
		const prefix = normalizePrefix(data.prefix);
		if (data.files.length === 0) {
			throw InputValidationError.create('files', 'At least one file is required.');
		}

		const uploadedKeys: Array<string> = [];

		for (const file of data.files) {
			const fileName = this.requireEntryName(basenameFromKey(file.name), 'files');
			const key = `${prefix}${fileName}`;
			const body = new Uint8Array(await file.arrayBuffer());

			await this.deps.storageService.uploadObject({
				bucket,
				key,
				body,
				contentType: file.type || undefined,
			});

			uploadedKeys.push(key);
		}

		return {
			ok: true,
			uploaded_keys: uploadedKeys,
		};
	}

	async deleteObject(data: DeleteStorageObjectRequest): Promise<StorageOperationResponse> {
		const bucket = this.getBucket(data.bucket);
		const key = this.requireFileKey(data.key, 'key');

		await this.deps.storageService.deleteObject(bucket, key);
		return {
			ok: true,
			key,
			affected_keys: 1,
		};
	}

	async deleteFolder(data: DeleteStorageFolderRequest): Promise<StorageOperationResponse> {
		const bucket = this.getBucket(data.bucket);
		const prefix = this.requireFolderPrefix(data.prefix, 'prefix');
		const objects = await this.deps.storageService.listObjects({bucket, prefix});
		const keys = [...new Set(objects.map((object) => object.key))];

		if (keys.length === 0) {
			throw InputValidationError.create('prefix', 'Folder not found.');
		}

		for (const chunk of chunkKeys(keys, 500)) {
			await this.deps.storageService.deleteObjects({
				bucket,
				objects: chunk.map((key) => ({Key: key})),
			});
		}

		return {
			ok: true,
			prefix,
			affected_keys: keys.length,
		};
	}

	async renameObject(data: RenameStorageObjectRequest): Promise<StorageOperationResponse> {
		const bucket = this.getBucket(data.bucket);
		const sourceKey = this.requireFileKey(data.key, 'key');
		const newName = this.requireEntryName(data.new_name, 'new_name');
		const destinationKey = `${getParentPrefix(sourceKey)}${newName}`;

		if (destinationKey !== sourceKey) {
			await this.ensureObjectDoesNotExist(bucket, destinationKey);
			await this.deps.storageService.moveObject({
				sourceBucket: bucket,
				sourceKey,
				destinationBucket: bucket,
				destinationKey,
			});
		}

		return {
			ok: true,
			key: destinationKey,
			affected_keys: 1,
		};
	}

	async renameFolder(data: RenameStorageFolderRequest): Promise<StorageOperationResponse> {
		const bucket = this.getBucket(data.bucket);
		const sourcePrefix = this.requireFolderPrefix(data.prefix, 'prefix');
		const newName = this.requireEntryName(data.new_name, 'new_name');
		const destinationPrefix = joinPrefix(getParentPrefix(sourcePrefix), newName);

		const objects = await this.deps.storageService.listObjects({bucket, prefix: sourcePrefix});
		if (objects.length === 0) {
			throw InputValidationError.create('prefix', 'Folder not found.');
		}

		if (destinationPrefix !== sourcePrefix) {
			await this.ensureFolderDoesNotExist(bucket, destinationPrefix);
			for (const object of objects) {
				const suffix = object.key.slice(sourcePrefix.length);
				await this.deps.storageService.moveObject({
					sourceBucket: bucket,
					sourceKey: object.key,
					destinationBucket: bucket,
					destinationKey: `${destinationPrefix}${suffix}`,
				});
			}
		}

		return {
			ok: true,
			prefix: destinationPrefix,
			affected_keys: objects.length,
		};
	}
}
