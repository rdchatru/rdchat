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

import type {MarketingContext} from '@fluxer/marketing/src/MarketingContext';

export const DOCS_BASE_URL = 'https://docs.fluxer.app';

export function cacheBustedWithVersion(path: string, version: string): string {
	const separator = path.includes('?') ? '&' : '?';
	return `${path}${separator}t=${version}`;
}

export function cacheBustedAsset(ctx: MarketingContext, path: string): string {
	return prependBasePath(ctx.basePath, cacheBustedWithVersion(path, ctx.assetVersion));
}

export function prependBasePath(basePath: string, path: string): string {
	if (!basePath) return path;
	return `${basePath}${path}`;
}

export function href(ctx: MarketingContext, path: string): string {
	return prependBasePath(ctx.basePath, path);
}

export function apiUrl(ctx: MarketingContext, path: string): string {
	return `${ctx.apiEndpoint}${path}`;
}

export function docsUrl(path = '/docs'): string {
	const url = new URL(path, `${DOCS_BASE_URL}/`);
	url.pathname = normalizeDocsPath(url.pathname);
	return url.toString();
}

export function docsUrlFromRequest(requestUrl: string): string {
	const requestUrlObject = new URL(requestUrl);
	const url = new URL(DOCS_BASE_URL);
	url.pathname = normalizeDocsPath(requestUrlObject.pathname);
	url.search = requestUrlObject.search;
	return url.toString();
}

export function isCanary(ctx: MarketingContext): boolean {
	return ctx.releaseChannel === 'canary';
}

export function normalizeBasePath(basePath: string): string {
	const segments = basePath
		.trim()
		.split('/')
		.filter((segment) => segment.length > 0);

	if (segments.length === 0) return '';
	return `/${segments.join('/')}`;
}

function normalizeDocsPath(path: string): string {
	const trimmed = path.trim();
	if (trimmed === '' || trimmed === '/' || trimmed === '/docs' || trimmed === '/docs/') {
		return '/';
	}

	const normalized = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
	if (normalized.startsWith('/docs/')) {
		return normalized.slice('/docs'.length);
	}

	return normalized;
}
