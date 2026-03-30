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

import {existsSync, readFileSync} from 'node:fs';
import {extname, join, normalize, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {HttpStatus} from '@fluxer/constants/src/HttpConstants';
import type {BaseHonoEnv} from '@fluxer/hono_types/src/HonoTypes';
import {Hono} from 'hono';

const DOCS_BUILD_DIR = fileURLToPath(new URL('../../../../fluxer_docs/build', import.meta.url));

const CONTENT_TYPES: Record<string, string> = {
	'.css': 'text/css; charset=utf-8',
	'.html': 'text/html; charset=utf-8',
	'.ico': 'image/x-icon',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.map': 'application/json; charset=utf-8',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
	'.txt': 'text/plain; charset=utf-8',
	'.webp': 'image/webp',
};

export function createDocsStaticApp(): Hono<BaseHonoEnv> {
	const app = new Hono<BaseHonoEnv>();

	app.get('*', (c) => {
		if (!existsSync(DOCS_BUILD_DIR)) {
			return c.text('Docs build is not available', HttpStatus.SERVICE_UNAVAILABLE);
		}

		const pathname = new URL(c.req.url).pathname;
		const filePath = resolveDocsFilePath(pathname);
		if (filePath === null) {
			return c.text('Not Found', HttpStatus.NOT_FOUND);
		}

		const content = readFileSync(filePath);
		const headers = new Headers({
			'Content-Type': getContentType(filePath),
			'Cache-Control': isHtmlFile(filePath) ? 'no-cache' : 'public, max-age=3600, must-revalidate',
			'X-Content-Type-Options': 'nosniff',
		});

		return new Response(content, {
			status: filePath.endsWith('404.html') ? HttpStatus.NOT_FOUND : HttpStatus.OK,
			headers,
		});
	});

	return app;
}

function resolveDocsFilePath(pathname: string): string | null {
	const relativePath = toDocsRelativePath(pathname);
	if (relativePath === null) {
		return null;
	}

	const normalizedPath = normalize(relativePath);
	const candidates = extname(normalizedPath)
		? [normalizedPath]
		: [join(normalizedPath, 'index.html'), `${normalizedPath}.html`];

	for (const candidate of candidates) {
		const resolvedCandidate = resolve(DOCS_BUILD_DIR, candidate);
		if (!resolvedCandidate.startsWith(DOCS_BUILD_DIR)) {
			continue;
		}

		if (existsSync(resolvedCandidate)) {
			return resolvedCandidate;
		}
	}

	const notFoundPath = resolve(DOCS_BUILD_DIR, 'docs/404.html');
	return existsSync(notFoundPath) ? notFoundPath : null;
}

function toDocsRelativePath(pathname: string): string | null {
	if (pathname === '/docs' || pathname === '/docs/') {
		return 'docs';
	}

	if (!pathname.startsWith('/docs/')) {
		return null;
	}

	return pathname.slice(1);
}

function getContentType(filePath: string): string {
	return CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

function isHtmlFile(filePath: string): boolean {
	return extname(filePath).toLowerCase() === '.html';
}
