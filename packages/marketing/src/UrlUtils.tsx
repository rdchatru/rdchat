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

export const DOCS_BASE_URL = '/docs';

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
	return `${resolvePublicApiBase(ctx)}${path}`;
}

export function docsUrl(path = '/docs'): string {
	return normalizeDocsPublicPath(path);
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

function normalizeDocsPublicPath(path: string): string {
	const trimmed = path.trim();
	if (trimmed === '' || trimmed === '/' || trimmed === '/docs' || trimmed === '/docs/') {
		return DOCS_BASE_URL;
	}

	const normalized = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
	if (normalized.startsWith('/docs/')) {
		return normalized;
	}

	return `${DOCS_BASE_URL}${normalized}`;
}

function resolvePublicApiBase(ctx: MarketingContext): string {
	const normalizedApiEndpoint = trimTrailingSlash(ctx.apiEndpoint);
	const apiEndpointUrl = tryParseUrl(normalizedApiEndpoint);
	if (!apiEndpointUrl || !isLocalOrPrivateHostname(apiEndpointUrl.hostname)) {
		return normalizedApiEndpoint;
	}

	const marketingBaseUrl = tryParseUrl(ctx.baseUrl);
	if (!marketingBaseUrl || isLocalOrPrivateHostname(marketingBaseUrl.hostname)) {
		return normalizedApiEndpoint;
	}

	const apiPath = apiEndpointUrl.pathname === '/' ? '' : trimTrailingSlash(apiEndpointUrl.pathname);
	return `${marketingBaseUrl.protocol}//${marketingBaseUrl.host}${apiPath}`;
}

function tryParseUrl(rawUrl: string): URL | null {
	try {
		return new URL(rawUrl);
	} catch {
		return null;
	}
}

function trimTrailingSlash(value: string): string {
	return value.endsWith('/') ? value.slice(0, -1) : value;
}

function isLocalOrPrivateHostname(hostname: string): boolean {
	const normalizedHostname = hostname.toLowerCase().replace(/^\[(.*)\]$/u, '$1');
	if (normalizedHostname === 'localhost' || normalizedHostname.endsWith('.localhost')) {
		return true;
	}
	return isPrivateOrSpecialIpv4(normalizedHostname) || isPrivateOrSpecialIpv6(normalizedHostname);
}

function isPrivateOrSpecialIpv4(hostname: string): boolean {
	if (!/^\d+\.\d+\.\d+\.\d+$/u.test(hostname)) {
		return false;
	}

	const octets = hostname.split('.').map((part) => Number(part));
	if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
		return true;
	}

	const [first, second] = octets;
	if (first === 0 || first === 10 || first === 127) return true;
	if (first === 169 && second === 254) return true;
	if (first === 172 && second >= 16 && second <= 31) return true;
	if (first === 192 && second === 168) return true;
	if (first === 100 && second >= 64 && second <= 127) return true;
	if (first === 198 && (second === 18 || second === 19)) return true;
	if (first >= 224) return true;
	return false;
}

function isPrivateOrSpecialIpv6(hostname: string): boolean {
	if (!hostname.includes(':')) {
		return false;
	}

	const lower = hostname.toLowerCase();
	if (lower === '::' || lower === '::1') {
		return true;
	}

	if (lower.startsWith('::ffff:')) {
		return isPrivateOrSpecialIpv4(lower.slice('::ffff:'.length));
	}

	if (lower.startsWith('fe80:')) return true;
	if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
	if (lower.startsWith('ff')) return true;
	return false;
}
