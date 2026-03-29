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
import {Textarea} from '@fluxer/admin/src/components/ui/Textarea';
import {Heading, Text} from '@fluxer/admin/src/components/ui/Typography';
import type {Session} from '@fluxer/admin/src/types/App';
import type {AdminConfig as Config} from '@fluxer/admin/src/types/Config';
import {AdminACLs} from '@fluxer/constants/src/AdminACLs';
import {formatTimestamp} from '@fluxer/date_utils/src/DateFormatting';
import type {Flash} from '@fluxer/hono/src/Flash';
import type {ListStorageObjectsResponse, StorageEntry} from '@fluxer/schema/src/domains/admin/AdminStorageSchemas';
import type {UserAdminResponse} from '@fluxer/schema/src/domains/admin/AdminUserSchemas';
import {Button} from '@fluxer/ui/src/components/Button';
import {Card} from '@fluxer/ui/src/components/Card';
import {CsrfInput} from '@fluxer/ui/src/components/CsrfInput';
import type {FC} from 'hono/jsx';

export const DESKTOP_CHANNELS = ['stable', 'canary'] as const;
export const DESKTOP_PLATFORMS = ['win32', 'darwin', 'linux'] as const;
export const DESKTOP_ARCHES = ['x64', 'arm64'] as const;

export type DesktopChannel = (typeof DESKTOP_CHANNELS)[number];
export type DesktopPlatform = (typeof DESKTOP_PLATFORMS)[number];
export type DesktopArch = (typeof DESKTOP_ARCHES)[number];

type DesktopFormat = 'setup' | 'dmg' | 'zip' | 'appimage' | 'deb' | 'rpm' | 'tar_gz';

interface FormatDescriptor {
	format: DesktopFormat;
	label: string;
	fileExtension: string;
	archSuffixByArch: Record<DesktopArch, string>;
}

const FORMAT_DESCRIPTORS: Record<DesktopPlatform, ReadonlyArray<FormatDescriptor>> = {
	win32: [
		{
			format: 'setup',
			label: 'Windows installer (.exe)',
			fileExtension: '.exe',
			archSuffixByArch: {
				x64: 'x64',
				arm64: 'arm64',
			},
		},
	],
	darwin: [
		{
			format: 'dmg',
			label: 'Disk image (.dmg)',
			fileExtension: '.dmg',
			archSuffixByArch: {
				x64: 'x64',
				arm64: 'arm64',
			},
		},
		{
			format: 'zip',
			label: 'ZIP archive (.zip)',
			fileExtension: '.zip',
			archSuffixByArch: {
				x64: 'x64',
				arm64: 'arm64',
			},
		},
	],
	linux: [
		{
			format: 'appimage',
			label: 'AppImage (.AppImage)',
			fileExtension: '.AppImage',
			archSuffixByArch: {
				x64: 'x86_64',
				arm64: 'aarch64',
			},
		},
		{
			format: 'deb',
			label: 'Debian package (.deb)',
			fileExtension: '.deb',
			archSuffixByArch: {
				x64: 'amd64',
				arm64: 'arm64',
			},
		},
		{
			format: 'rpm',
			label: 'RPM package (.rpm)',
			fileExtension: '.rpm',
			archSuffixByArch: {
				x64: 'x86_64',
				arm64: 'aarch64',
			},
		},
		{
			format: 'tar_gz',
			label: 'Tarball (.tar.gz)',
			fileExtension: '.tar.gz',
			archSuffixByArch: {
				x64: 'x64',
				arm64: 'arm64',
			},
		},
	],
};

const STORAGE_VIEW_ACLS = [AdminACLs.STORAGE_VIEW, AdminACLs.STORAGE_MANAGE];

export interface DesktopReleasesPageProps {
	config: Config;
	session: Session;
	currentAdmin: UserAdminResponse | undefined;
	flash: Flash | undefined;
	adminAcls: Array<string>;
	assetVersion: string;
	csrfToken: string;
	selectedBucket: string;
	selectedChannel: DesktopChannel;
	selectedPlatform: DesktopPlatform;
	selectedArch: DesktopArch;
	browseResult?: ListStorageObjectsResponse;
	browseError?: ApiError;
}

export function buildDesktopReleasePath(
	basePath: string,
	params: {
		bucket?: string;
		channel: DesktopChannel;
		platform: DesktopPlatform;
		arch: DesktopArch;
	},
): string {
	const searchParams = new URLSearchParams({
		channel: params.channel,
		platform: params.platform,
		arch: params.arch,
	});

	if (params.bucket) {
		searchParams.set('bucket', params.bucket);
	}

	return `${basePath}/desktop-releases?${searchParams.toString()}`;
}

function buildDesktopReleaseDownloadPath(
	basePath: string,
	params: {
		bucket: string;
		key: string;
		channel: DesktopChannel;
		platform: DesktopPlatform;
		arch: DesktopArch;
	},
): string {
	const searchParams = new URLSearchParams({
		bucket: params.bucket,
		key: params.key,
		channel: params.channel,
		platform: params.platform,
		arch: params.arch,
	});

	return `${basePath}/desktop-releases/download?${searchParams.toString()}`;
}

export function buildDesktopReleasePrefix(
	channel: DesktopChannel,
	platform: DesktopPlatform,
	arch: DesktopArch,
): string {
	return `desktop/${channel}/${platform}/${arch}/`;
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

function getPlatformLabel(platform: DesktopPlatform): string {
	switch (platform) {
		case 'win32':
			return 'Windows';
		case 'darwin':
			return 'macOS';
		case 'linux':
			return 'Linux';
	}
}

function getArchitectureLabel(arch: DesktopArch): string {
	return arch === 'arm64' ? 'ARM64' : 'x64';
}

function buildApiBaseUrl(apiEndpoint: string): string {
	return apiEndpoint.endsWith('/') ? apiEndpoint.slice(0, -1) : apiEndpoint;
}

function getPlatformFormats(platform: DesktopPlatform): ReadonlyArray<FormatDescriptor> {
	return FORMAT_DESCRIPTORS[platform];
}

function buildLegacyFilenameExample(
	channel: DesktopChannel,
	platform: DesktopPlatform,
	arch: DesktopArch,
	format: DesktopFormat,
	version = '1.2.3',
): string {
	const descriptor = getPlatformFormats(platform).find((item) => item.format === format);
	if (!descriptor) {
		return '';
	}

	const archSuffix = descriptor.archSuffixByArch[arch];
	if (format === 'setup') {
		return `fluxer-${channel}-${version}-${archSuffix}-setup${descriptor.fileExtension}`;
	}

	return `fluxer-${channel}-${version}-${archSuffix}${descriptor.fileExtension}`;
}

function buildManifestTemplate(channel: DesktopChannel, platform: DesktopPlatform, arch: DesktopArch): string {
	const files = Object.fromEntries(
		getPlatformFormats(platform).map((descriptor) => [
			descriptor.format,
			buildLegacyFilenameExample(channel, platform, arch, descriptor.format),
		]),
	);

	return JSON.stringify(
		{
			channel,
			platform,
			arch,
			version: '1.2.3',
			pub_date: '2026-03-29T12:00:00.000Z',
			files,
		},
		null,
		2,
	);
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

const TargetPickerCard: FC<{
	config: Config;
	selectedBucket: string;
	selectedChannel: DesktopChannel;
	selectedPlatform: DesktopPlatform;
	selectedArch: DesktopArch;
	buckets: Array<string>;
}> = ({config, selectedBucket, selectedChannel, selectedPlatform, selectedArch, buckets}) => (
	<Card padding="md">
		<form method="get" action={`${config.basePath}/desktop-releases`}>
			<VStack gap={4}>
				<HStack justify="between" class="flex-wrap gap-3">
					<div>
						<Heading level={3} size="base">
							Release target
						</Heading>
						<Text size="sm" color="muted">
							Pick the storage bucket and desktop release lane you want to manage.
						</Text>
					</div>
					<Button type="submit" variant="secondary">
						Open target
					</Button>
				</HStack>
				<div class="grid gap-4 md:grid-cols-4">
					<div>
						<FormFieldGroup label="Bucket" htmlFor="desktop-release-bucket">
							<Select
								id="desktop-release-bucket"
								name="bucket"
								value={selectedBucket}
								options={buckets.map((bucket) => ({value: bucket, label: bucket}))}
							/>
						</FormFieldGroup>
					</div>
					<div>
						<FormFieldGroup label="Channel" htmlFor="desktop-release-channel">
							<Select
								id="desktop-release-channel"
								name="channel"
								value={selectedChannel}
								options={DESKTOP_CHANNELS.map((channel) => ({value: channel, label: channel}))}
							/>
						</FormFieldGroup>
					</div>
					<div>
						<FormFieldGroup label="Platform" htmlFor="desktop-release-platform">
							<Select
								id="desktop-release-platform"
								name="platform"
								value={selectedPlatform}
								options={DESKTOP_PLATFORMS.map((platform) => ({
									value: platform,
									label: getPlatformLabel(platform),
								}))}
							/>
						</FormFieldGroup>
					</div>
					<div>
						<FormFieldGroup label="Architecture" htmlFor="desktop-release-arch">
							<Select
								id="desktop-release-arch"
								name="arch"
								value={selectedArch}
								options={DESKTOP_ARCHES.map((arch) => ({
									value: arch,
									label: getArchitectureLabel(arch),
								}))}
							/>
						</FormFieldGroup>
					</div>
				</div>
			</VStack>
		</form>
	</Card>
);

const ReleaseInfoCard: FC<{
	config: Config;
	selectedBucket: string;
	selectedChannel: DesktopChannel;
	selectedPlatform: DesktopPlatform;
	selectedArch: DesktopArch;
}> = ({config, selectedBucket, selectedChannel, selectedPlatform, selectedArch}) => {
	const prefix = buildDesktopReleasePrefix(selectedChannel, selectedPlatform, selectedArch);
	const apiBaseUrl = buildApiBaseUrl(config.apiEndpoint);
	const metadataUrl = `${apiBaseUrl}/dl/desktop/${selectedChannel}/${selectedPlatform}/${selectedArch}/latest`;
	const latestUrls = getPlatformFormats(selectedPlatform).map((descriptor) => ({
		label: descriptor.format,
		url: `${metadataUrl}/${descriptor.format}`,
	}));

	return (
		<Card padding="md">
			<VStack gap={4}>
				<div>
					<Heading level={3} size="base">
						Current target
					</Heading>
					<Text size="sm" color="muted">
						Everything below uploads into the selected prefix in the chosen bucket.
					</Text>
				</div>
				<div class="grid gap-4 md:grid-cols-2">
					<div class="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
						<Text size="xs" color="muted" class="uppercase tracking-wide">
							Bucket
						</Text>
						<Text weight="semibold" class="font-mono text-neutral-900">
							{selectedBucket}
						</Text>
					</div>
					<div class="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
						<Text size="xs" color="muted" class="uppercase tracking-wide">
							Storage prefix
						</Text>
						<Text weight="semibold" class="font-mono break-all text-neutral-900">
							{prefix}
						</Text>
					</div>
				</div>
				<div class="rounded-xl border border-amber-200 bg-amber-50 p-4">
					<Text size="sm" weight="semibold" class="text-amber-900">
						Compatibility note
					</Text>
					<Text size="sm" class="mt-2 text-amber-900">
						The existing download backend still parses legacy <code class="font-mono">fluxer-...</code> package
						filenames. Keep that naming pattern for uploaded binaries until the backend is renamed too.
					</Text>
				</div>
				<div class="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
					<Text size="xs" color="muted" class="uppercase tracking-wide">
						Latest metadata endpoint
					</Text>
					<Text weight="semibold" class="font-mono break-all text-neutral-900">
						{metadataUrl}
					</Text>
				</div>
				<div class="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
					<Text size="xs" color="muted" class="uppercase tracking-wide">
						Latest redirect endpoints
					</Text>
					<div class="mt-2 space-y-2">
						{latestUrls.map((item) => (
							<Text size="sm" class="font-mono break-all text-neutral-900">
								{item.url}
							</Text>
						))}
					</div>
				</div>
			</VStack>
		</Card>
	);
};

const ExpectedFilesCard: FC<{
	selectedChannel: DesktopChannel;
	selectedPlatform: DesktopPlatform;
	selectedArch: DesktopArch;
}> = ({selectedChannel, selectedPlatform, selectedArch}) => (
	<Card padding="md">
		<VStack gap={4}>
			<div>
				<Heading level={3} size="base">
					Expected files
				</Heading>
				<Text size="sm" color="muted">
					Upload binaries, blockmaps, and checksum files into the same prefix. The manifest should reference the binary
					filenames exactly.
				</Text>
			</div>
			<ul class="space-y-3">
				{getPlatformFormats(selectedPlatform).map((descriptor) => (
					<li class="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
						<Text weight="semibold" class="text-neutral-900">
							{descriptor.label}
						</Text>
						<Text size="sm" color="muted" class="mt-1">
							Example: <code class="font-mono">{buildLegacyFilenameExample(selectedChannel, selectedPlatform, selectedArch, descriptor.format)}</code>
						</Text>
					</li>
				))}
			</ul>
		</VStack>
	</Card>
);

const UploadFilesCard: FC<{
	config: Config;
	selectedBucket: string;
	selectedChannel: DesktopChannel;
	selectedPlatform: DesktopPlatform;
	selectedArch: DesktopArch;
	csrfToken: string;
}> = ({config, selectedBucket, selectedChannel, selectedPlatform, selectedArch, csrfToken}) => (
	<Card padding="md">
		<Heading level={3} size="base" class="mb-4">
			Upload binaries and checksum files
		</Heading>
		<form method="post" action={`${config.basePath}/desktop-releases?action=upload-files`} enctype="multipart/form-data">
			<VStack gap={4}>
				<CsrfInput token={csrfToken} />
				<input type="hidden" name="bucket" value={selectedBucket} />
				<input type="hidden" name="channel" value={selectedChannel} />
				<input type="hidden" name="platform" value={selectedPlatform} />
				<input type="hidden" name="arch" value={selectedArch} />
				<FormFieldGroup
					label="Files"
					htmlFor="desktop-release-files"
					helper="Upload release binaries, .sha256 files, blockmaps, and any other desktop release artifacts for this target."
				>
					<input
						id="desktop-release-files"
						type="file"
						name="files"
						multiple
						required
						class="block w-full rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-3 text-sm text-neutral-700"
					/>
				</FormFieldGroup>
				<FormFieldGroup
					label="Audit log reason"
					htmlFor="desktop-release-files-audit-log-reason"
					helper="Optional, but helpful when you're publishing a new version."
				>
					<Input id="desktop-release-files-audit-log-reason" name="audit_log_reason" placeholder="Release 1.2.3 desktop artifacts" />
				</FormFieldGroup>
				<Button type="submit" variant="brand">
					Upload files
				</Button>
			</VStack>
		</form>
	</Card>
);

const ManifestCard: FC<{
	config: Config;
	selectedBucket: string;
	selectedChannel: DesktopChannel;
	selectedPlatform: DesktopPlatform;
	selectedArch: DesktopArch;
	csrfToken: string;
}> = ({config, selectedBucket, selectedChannel, selectedPlatform, selectedArch, csrfToken}) => (
	<Card padding="md">
		<VStack gap={4}>
			<div>
				<Heading level={3} size="base">
					Upload manifest.json
				</Heading>
				<Text size="sm" color="muted">
					Paste the final manifest content or upload a physical <code class="font-mono">manifest.json</code> file using the
					multi-file uploader.
				</Text>
			</div>
			<div class="rounded-xl border border-neutral-200 bg-neutral-950 p-4 text-sm text-neutral-100">
				<pre class="overflow-x-auto whitespace-pre-wrap">{buildManifestTemplate(selectedChannel, selectedPlatform, selectedArch)}</pre>
			</div>
			<form method="post" action={`${config.basePath}/desktop-releases?action=upload-manifest`}>
				<VStack gap={4}>
					<CsrfInput token={csrfToken} />
					<input type="hidden" name="bucket" value={selectedBucket} />
					<input type="hidden" name="channel" value={selectedChannel} />
					<input type="hidden" name="platform" value={selectedPlatform} />
					<input type="hidden" name="arch" value={selectedArch} />
					<FormFieldGroup
						label="Manifest JSON"
						htmlFor="desktop-release-manifest-json"
						helper="This always uploads as manifest.json inside the selected desktop release prefix."
					>
						<Textarea
							id="desktop-release-manifest-json"
							name="manifest_json"
							rows={12}
							required
							placeholder={buildManifestTemplate(selectedChannel, selectedPlatform, selectedArch)}
						/>
					</FormFieldGroup>
					<FormFieldGroup label="Audit log reason" htmlFor="desktop-release-manifest-audit-log-reason">
						<Input id="desktop-release-manifest-audit-log-reason" name="audit_log_reason" placeholder="Publish manifest for 1.2.3" />
					</FormFieldGroup>
					<Button type="submit" variant="secondary">
						Upload manifest
					</Button>
				</VStack>
			</form>
		</VStack>
	</Card>
);

const EmptyEntriesCard: FC = () => (
	<Card padding="md">
		<VStack gap={2}>
			<Heading level={3} size="base">
				No files uploaded yet
			</Heading>
			<Text size="sm" color="muted">
				This release lane is empty. Upload the desktop client binaries first, then publish a matching manifest.
			</Text>
		</VStack>
	</Card>
);

const EntriesTable: FC<{
	config: Config;
	selectedBucket: string;
	selectedChannel: DesktopChannel;
	selectedPlatform: DesktopPlatform;
	selectedArch: DesktopArch;
	entries: Array<StorageEntry>;
}> = ({config, selectedBucket, selectedChannel, selectedPlatform, selectedArch, entries}) => {
	if (entries.length === 0) {
		return <EmptyEntriesCard />;
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
							<th class="px-4 py-3 font-medium">Action</th>
						</tr>
					</thead>
					<tbody>
						{entries.map((entry) => (
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
									{entry.type === 'file' ? (
										<Button
											href={buildDesktopReleaseDownloadPath(config.basePath, {
												bucket: selectedBucket,
												key: entry.key,
												channel: selectedChannel,
												platform: selectedPlatform,
												arch: selectedArch,
											})}
											variant="secondary"
											size="small"
										>
											Download
										</Button>
									) : (
										<Text size="sm" color="muted">
											N/A
										</Text>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</Card>
	);
};

export async function DesktopReleasesPage({
	config,
	session,
	currentAdmin,
	flash,
	adminAcls,
	assetVersion,
	csrfToken,
	selectedBucket,
	selectedChannel,
	selectedPlatform,
	selectedArch,
	browseResult,
	browseError,
}: DesktopReleasesPageProps) {
	const canView = hasAnyPermission(adminAcls, STORAGE_VIEW_ACLS);
	const canManage = hasPermission(adminAcls, AdminACLs.STORAGE_MANAGE);

	return (
		<Layout
			csrfToken={csrfToken}
			title="Desktop Releases"
			activePage="desktop-releases"
			config={config}
			session={session}
			currentAdmin={currentAdmin}
			flash={flash}
			assetVersion={assetVersion}
		>
			<PageLayout maxWidth="7xl">
				<VStack gap={6}>
					<VStack gap={2}>
						<Heading level={1}>Desktop Releases</Heading>
						<Text size="sm" color="muted">
							Upload release artifacts for desktop downloads without touching the backend. This tool targets the
							storage layout used by the existing download service.
						</Text>
					</VStack>

					{!canView && (
						<PermissionNotice message="You need the storage:view or storage:manage ACL to manage desktop release artifacts." />
					)}

					{canView && browseError && <ErrorCard title={getErrorTitle(browseError)} message={getErrorMessage(browseError)} />}

					{canView && browseResult && (
						<>
							<TargetPickerCard
								config={config}
								selectedBucket={selectedBucket}
								selectedChannel={selectedChannel}
								selectedPlatform={selectedPlatform}
								selectedArch={selectedArch}
								buckets={browseResult.buckets}
							/>
							<div class="grid gap-4 xl:grid-cols-[1.3fr_.9fr]">
								<ReleaseInfoCard
									config={config}
									selectedBucket={selectedBucket}
									selectedChannel={selectedChannel}
									selectedPlatform={selectedPlatform}
									selectedArch={selectedArch}
								/>
								<ExpectedFilesCard
									selectedChannel={selectedChannel}
									selectedPlatform={selectedPlatform}
									selectedArch={selectedArch}
								/>
							</div>
							{canManage && (
								<div class="grid gap-4 xl:grid-cols-2">
									<UploadFilesCard
										config={config}
										selectedBucket={selectedBucket}
										selectedChannel={selectedChannel}
										selectedPlatform={selectedPlatform}
										selectedArch={selectedArch}
										csrfToken={csrfToken}
									/>
									<ManifestCard
										config={config}
										selectedBucket={selectedBucket}
										selectedChannel={selectedChannel}
										selectedPlatform={selectedPlatform}
										selectedArch={selectedArch}
										csrfToken={csrfToken}
									/>
								</div>
							)}
							<VStack gap={3}>
								<div>
									<Heading level={3} size="base">
										Current files
									</Heading>
									<Text size="sm" color="muted">
										Files currently stored under{' '}
										<code class="font-mono">{buildDesktopReleasePrefix(selectedChannel, selectedPlatform, selectedArch)}</code>.
									</Text>
								</div>
								<EntriesTable
									config={config}
									selectedBucket={selectedBucket}
									selectedChannel={selectedChannel}
									selectedPlatform={selectedPlatform}
									selectedArch={selectedArch}
									entries={browseResult.entries}
								/>
							</VStack>
						</>
					)}
				</VStack>
			</PageLayout>
		</Layout>
	);
}
