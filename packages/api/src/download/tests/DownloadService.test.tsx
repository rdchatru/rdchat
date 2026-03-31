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

import {Readable} from 'node:stream';
import {Config} from '@fluxer/api/src/Config';
import {DownloadService} from '@fluxer/api/src/download/DownloadService';
import {MockStorageService} from '@fluxer/api/src/test/mocks/MockStorageService';
import {beforeEach, describe, expect, it, vi} from 'vitest';

function buildManifest(dmg: string): string {
	return JSON.stringify({
		channel: 'stable',
		platform: 'darwin',
		arch: 'x64',
		version: '0.0.8',
		pub_date: '2026-01-06T01:03:26Z',
		files: {
			setup: '',
			dmg,
			zip: '',
			appimage: '',
			deb: '',
			rpm: '',
			tar_gz: '',
		},
	});
}

describe('DownloadService.resolveLatestDesktopRedirect', () => {
	let storageService: MockStorageService;
	let downloadService: DownloadService;

	beforeEach(() => {
		storageService = new MockStorageService();
		downloadService = new DownloadService(storageService);
	});

	it('falls back to x64 artefact when manifest points to arm64 file', async () => {
		const manifestKey = 'desktop/stable/darwin/x64/manifest.json';
		const manifestBody = buildManifest('fluxer-stable-0.0.8-arm64.dmg');

		vi.spyOn(storageService, 'streamObject').mockImplementation(async (params) => {
			if (params.key !== manifestKey) {
				return null;
			}

			return {
				body: Readable.from([Buffer.from(manifestBody, 'utf-8')]),
				contentLength: manifestBody.length,
				contentType: 'application/json',
			};
		});

		const listObjects = vi
			.spyOn(storageService, 'listObjects')
			.mockResolvedValue([
				{key: 'desktop/stable/darwin/x64/fluxer-stable-0.0.8-arm64.dmg'},
				{key: 'desktop/stable/darwin/x64/fluxer-stable-0.0.8-x64.dmg'},
			]);

		const result = await downloadService.resolveLatestDesktopRedirect({
			channel: 'stable',
			plat: 'darwin',
			arch: 'x64',
			format: 'dmg',
			host: 'api.rdchat.ru',
			forwardedProto: 'https',
			requestUrl: 'https://api.rdchat.ru/dl/desktop/stable/darwin/x64/latest/dmg',
		});

		expect(result).toBe('https://api.rdchat.ru/dl/desktop/stable/darwin/x64/fluxer-stable-0.0.8-x64.dmg');
		expect(listObjects).toHaveBeenCalledTimes(1);
	});

	it('uses manifest filename directly when architecture already matches', async () => {
		const manifestKey = 'desktop/stable/darwin/x64/manifest.json';
		const manifestBody = buildManifest('fluxer-stable-0.0.8-x64.dmg');

		vi.spyOn(storageService, 'streamObject').mockImplementation(async (params) => {
			if (params.key !== manifestKey) {
				return null;
			}

			return {
				body: Readable.from([Buffer.from(manifestBody, 'utf-8')]),
				contentLength: manifestBody.length,
				contentType: 'application/json',
			};
		});

		const result = await downloadService.resolveLatestDesktopRedirect({
			channel: 'stable',
			plat: 'darwin',
			arch: 'x64',
			format: 'dmg',
			host: 'api.rdchat.ru',
			forwardedProto: 'https',
			requestUrl: 'https://api.rdchat.ru/dl/desktop/stable/darwin/x64/latest/dmg',
		});

		expect(result).toBe('https://api.rdchat.ru/dl/desktop/stable/darwin/x64/fluxer-stable-0.0.8-x64.dmg');
		expect(storageService.listObjectsSpy).not.toHaveBeenCalled();
	});

	it('falls back to the configured public API host when the request host is private', async () => {
		const manifestKey = 'desktop/stable/darwin/x64/manifest.json';
		const manifestBody = buildManifest('fluxer-stable-0.0.8-x64.dmg');

		vi.spyOn(storageService, 'streamObject').mockImplementation(async (params) => {
			if (params.key !== manifestKey) {
				return null;
			}

			return {
				body: Readable.from([Buffer.from(manifestBody, 'utf-8')]),
				contentLength: manifestBody.length,
				contentType: 'application/json',
			};
		});

		const result = await downloadService.resolveLatestDesktopRedirect({
			channel: 'stable',
			plat: 'darwin',
			arch: 'x64',
			format: 'dmg',
			host: '192.168.0.52',
			forwardedProto: 'https',
			requestUrl: 'https://192.168.0.52/dl/desktop/stable/darwin/x64/latest/dmg',
		});

		expect(result).toBe(
			`https://${new URL(Config.endpoints.apiPublic).host}/dl/desktop/stable/darwin/x64/fluxer-stable-0.0.8-x64.dmg`,
		);
	});
});

describe('DownloadService.resolveDownloadRedirect', () => {
	let storageService: MockStorageService;
	let downloadService: DownloadService;

	beforeEach(() => {
		storageService = new MockStorageService();
		downloadService = new DownloadService(storageService);
	});

	it('accepts download paths mounted under /api', async () => {
		const key = 'desktop/stable/linux/x64/fluxer-stable-0.0.18-x86_64.AppImage';
		await storageService.uploadObject({
			bucket: Config.s3.buckets.downloads,
			key,
			body: new TextEncoder().encode('appimage'),
			contentType: 'application/octet-stream',
		});

		const result = await downloadService.resolveDownloadRedirect({
			path: `/api/dl/${key}`,
		});

		expect(result).toBe('https://presigned.url/test');
		expect(storageService.getPresignedDownloadURLSpy).toHaveBeenCalledWith({
			bucket: Config.s3.buckets.downloads,
			key,
		});
	});
});

describe('DownloadService.streamDownload', () => {
	let storageService: MockStorageService;
	let downloadService: DownloadService;

	beforeEach(() => {
		storageService = new MockStorageService();
		downloadService = new DownloadService(storageService);
	});

	it('streams files from mounted /api download paths', async () => {
		const key = 'desktop/stable/linux/x64/fluxer-stable-0.0.18-x86_64.AppImage';
		await storageService.uploadObject({
			bucket: Config.s3.buckets.downloads,
			key,
			body: new TextEncoder().encode('appimage'),
			contentType: 'application/octet-stream',
		});

		const result = await downloadService.streamDownload({
			path: `/api/dl/${key}`,
		});

		expect(result?.key).toBe(key);
		expect(result?.contentType).toBe('application/octet-stream');
		const text = await new Response(Readable.toWeb(result!.body) as ReadableStream).text();
		expect(text).toBe('appimage');
	});

	it('passes range requests through to storage', async () => {
		const key = 'desktop/stable/linux/x64/fluxer-stable-0.0.18-x86_64.AppImage';
		await storageService.uploadObject({
			bucket: Config.s3.buckets.downloads,
			key,
			body: new TextEncoder().encode('abcdef'),
			contentType: 'application/octet-stream',
		});

		const result = await downloadService.streamDownload({
			path: `/dl/${key}`,
			range: 'bytes=1-3',
		});

		expect(result?.contentRange).toBe('bytes 1-3/6');
		const text = await new Response(Readable.toWeb(result!.body) as ReadableStream).text();
		expect(text).toBe('bcd');
	});
});
