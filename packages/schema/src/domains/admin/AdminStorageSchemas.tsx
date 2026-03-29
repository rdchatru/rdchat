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

import {createNamedStringLiteralUnion, createStringType} from '@fluxer/schema/src/primitives/SchemaPrimitives';
import {z} from 'zod';

const StorageEntryTypeSchema = createNamedStringLiteralUnion(
	[
		['folder', 'folder', 'Folder-like prefix'],
		['file', 'file', 'Object stored in the bucket'],
	],
	'Storage entry type',
);

export const ListStorageObjectsRequest = z.object({
	bucket: createStringType(1, 255).optional().describe('Bucket name to browse. Defaults to the first configured bucket.'),
	prefix: createStringType(0, 4096).optional().describe('Folder prefix to browse inside the selected bucket.'),
});

export type ListStorageObjectsRequest = z.infer<typeof ListStorageObjectsRequest>;

export const StorageEntrySchema = z.object({
	type: StorageEntryTypeSchema,
	name: createStringType(1, 1024).describe('Display name of the object or folder'),
	key: createStringType(1, 4096).describe('Absolute key or prefix for this entry'),
	content_type: z.string().nullable().optional().describe('MIME type for files'),
	size: z.number().int().nonnegative().optional().describe('File size in bytes'),
	last_modified: z.string().optional().describe('ISO 8601 last-modified timestamp'),
});

export type StorageEntry = z.infer<typeof StorageEntrySchema>;

export const ListStorageObjectsResponse = z.object({
	buckets: z.array(createStringType(1, 255)).max(64).describe('Configured buckets available to browse'),
	current_bucket: createStringType(1, 255).describe('Currently selected bucket'),
	current_prefix: z.string().describe('Normalized prefix for the current folder'),
	parent_prefix: z.string().nullable().describe('Prefix for the parent folder, if any'),
	entries: z.array(StorageEntrySchema).describe('Folders and files visible at the current level'),
});

export type ListStorageObjectsResponse = z.infer<typeof ListStorageObjectsResponse>;

export const StorageDownloadUrlRequest = z.object({
	bucket: createStringType(1, 255).describe('Bucket containing the object'),
	key: createStringType(1, 4096).describe('Object key to download'),
});

export type StorageDownloadUrlRequest = z.infer<typeof StorageDownloadUrlRequest>;

export const StorageDownloadUrlResponse = z.object({
	url: z.string().url().describe('Short-lived presigned download URL'),
});

export type StorageDownloadUrlResponse = z.infer<typeof StorageDownloadUrlResponse>;

export const CreateStorageFolderRequest = z.object({
	bucket: createStringType(1, 255).describe('Bucket containing the folder'),
	prefix: createStringType(0, 4096).optional().describe('Parent prefix for the new folder'),
	name: createStringType(1, 255).describe('New folder name'),
});

export type CreateStorageFolderRequest = z.infer<typeof CreateStorageFolderRequest>;

export const DeleteStorageObjectRequest = z.object({
	bucket: createStringType(1, 255).describe('Bucket containing the object'),
	key: createStringType(1, 4096).describe('Object key to delete'),
});

export type DeleteStorageObjectRequest = z.infer<typeof DeleteStorageObjectRequest>;

export const DeleteStorageFolderRequest = z.object({
	bucket: createStringType(1, 255).describe('Bucket containing the folder'),
	prefix: createStringType(1, 4096).describe('Folder prefix to delete'),
});

export type DeleteStorageFolderRequest = z.infer<typeof DeleteStorageFolderRequest>;

export const RenameStorageObjectRequest = z.object({
	bucket: createStringType(1, 255).describe('Bucket containing the object'),
	key: createStringType(1, 4096).describe('Object key to rename'),
	new_name: createStringType(1, 255).describe('New object name within the current folder'),
});

export type RenameStorageObjectRequest = z.infer<typeof RenameStorageObjectRequest>;

export const RenameStorageFolderRequest = z.object({
	bucket: createStringType(1, 255).describe('Bucket containing the folder'),
	prefix: createStringType(1, 4096).describe('Folder prefix to rename'),
	new_name: createStringType(1, 255).describe('New folder name within the current parent folder'),
});

export type RenameStorageFolderRequest = z.infer<typeof RenameStorageFolderRequest>;

export const StorageOperationResponse = z.object({
	ok: z.literal(true),
	key: z.string().optional().describe('Updated object key'),
	prefix: z.string().optional().describe('Updated folder prefix'),
	affected_keys: z.number().int().nonnegative().optional().describe('Number of objects changed by the operation'),
});

export type StorageOperationResponse = z.infer<typeof StorageOperationResponse>;

export const UploadStorageObjectsResponse = z.object({
	ok: z.literal(true),
	uploaded_keys: z.array(createStringType(1, 4096)).max(100).describe('Uploaded object keys'),
});

export type UploadStorageObjectsResponse = z.infer<typeof UploadStorageObjectsResponse>;
