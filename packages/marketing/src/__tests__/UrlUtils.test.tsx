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

import {docsUrl} from '@fluxer/marketing/src/UrlUtils';
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
