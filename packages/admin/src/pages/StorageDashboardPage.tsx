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

import {hasAnyPermission, hasPermission} from '@fluxer/admin/src/AccessControlList';
import type {ApiError} from '@fluxer/admin/src/api/Errors';
import {getErrorMessage, getErrorTitle} from '@fluxer/admin/src/api/Errors';
import {ErrorCard} from '@fluxer/admin/src/components/ErrorDisplay';
import {Layout} from '@fluxer/admin/src/components/Layout';
import {FormFieldGroup} from '@fluxer/admin/src/components/ui/Form/FormFieldGroup';
import {Input} from '@fluxer/admin/src/components/ui/Input';
import {HStack} from '@fluxer/admin/src/components/ui/Layout/HStack';
import {PageLayout} from '@fluxer/admin/src/components/ui/Layout/PageLayout';
import {VStack} from '@fluxer/admin/src/components/ui/Layout/VStack';
import {Select} from '@fluxer/admin/src/components/ui/Select';
import {Heading, Text} from '@fluxer/admin/src/components/ui/Typography';
import type {Session} from '@fluxer/admin/src/types/App';
import type {AdminConfig as Config} from '@fluxer/admin/src/types/Config';
import {formatTimestamp} from '@fluxer/date_utils/src/DateFormatting';
import {AdminACLs} from '@fluxer/constants/src/AdminACLs';
import type {Flash} from '@fluxer/hono/src/Flash';
import type {ListStorageObjectsResponse, StorageEntry} from '@fluxer/schema/src/domains/admin/AdminStorageSchemas';
import {Button} from '@fluxer/ui/src/components/Button';
import {Card} from '@fluxer/ui/src/components/Card';
import {CsrfInput} from '@fluxer/ui/src/components/CsrfInput';
import type {UserAdminResponse} from '@fluxer/schema/src/domains/admin/AdminUserSchemas';
import type {FC} from 'hono/jsx';

export interface StorageDashboardPageProps {
	config: Config;
	session: Session;
	currentAdmin: UserAdminResponse | undefined;
	flash: Flash | undefined;
	adminAcls: Array<string>;
	assetVersion: string;
	csrfToken: string;
	browseResult?: ListStorageObjectsResponse;
	browseError?: ApiError;
}

function getStorageDashboardPath(basePath: string, bucket?: string, prefix?: string): string {
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

function getStorageDownloadPath(basePath: string, bucket: string, key: string, prefix?: string): string {
	const params = new URLSearchParams({bucket, key});
	if (prefix) {
		params.set('prefix', prefix);
	}
	return `${basePath}/storage/download?${params.toString()}`;
}

function formatBytes(bytes: number | undefined): string {
	if (bytes === undefined) {
		return '-';
	}
	if (bytes < 1024) {
		return `${bytes} B`;
	}

	const units = ['KB', 'MB', 'GB', 'TB'];
	let value = bytes / 1024;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}
	return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatTimestampLocal(timestamp: string | undefined): string {
	if (!timestamp) {
		return '-';
	}
	return formatTimestamp(timestamp, 'en-US', {
		year: 'numeric',
		month: 'numeric',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
	});
}

function buildBreadcrumbs(config: Config, result: ListStorageObjectsResponse): Array<{label: string; href: string}> {
	const breadcrumbs: Array<{label: string; href: string}> = [
		{
			label: result.current_bucket,
			href: getStorageDashboardPath(config.basePath, result.current_bucket),
		},
	];

	if (!result.current_prefix) {
		return breadcrumbs;
	}

	const segments = result.current_prefix.split('/').filter(Boolean);
	let runningPrefix = '';
	for (const segment of segments) {
		runningPrefix = `${runningPrefix}${segment}/`;
		breadcrumbs.push({
			label: segment,
			href: getStorageDashboardPath(config.basePath, result.current_bucket, runningPrefix),
		});
	}

	return breadcrumbs;
}

const PermissionNotice: FC<{message: string}> = ({message}) => (
	<Card padding="md">
		<VStack gap={3}>
			<Heading level={3} size="base">
				Permission required
			</Heading>
			<Text size="sm" color="muted">
				{message}
			</Text>
		</VStack>
	</Card>
);

const BucketPicker: FC<{config: Config; result: ListStorageObjectsResponse}> = ({config, result}) => (
	<Card padding="md">
		<form method="get" action={`${config.basePath}/storage`}>
			<HStack gap={4} align="end" class="flex-wrap">
				<div class="min-w-[18rem] flex-1">
					<FormFieldGroup label="Bucket" htmlFor="storage-bucket">
						<Select
							id="storage-bucket"
							name="bucket"
							value={result.current_bucket}
							options={result.buckets.map((bucket) => ({value: bucket, label: bucket}))}
						/>
					</FormFieldGroup>
				</div>
				<Button type="submit" variant="secondary">
					Open bucket
				</Button>
			</HStack>
		</form>
	</Card>
);

const BreadcrumbCard: FC<{config: Config; result: ListStorageObjectsResponse}> = ({config, result}) => {
	const breadcrumbs = buildBreadcrumbs(config, result);

	return (
		<Card padding="md">
			<VStack gap={3}>
				<HStack justify="between" class="flex-wrap gap-3">
					<div>
						<Heading level={3} size="base">
							Current location
						</Heading>
						<Text size="sm" color="muted">
							Browse configured S3 buckets and manage objects directly from admin.
						</Text>
					</div>
					{result.parent_prefix !== null && (
						<Button
							href={getStorageDashboardPath(config.basePath, result.current_bucket, result.parent_prefix)}
							variant="secondary"
						>
							Up one level
						</Button>
					)}
				</HStack>
				<div class="flex flex-wrap items-center gap-2 text-sm">
					{breadcrumbs.map((crumb, index) => (
						<>
							{index > 0 && <span class="text-neutral-400">/</span>}
							<a href={crumb.href} class="rounded-full bg-neutral-100 px-3 py-1 text-neutral-700 hover:bg-neutral-200">
								{crumb.label}
							</a>
						</>
					))}
				</div>
				<Text size="sm" color="muted">
					Prefix: <span class="font-mono text-neutral-700">{result.current_prefix || '/'}</span>
				</Text>
			</VStack>
		</Card>
	);
};

const UploadForm: FC<{config: Config; result: ListStorageObjectsResponse; csrfToken: string}> = ({
	config,
	result,
	csrfToken,
}) => (
	<Card padding="md">
		<Heading level={3} size="base" class="mb-4">
			Upload files
		</Heading>
		<form method="post" action={`${config.basePath}/storage?action=upload`} enctype="multipart/form-data">
			<VStack gap={4}>
				<CsrfInput token={csrfToken} />
				<input type="hidden" name="bucket" value={result.current_bucket} />
				<input type="hidden" name="prefix" value={result.current_prefix} />
				<FormFieldGroup label="Files" htmlFor="storage-upload-files" helper="You can upload multiple files at once.">
					<input
						id="storage-upload-files"
						type="file"
						name="files"
						multiple
						required
						class="block w-full rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-3 text-sm text-neutral-700"
					/>
				</FormFieldGroup>
				<Button type="submit" variant="brand">
					Upload
				</Button>
			</VStack>
		</form>
	</Card>
);

const CreateFolderForm: FC<{config: Config; result: ListStorageObjectsResponse; csrfToken: string}> = ({
	config,
	result,
	csrfToken,
}) => (
	<Card padding="md">
		<Heading level={3} size="base" class="mb-4">
			Create folder
		</Heading>
		<form method="post" action={`${config.basePath}/storage?action=create-folder`}>
			<VStack gap={4}>
				<CsrfInput token={csrfToken} />
				<input type="hidden" name="bucket" value={result.current_bucket} />
				<input type="hidden" name="prefix" value={result.current_prefix} />
				<FormFieldGroup label="Folder name" htmlFor="storage-folder-name">
					<Input id="storage-folder-name" name="name" placeholder="assets" required />
				</FormFieldGroup>
				<Button type="submit" variant="secondary">
					Create folder
				</Button>
			</VStack>
		</form>
	</Card>
);

const EmptyFolderCard: FC = () => (
	<Card padding="md">
		<VStack gap={2}>
			<Heading level={3} size="base">
				No files here yet
			</Heading>
			<Text size="sm" color="muted">
				This folder is empty. Upload files or create a child folder to get started.
			</Text>
		</VStack>
	</Card>
);

const EntryActions: FC<{
	config: Config;
	result: ListStorageObjectsResponse;
	entry: StorageEntry;
	canManage: boolean;
	csrfToken: string;
}> = ({config, result, entry, canManage, csrfToken}) => {
	if (entry.type === 'folder') {
		return (
			<VStack gap={2} class="min-w-[14rem]">
				<Button
					href={getStorageDashboardPath(config.basePath, result.current_bucket, entry.key)}
					variant="secondary"
					size="small"
				>
					Open
				</Button>
				{canManage && (
					<>
						<form method="post" action={`${config.basePath}/storage?action=rename-folder`}>
							<VStack gap={2}>
								<CsrfInput token={csrfToken} />
								<input type="hidden" name="bucket" value={result.current_bucket} />
								<input type="hidden" name="current_prefix" value={result.current_prefix} />
								<input type="hidden" name="prefix" value={entry.key} />
								<Input name="new_name" placeholder="New folder name" size="sm" required class="w-full" />
								<Button type="submit" variant="secondary" size="small">
									Rename
								</Button>
							</VStack>
						</form>
						<form
							method="post"
							action={`${config.basePath}/storage?action=delete-folder`}
							onsubmit={`return confirm(${JSON.stringify(`Delete folder "${entry.name}" and everything inside it?`)})`}
						>
							<CsrfInput token={csrfToken} />
							<input type="hidden" name="bucket" value={result.current_bucket} />
							<input type="hidden" name="current_prefix" value={result.current_prefix} />
							<input type="hidden" name="prefix" value={entry.key} />
							<Button type="submit" variant="danger" size="small">
								Delete folder
							</Button>
						</form>
					</>
				)}
			</VStack>
		);
	}

	return (
		<VStack gap={2} class="min-w-[14rem]">
			<Button
				href={getStorageDownloadPath(config.basePath, result.current_bucket, entry.key, result.current_prefix)}
				variant="secondary"
				size="small"
			>
				Download
			</Button>
			{canManage && (
				<>
					<form method="post" action={`${config.basePath}/storage?action=rename-object`}>
						<VStack gap={2}>
							<CsrfInput token={csrfToken} />
							<input type="hidden" name="bucket" value={result.current_bucket} />
							<input type="hidden" name="current_prefix" value={result.current_prefix} />
							<input type="hidden" name="key" value={entry.key} />
							<Input name="new_name" placeholder="New file name" size="sm" required class="w-full" />
							<Button type="submit" variant="secondary" size="small">
								Rename
							</Button>
						</VStack>
					</form>
					<form
						method="post"
						action={`${config.basePath}/storage?action=delete-object`}
						onsubmit={`return confirm(${JSON.stringify(`Delete file "${entry.name}"?`)})`}
					>
						<CsrfInput token={csrfToken} />
						<input type="hidden" name="bucket" value={result.current_bucket} />
						<input type="hidden" name="current_prefix" value={result.current_prefix} />
						<input type="hidden" name="key" value={entry.key} />
						<Button type="submit" variant="danger" size="small">
							Delete
						</Button>
					</form>
				</>
			)}
		</VStack>
	);
};

const EntriesTable: FC<{
	config: Config;
	result: ListStorageObjectsResponse;
	canManage: boolean;
	csrfToken: string;
}> = ({config, result, canManage, csrfToken}) => {
	if (result.entries.length === 0) {
		return <EmptyFolderCard />;
	}

	return (
		<Card padding="none" class="overflow-hidden">
			<div class="overflow-x-auto">
				<table class="min-w-full text-left text-sm">
					<thead class="bg-neutral-50 text-neutral-500 uppercase text-xs">
						<tr>
							<th class="px-4 py-3 font-medium">Name</th>
							<th class="px-4 py-3 font-medium">Type</th>
							<th class="px-4 py-3 font-medium">Size</th>
							<th class="px-4 py-3 font-medium">Last modified</th>
							<th class="px-4 py-3 font-medium">Actions</th>
						</tr>
					</thead>
					<tbody>
						{result.entries.map((entry) => (
							<tr class="border-t border-neutral-200 align-top">
								<td class="px-4 py-4">
									<VStack gap={1}>
										<Text weight="semibold">{entry.name}</Text>
										<Text size="xs" color="muted" class="font-mono break-all">
											{entry.key}
										</Text>
									</VStack>
								</td>
								<td class="px-4 py-4">{entry.type === 'folder' ? 'Folder' : entry.content_type || 'File'}</td>
								<td class="px-4 py-4">{entry.type === 'folder' ? '-' : formatBytes(entry.size)}</td>
								<td class="px-4 py-4">{formatTimestampLocal(entry.last_modified)}</td>
								<td class="px-4 py-4">
									<EntryActions
										config={config}
										result={result}
										entry={entry}
										canManage={canManage}
										csrfToken={csrfToken}
									/>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</Card>
	);
};

export async function StorageDashboardPage({
	config,
	session,
	currentAdmin,
	flash,
	adminAcls,
	assetVersion,
	csrfToken,
	browseResult,
	browseError,
}: StorageDashboardPageProps) {
	const canView = hasAnyPermission(adminAcls, [AdminACLs.STORAGE_VIEW, AdminACLs.STORAGE_MANAGE]);
	const canManage = hasPermission(adminAcls, AdminACLs.STORAGE_MANAGE);

	return (
		<Layout
			csrfToken={csrfToken}
			title="S3 Dashboard"
			activePage="s3-dashboard"
			config={config}
			session={session}
			currentAdmin={currentAdmin}
			flash={flash}
			assetVersion={assetVersion}
		>
			<PageLayout maxWidth="7xl">
				<VStack gap={6}>
					<VStack gap={2}>
						<Heading level={1}>S3 Dashboard</Heading>
						<Text size="sm" color="muted">
							Browse, upload, download, rename, and delete files in the instance storage buckets.
						</Text>
					</VStack>

					{!canView && (
						<PermissionNotice message="You need the storage:view or storage:manage ACL to browse instance storage." />
					)}

					{canView && browseError && <ErrorCard title={getErrorTitle(browseError)} message={getErrorMessage(browseError)} />}

					{canView && browseResult && (
						<>
							<BucketPicker config={config} result={browseResult} />
							<BreadcrumbCard config={config} result={browseResult} />

							{canManage && (
								<div class="grid gap-4 lg:grid-cols-2">
									<UploadForm config={config} result={browseResult} csrfToken={csrfToken} />
									<CreateFolderForm config={config} result={browseResult} csrfToken={csrfToken} />
								</div>
							)}

							<EntriesTable config={config} result={browseResult} canManage={canManage} csrfToken={csrfToken} />
						</>
					)}
				</VStack>
			</PageLayout>
		</Layout>
	);
}
