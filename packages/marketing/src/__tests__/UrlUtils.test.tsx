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

import {docsUrl, docsUrlFromRequest} from '@fluxer/marketing/src/UrlUtils';
import {describe, expect, test} from 'vitest';

describe('docsUrl', () => {
	test('maps the local docs root to the Mintlify docs host', () => {
		expect(docsUrl()).toBe('https://docs.fluxer.app/');
		expect(docsUrl('/docs')).toBe('https://docs.fluxer.app/');
	});

	test('preserves deep links, queries, and hashes', () => {
		expect(docsUrl('/docs/quickstart')).toBe('https://docs.fluxer.app/quickstart');
		expect(docsUrl('/docs/resources/users?view=compact#examples')).toBe(
			'https://docs.fluxer.app/resources/users?view=compact#examples',
		);
	});
});

describe('docsUrlFromRequest', () => {
	test('rewrites incoming docs requests to the Mintlify host', () => {
		expect(docsUrlFromRequest('https://fluxer.app/docs/gateway/events?tab=payload')).toBe(
			'https://docs.fluxer.app/gateway/events?tab=payload',
		);
	});
});
