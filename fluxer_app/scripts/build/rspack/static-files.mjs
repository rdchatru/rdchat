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

import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {sources} from '@rspack/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MARKETING_WEB_DIR = path.resolve(__dirname, '../../../../packages/marketing/public/web');
const DESKTOP_ICONS_DIR = path.resolve(__dirname, '../../../../fluxer_desktop/build_resources/icons-stable');

const APPLE_TOUCH_ICON_PATH = path.join(MARKETING_WEB_DIR, 'apple-touch-icon.png');
const FAVICON_16_PATH = path.join(MARKETING_WEB_DIR, 'favicon-16x16.png');
const FAVICON_32_PATH = path.join(MARKETING_WEB_DIR, 'favicon-32x32.png');
const FAVICON_ICO_PATH = path.join(MARKETING_WEB_DIR, 'favicon.ico');
const PWA_ICON_256_PATH = path.join(DESKTOP_ICONS_DIR, '256x256.png');
const PWA_ICON_512_PATH = path.join(DESKTOP_ICONS_DIR, '512x512.png');
const TILE_ICON_150_PATH = path.join(DESKTOP_ICONS_DIR, 'Square150x150Logo.png');

function normalizeEndpoint(staticCdnEndpoint) {
	if (!staticCdnEndpoint) return '';
	return staticCdnEndpoint.endsWith('/') ? staticCdnEndpoint.slice(0, -1) : staticCdnEndpoint;
}

function generateManifest(staticCdnEndpointRaw) {
	const staticCdnEndpoint = normalizeEndpoint(staticCdnEndpointRaw);

	const manifest = {
		id: '/',
		name: 'RdChat',
		short_name: 'RdChat',
		description:
			'RdChat is a free and open source instant messaging and VoIP platform built for friends, groups, and communities.',
		start_url: '/channels/@me',
		display: 'standalone',
		orientation: 'portrait-primary',
		theme_color: '#638B6F',
		background_color: '#ffffff',
		categories: ['social', 'communication'],
		lang: 'en',
		scope: '/',
		icons: [
			{
				src: `${staticCdnEndpoint}/web/android-chrome-192x192.png`,
				sizes: '192x192',
				type: 'image/png',
			},
			{
				src: `${staticCdnEndpoint}/web/android-chrome-512x512.png`,
				sizes: '512x512',
				type: 'image/png',
			},
			{
				src: `${staticCdnEndpoint}/web/apple-touch-icon.png`,
				sizes: '180x180',
				type: 'image/png',
			},
			{
				src: `${staticCdnEndpoint}/web/favicon-32x32.png`,
				sizes: '32x32',
				type: 'image/png',
			},
			{
				src: `${staticCdnEndpoint}/web/favicon-16x16.png`,
				sizes: '16x16',
				type: 'image/png',
			},
		],
	};

	return JSON.stringify(manifest, null, 2);
}

function generateBrowserConfig(staticCdnEndpointRaw) {
	const staticCdnEndpoint = normalizeEndpoint(staticCdnEndpointRaw);

	return `<?xml version="1.0" encoding="utf-8"?>
<browserconfig>
  <msapplication>
    <tile>
      <square150x150logo src="${staticCdnEndpoint}/web/mstile-150x150.png"/>
      <TileColor>#638B6F</TileColor>
    </tile>
  </msapplication>
</browserconfig>`;
}

function generateRobotsTxt() {
	return 'User-agent: *\nAllow: /\n';
}

export class StaticFilesPlugin {
	constructor(options) {
		this.staticCdnEndpoint = options?.staticCdnEndpoint ?? '';
	}

	apply(compiler) {
		compiler.hooks.thisCompilation.tap('StaticFilesPlugin', (compilation) => {
			compilation.hooks.processAssets.tapPromise(
				{
					name: 'StaticFilesPlugin',
					stage: compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
				},
				async () => {
					const [
						appleTouchIcon,
						favicon16,
						favicon32,
						faviconIco,
						pwaIcon192,
						pwaIcon512,
						tileIcon150,
					] = await Promise.all([
						fs.readFile(APPLE_TOUCH_ICON_PATH),
						fs.readFile(FAVICON_16_PATH),
						fs.readFile(FAVICON_32_PATH),
						fs.readFile(FAVICON_ICO_PATH),
						sharp(PWA_ICON_256_PATH).resize(192, 192).png().toBuffer(),
						fs.readFile(PWA_ICON_512_PATH),
						fs.readFile(TILE_ICON_150_PATH),
					]);

					compilation.emitAsset('manifest.json', new sources.RawSource(generateManifest(this.staticCdnEndpoint)));
					compilation.emitAsset(
						'browserconfig.xml',
						new sources.RawSource(generateBrowserConfig(this.staticCdnEndpoint)),
					);
					compilation.emitAsset('robots.txt', new sources.RawSource(generateRobotsTxt()));
					compilation.emitAsset('web/apple-touch-icon.png', new sources.RawSource(appleTouchIcon));
					compilation.emitAsset('web/favicon-16x16.png', new sources.RawSource(favicon16));
					compilation.emitAsset('web/favicon-32x32.png', new sources.RawSource(favicon32));
					compilation.emitAsset('web/favicon.ico', new sources.RawSource(faviconIco));
					compilation.emitAsset('web/android-chrome-192x192.png', new sources.RawSource(pwaIcon192));
					compilation.emitAsset('web/android-chrome-512x512.png', new sources.RawSource(pwaIcon512));
					compilation.emitAsset('web/mstile-150x150.png', new sources.RawSource(tileIcon150));
				},
			);
		});
	}
}

export function staticFilesPlugin(options) {
	return new StaticFilesPlugin(options);
}
