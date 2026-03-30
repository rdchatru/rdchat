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

import {HttpStatus} from '@fluxer/constants/src/HttpConstants';
import type {BaseHonoEnv} from '@fluxer/hono_types/src/HonoTypes';
import {docsUrlFromRequest} from '@fluxer/marketing/src/UrlUtils';
import type {Logger} from '@fluxer/logger/src/Logger';
import {Hono} from 'hono';

export function createDocsApp(_options: {logger: Logger}): Hono<BaseHonoEnv> {
	const app = new Hono<BaseHonoEnv>();

	app.get('*', (c) => {
		return c.redirect(docsUrlFromRequest(c.req.url), HttpStatus.FOUND);
	});

	return app;
}
