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

import type {MarketingContext} from '@fluxer/marketing/src/MarketingContext';
import {apiUrl, docsUrl} from '@fluxer/marketing/src/UrlUtils';
import {describe, expect, test} from 'vitest';

describe('docsUrl', () => {
	test('normalises the local docs root path', () => {
		expect(docsUrl()).toBe('/docs');
		expect(docsUrl('/docs')).toBe('/docs');
	});

	test('prefixes deep links with the local docs base path', () => {
		expect(docsUrl('/docs/quickstart')).toBe('/docs/quickstart');
		expect(docsUrl('/resources/users?view=compact#examples')).toBe('/docs/resources/users?view=compact#examples');
	});
});

describe('apiUrl', () => {
	test('keeps the configured public API origin when it is already public', () => {
		expect(apiUrl(createContext({apiEndpoint: 'https://api.rdchat.ru'}), '/dl/android/arm64/rdchat.apk')).toBe(
			'https://api.rdchat.ru/dl/android/arm64/rdchat.apk',
		);
	});

	test('replaces a private API host with the public marketing host while preserving the API path', () => {
		expect(apiUrl(createContext({apiEndpoint: 'https://192.168.0.52/api'}), '/dl/desktop/stable/linux/x64/latest/appimage')).toBe(
			'https://rdchat.ru/api/dl/desktop/stable/linux/x64/latest/appimage',
		);
	});

	test('leaves the API host alone when both API and marketing hosts are private', () => {
		expect(
			apiUrl(
				createContext({
					baseUrl: 'https://192.168.0.10',
					apiEndpoint: 'https://192.168.0.52',
				}),
				'/dl/desktop/stable/linux/x64/latest/appimage',
			),
		).toBe('https://192.168.0.52/dl/desktop/stable/linux/x64/latest/appimage');
	});
});

function createContext(overrides: Partial<MarketingContext>): MarketingContext {
	return {
		locale: 'en',
		i18n: null as never,
		staticDirectory: '',
		baseUrl: 'https://rdchat.ru',
		countryCode: 'RU',
		apiEndpoint: 'https://api.rdchat.ru',
		appEndpoint: 'https://rdchat.ru/app',
		staticCdnEndpoint: 'https://static.rdchat.ru',
		assetVersion: 'test',
		basePath: '',
		platform: 'linux',
		architecture: 'x64',
		releaseChannel: 'stable',
		csrfToken: 'csrf',
		isDev: false,
		...overrides,
	};
}
