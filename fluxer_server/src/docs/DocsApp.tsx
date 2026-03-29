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

import {existsSync, readFileSync, statSync} from 'node:fs';
import {extname, join, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {serveStaticFile} from '@fluxer/app_proxy/src/app_server/utils/StaticFileUtils';
import {HttpStatus} from '@fluxer/constants/src/HttpConstants';
import {renderMarkdownWithBase} from '@fluxer/marketing/src/markdown/MarkdownRenderer';
import {getString, parseFrontmatter} from '@fluxer/marketing/src/markdown/MarkdownFrontmatter';
import type {BaseHonoEnv} from '@fluxer/hono_types/src/HonoTypes';
import type {Logger} from '@fluxer/logger/src/Logger';
import {Hono} from 'hono';

const DOCS_BASE_PATH = '/docs';
const DOCS_DIR = fileURLToPath(new URL('../../../fluxer_docs', import.meta.url));
const DOCS_STYLESHEET = `
:root {
	color-scheme: light;
	--docs-primary: #638B6F;
	--docs-primary-dark: #4F6D58;
	--docs-primary-light: #89A792;
	--docs-border: #d9e3dc;
	--docs-border-strong: #c2d1c7;
	--docs-muted: #5f6e64;
	--docs-text: #182019;
	--docs-surface: #ffffff;
	--docs-surface-muted: #f3f6f4;
	--docs-callout-note: #eef5ef;
	--docs-callout-warning: #fff4e4;
	--docs-shadow: 0 18px 50px rgba(24, 32, 25, 0.08);
}

* {
	box-sizing: border-box;
}

html {
	scroll-behavior: smooth;
}

body {
	margin: 0;
	font-family: "IBM Plex Sans", sans-serif;
	background: linear-gradient(180deg, #f4f8f5 0%, #eef4ef 100%);
	color: var(--docs-text);
}

a {
	color: var(--docs-primary-dark);
	text-decoration: none;
}

a:hover {
	text-decoration: underline;
}

.docs-shell {
	display: grid;
	grid-template-columns: minmax(260px, 300px) minmax(0, 1fr);
	min-height: 100vh;
}

.docs-sidebar {
	position: sticky;
	top: 0;
	height: 100vh;
	overflow-y: auto;
	border-right: 1px solid var(--docs-border);
	background: rgba(255, 255, 255, 0.94);
	backdrop-filter: blur(18px);
	padding: 1.75rem 1.25rem 2rem;
}

.docs-sidebar-inner {
	display: flex;
	flex-direction: column;
	gap: 1.5rem;
}

.docs-brand {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
	padding-bottom: 1rem;
	border-bottom: 1px solid var(--docs-border);
}

.docs-brand a {
	display: inline-flex;
	align-items: center;
	gap: 0.75rem;
	font-weight: 700;
	font-size: 1.15rem;
	color: var(--docs-text);
}

.docs-brand-mark {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 2.2rem;
	height: 2.2rem;
	border-radius: 0.9rem;
	background: linear-gradient(135deg, var(--docs-primary) 0%, var(--docs-primary-dark) 100%);
	color: white;
	font-weight: 700;
	letter-spacing: 0.04em;
}

.docs-brand-copy {
	color: var(--docs-muted);
	font-size: 0.95rem;
	line-height: 1.5;
}

.docs-sidebar-links {
	display: flex;
	gap: 0.75rem;
	flex-wrap: wrap;
}

.docs-sidebar-links a {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	padding: 0.55rem 0.85rem;
	border-radius: 999px;
	background: var(--docs-surface-muted);
	border: 1px solid var(--docs-border);
	font-weight: 600;
	font-size: 0.9rem;
}

.docs-nav {
	display: flex;
	flex-direction: column;
	gap: 1.25rem;
}

.docs-nav-section {
	display: flex;
	flex-direction: column;
	gap: 0.4rem;
}

.docs-nav-section h2 {
	margin: 0 0 0.25rem;
	font-size: 0.78rem;
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--docs-muted);
}

.docs-nav-link {
	display: block;
	padding: 0.55rem 0.7rem;
	border-radius: 0.9rem;
	font-size: 0.95rem;
	line-height: 1.35;
	color: var(--docs-muted);
}

.docs-nav-link:hover {
	background: var(--docs-surface-muted);
	color: var(--docs-text);
	text-decoration: none;
}

.docs-nav-link-active {
	background: rgba(99, 139, 111, 0.12);
	color: var(--docs-primary-dark);
	font-weight: 700;
}

.docs-main {
	min-width: 0;
}

.docs-topbar {
	position: sticky;
	top: 0;
	z-index: 10;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	padding: 1rem 1.5rem;
	background: rgba(244, 248, 245, 0.86);
	backdrop-filter: blur(18px);
	border-bottom: 1px solid rgba(194, 209, 199, 0.8);
}

.docs-topbar-path {
	font-size: 0.9rem;
	color: var(--docs-muted);
}

.docs-topbar-actions {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	flex-wrap: wrap;
}

.docs-topbar-action {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	padding: 0.65rem 1rem;
	border-radius: 999px;
	font-weight: 600;
	font-size: 0.9rem;
	border: 1px solid var(--docs-border);
	background: white;
	color: var(--docs-text);
	box-shadow: 0 8px 24px rgba(24, 32, 25, 0.05);
}

.docs-topbar-action-primary {
	background: linear-gradient(135deg, var(--docs-primary) 0%, var(--docs-primary-dark) 100%);
	border-color: transparent;
	color: white;
}

.docs-content-wrap {
	padding: 2rem 1.5rem 4rem;
}

.docs-content {
	max-width: 54rem;
	margin: 0 auto;
	padding: 2rem;
	border: 1px solid rgba(194, 209, 199, 0.75);
	border-radius: 1.6rem;
	background: rgba(255, 255, 255, 0.92);
	box-shadow: var(--docs-shadow);
}

.docs-title {
	margin: 0;
	font-family: "IBM Plex Sans", sans-serif;
	font-size: clamp(2.2rem, 4vw, 3rem);
	line-height: 1.05;
	letter-spacing: -0.03em;
}

.docs-description {
	margin: 1rem 0 2rem;
	max-width: 48rem;
	font-size: 1.05rem;
	line-height: 1.7;
	color: var(--docs-muted);
}

.docs-content-body {
	line-height: 1.75;
}

.docs-content-body p,
.docs-content-body ul,
.docs-content-body ol,
.docs-content-body blockquote,
.docs-content-body pre,
.docs-content-body table,
.docs-content-body details,
.docs-content-body .docs-figure,
.docs-content-body .docs-card,
.docs-content-body .docs-card-grid {
	margin: 0 0 1.35rem;
}

.docs-content-body h2,
.docs-content-body h3,
.docs-content-body h4,
.docs-content-body h5,
.docs-content-body h6 {
	margin: 2.3rem 0 0.9rem;
	line-height: 1.2;
	letter-spacing: -0.02em;
}

.docs-content-body h2 {
	font-size: 1.75rem;
}

.docs-content-body h3 {
	font-size: 1.35rem;
}

.docs-content-body h4,
.docs-content-body h5,
.docs-content-body h6 {
	font-size: 1.1rem;
}

.docs-content-body ul,
.docs-content-body ol {
	padding-left: 1.25rem;
}

.docs-content-body li + li {
	margin-top: 0.45rem;
}

.docs-content-body hr {
	border: 0;
	height: 1px;
	background: var(--docs-border);
}

.docs-content-body blockquote {
	padding: 0.9rem 1rem 0.9rem 1.1rem;
	border-left: 4px solid var(--docs-primary-light);
	background: var(--docs-surface-muted);
	border-radius: 0 1rem 1rem 0;
	color: var(--docs-muted);
}

.docs-content-body pre {
	overflow-x: auto;
	padding: 1rem 1.1rem;
	border-radius: 1rem;
	background: #0f1711;
	color: #f4f8f5;
}

.docs-content-body code {
	font-family: "IBM Plex Mono", monospace;
}

.docs-content-body table {
	width: 100%;
	border-collapse: collapse;
	overflow: hidden;
	border-radius: 1rem;
	border: 1px solid var(--docs-border);
}

.docs-content-body th,
.docs-content-body td {
	padding: 0.8rem 0.9rem;
	border-bottom: 1px solid var(--docs-border);
	text-align: left;
	vertical-align: top;
}

.docs-content-body th {
	background: var(--docs-surface-muted);
	font-weight: 700;
}

.docs-content-body tr:last-child td {
	border-bottom: 0;
}

.docs-content-body img {
	display: block;
	max-width: 100%;
	height: auto;
	border-radius: 1rem;
}

.docs-content-body .heading-anchor-container {
	position: relative;
	display: flex;
	align-items: center;
	gap: 0.6rem;
}

.docs-content-body .heading-anchor-link {
	opacity: 0;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 1.9rem;
	height: 1.9rem;
	border: 0;
	border-radius: 999px;
	background: rgba(99, 139, 111, 0.1);
	color: var(--docs-primary-dark);
	cursor: pointer;
	transition: opacity 0.18s ease, transform 0.18s ease, background 0.18s ease;
}

.docs-content-body .heading-anchor-container:hover .heading-anchor-link,
.docs-content-body .heading-anchor-link:focus-visible {
	opacity: 1;
}

.docs-content-body .heading-anchor-link:hover {
	background: rgba(99, 139, 111, 0.16);
	transform: translateY(-1px);
}

.docs-content-body .heading-anchor-link .check-icon {
	display: none;
}

.docs-content-body .heading-anchor-link.copied .link-icon {
	display: none;
}

.docs-content-body .heading-anchor-link.copied .check-icon {
	display: inline-flex;
}

.docs-callout {
	padding: 1rem 1.1rem;
	border-radius: 1rem;
	border: 1px solid var(--docs-border);
}

.docs-callout strong {
	display: inline-block;
	margin-bottom: 0.35rem;
}

.docs-callout-note {
	background: var(--docs-callout-note);
	border-color: rgba(99, 139, 111, 0.2);
}

.docs-callout-warning {
	background: var(--docs-callout-warning);
	border-color: rgba(214, 151, 64, 0.22);
}

.docs-expandable {
	border: 1px solid var(--docs-border);
	border-radius: 1rem;
	background: white;
	overflow: hidden;
}

.docs-expandable summary {
	cursor: pointer;
	padding: 0.95rem 1.1rem;
	font-weight: 700;
	background: var(--docs-surface-muted);
}

.docs-expandable-body {
	padding: 1rem 1.1rem;
}

.docs-figure {
	padding: 1rem;
	border-radius: 1.2rem;
	border: 1px solid var(--docs-border);
	background: white;
}

.docs-figure figcaption {
	margin-top: 0.85rem;
	font-size: 0.92rem;
	line-height: 1.6;
	color: var(--docs-muted);
}

.docs-card-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
	gap: 1rem;
}

.docs-card {
	display: block;
	padding: 1.1rem 1.15rem;
	border-radius: 1.2rem;
	border: 1px solid var(--docs-border);
	background: white;
	box-shadow: 0 10px 30px rgba(24, 32, 25, 0.05);
}

.docs-card:hover {
	transform: translateY(-1px);
	text-decoration: none;
}

.docs-card-title {
	margin: 0 0 0.45rem;
	font-size: 1rem;
	font-weight: 700;
	color: var(--docs-text);
}

.docs-card-body > :last-child {
	margin-bottom: 0;
}

.docs-not-found {
	max-width: 40rem;
	margin: 0 auto;
	padding: 5rem 1.5rem 3rem;
}

@media (max-width: 1024px) {
	.docs-shell {
		grid-template-columns: 1fr;
	}

	.docs-sidebar {
		position: static;
		height: auto;
		border-right: 0;
		border-bottom: 1px solid var(--docs-border);
	}
}

@media (max-width: 768px) {
	.docs-topbar {
		flex-direction: column;
		align-items: flex-start;
	}

	.docs-content-wrap {
		padding: 1.25rem 0.8rem 2.5rem;
	}

	.docs-content {
		padding: 1.2rem;
		border-radius: 1.2rem;
	}
}
`;
const DOCS_SCRIPT = `
document.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const button = target.closest('.heading-anchor-link');
  if (!(button instanceof HTMLElement)) return;

  const slug = button.getAttribute('data-anchor-link');
  if (!slug) return;

  const url = new URL(window.location.href);
  url.hash = slug;
  try {
    await navigator.clipboard.writeText(url.toString());
    button.classList.add('copied');
    window.setTimeout(() => button.classList.remove('copied'), 1400);
  } catch {
    window.location.hash = slug;
  }
});
`;

interface DocsConfig {
	name: string;
	navigation?: {
		tabs?: Array<DocsNavigationTab>;
	};
}

interface DocsNavigationTab {
	tab: string;
	groups?: Array<DocsNavigationGroup>;
	openapi?: string;
}

interface DocsNavigationGroup {
	group: string;
	pages: Array<string>;
}

interface DocsNavSection {
	title: string;
	items: Array<DocsNavItem>;
}

interface DocsNavItem {
	href: string;
	label: string;
	active: boolean;
}

interface DocsPageResult {
	pageId: string;
	filePath: string;
}

export function createDocsApp(options: {logger: Logger}): Hono<BaseHonoEnv> {
	const logger = options.logger.child({component: 'docs'});
	const app = new Hono<BaseHonoEnv>();

	app.get('*', async (c) => {
		const requestPath = stripDocsBasePath(new URL(c.req.url).pathname);
		const staticPath = resolveStaticFilePath(requestPath);
		if (staticPath) {
			return serveDocsStaticFile(logger, staticPath);
		}

		const page = resolveDocsPage(requestPath);
		if (!page) {
			return c.html(renderNotFoundPage(), HttpStatus.NOT_FOUND);
		}

		try {
			const config = loadDocsConfig();
			const source = readFileSync(page.filePath, 'utf-8');
			const frontmatter = parseFrontmatter(source);
			const title = getString(frontmatter, 'title') ?? humanizePageId(page.pageId);
			const description = getString(frontmatter, 'description') ?? `${title} documentation`;
			const bodyHtml = renderDocsMdx(frontmatter.content);
			const navSections = buildNavSections(config, page.pageId);

			return c.html(
				renderDocsDocument({
					title,
					description,
					bodyHtml,
					navSections,
					currentPath: page.pageId,
					appName: config.name || 'Fluxer',
				}),
			);
		} catch (error) {
			logger.error({error, requestPath, pageId: page.pageId}, 'Failed to render docs page');
			return c.text('Internal Server Error', HttpStatus.INTERNAL_SERVER_ERROR);
		}
	});

	return app;
}

function renderDocsDocument(options: {
	title: string;
	description: string;
	bodyHtml: string;
	navSections: Array<DocsNavSection>;
	currentPath: string;
	appName: string;
}): JSX.Element {
	const {title, description, bodyHtml, navSections, currentPath, appName} = options;

	return (
		<html lang="en">
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>{`${title} | ${appName} Docs`}</title>
				<meta name="description" content={description} />
				<meta name="theme-color" content="#638B6F" />
				<link rel="preconnect" href="https://static.rdchat.ru" />
				<link rel="stylesheet" href="https://static.rdchat.ru/fonts/ibm-plex.css" />
				<style dangerouslySetInnerHTML={{__html: DOCS_STYLESHEET}} />
				<script defer dangerouslySetInnerHTML={{__html: DOCS_SCRIPT}} />
			</head>
			<body>
				<div class="docs-shell">
					<aside class="docs-sidebar">
						<div class="docs-sidebar-inner">
							<div class="docs-brand">
								<a href="/docs">
									<span class="docs-brand-mark">R</span>
									<span>{appName} Docs</span>
								</a>
								<div class="docs-brand-copy">
									Self-hosting, API guides, schemas, and operational references for the Fluxer server stack.
								</div>
								<div class="docs-sidebar-links">
									<a href="/docs">Overview</a>
									<a href="https://github.com/fluxerapp/fluxer" target="_blank" rel="noopener noreferrer">
										Source
									</a>
								</div>
							</div>
							<nav class="docs-nav">
								{navSections.map((section) => (
									<div class="docs-nav-section" key={section.title}>
										<h2>{section.title}</h2>
										{section.items.map((item) => (
											<a
												key={item.href}
												href={item.href}
												class={`docs-nav-link${item.active ? ' docs-nav-link-active' : ''}`}
											>
												{item.label}
											</a>
										))}
									</div>
								))}
							</nav>
						</div>
					</aside>
					<div class="docs-main">
						<div class="docs-topbar">
							<div class="docs-topbar-path">{currentPath === 'index' ? 'Introduction' : currentPath}</div>
							<div class="docs-topbar-actions">
								<a class="docs-topbar-action" href="mailto:support@rdchat.ru">
									Support
								</a>
								<a class="docs-topbar-action docs-topbar-action-primary" href="/channels/@me">
									Open RdChat
								</a>
							</div>
						</div>
						<div class="docs-content-wrap">
							<article class="docs-content">
								<h1 class="docs-title">{title}</h1>
								<p class="docs-description">{description}</p>
								<div class="docs-content-body" dangerouslySetInnerHTML={{__html: bodyHtml}} />
							</article>
						</div>
					</div>
				</div>
			</body>
		</html>
	);
}

function renderNotFoundPage(): JSX.Element {
	return (
		<html lang="en">
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>Docs Not Found</title>
				<meta name="theme-color" content="#638B6F" />
				<style dangerouslySetInnerHTML={{__html: DOCS_STYLESHEET}} />
			</head>
			<body>
				<div class="docs-not-found">
					<h1 class="docs-title">Docs page not found</h1>
					<p class="docs-description">The page you requested does not exist in the bundled Fluxer docs set.</p>
					<a class="docs-topbar-action docs-topbar-action-primary" href="/docs">
						Back to docs
					</a>
				</div>
			</body>
		</html>
	);
}

function buildNavSections(config: DocsConfig, currentPageId: string): Array<DocsNavSection> {
	const tabs = config.navigation?.tabs ?? [];
	const sections: Array<DocsNavSection> = [];

	for (const tab of tabs) {
		if (tab.groups) {
			for (const group of tab.groups) {
				sections.push({
					title: group.group,
					items: group.pages.map((pageId) => ({
						href: docsHref(pageId),
						label: getDocsPageTitle(pageId),
						active: pageId === currentPageId,
					})),
				});
			}
			continue;
		}

		if (tab.openapi) {
			const introPageId = deriveOpenApiIntroPageId(tab.openapi);
			if (introPageId && getDocsPageFile(introPageId) !== null) {
				sections.push({
					title: 'References',
					items: [{href: docsHref(introPageId), label: tab.tab, active: introPageId === currentPageId}],
				});
			} else {
				sections.push({
					title: 'References',
					items: [{href: docsHref(tab.openapi), label: `${tab.tab} OpenAPI`, active: false}],
				});
			}
		}
	}

	return mergeDuplicateSections(sections);
}

function mergeDuplicateSections(sections: Array<DocsNavSection>): Array<DocsNavSection> {
	const merged = new Map<string, DocsNavSection>();

	for (const section of sections) {
		const existing = merged.get(section.title);
		if (!existing) {
			merged.set(section.title, {...section, items: [...section.items]});
			continue;
		}

		for (const item of section.items) {
			if (!existing.items.some((entry) => entry.href === item.href)) {
				existing.items.push(item);
			}
		}
	}

	return [...merged.values()];
}

function deriveOpenApiIntroPageId(openapiPath: string): string | null {
	const base = openapiPath.replace(/\/openapi\.json$/, '');
	if (base === 'api-reference') {
		return 'api-reference/introduction';
	}
	return null;
}

function loadDocsConfig(): DocsConfig {
	return JSON.parse(readFileSync(join(DOCS_DIR, 'docs.json'), 'utf-8')) as DocsConfig;
}

function getDocsPageTitle(pageId: string): string {
	const filePath = getDocsPageFile(pageId);
	if (!filePath) return humanizePageId(pageId);
	try {
		const source = readFileSync(filePath, 'utf-8');
		const frontmatter = parseFrontmatter(source);
		return getString(frontmatter, 'title') ?? humanizePageId(pageId);
	} catch {
		return humanizePageId(pageId);
	}
}

function getDocsPageFile(pageId: string): string | null {
	const resolved = resolveWithinDocs(`${pageId}.mdx`);
	if (!resolved || !existsSync(resolved) || !statSync(resolved).isFile()) {
		return null;
	}
	return resolved;
}

function stripDocsBasePath(pathname: string): string {
	if (pathname === DOCS_BASE_PATH) return '';
	if (!pathname.startsWith(`${DOCS_BASE_PATH}/`)) return pathname.replace(/^\/+/, '');
	return pathname.slice(DOCS_BASE_PATH.length + 1);
}

function resolveStaticFilePath(requestPath: string): string | null {
	const normalized = normalizeRequestPath(requestPath);
	if (!normalized) return null;

	const filePath = resolveWithinDocs(normalized);
	if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
		return null;
	}

	return extname(filePath) === '.mdx' ? null : normalized;
}

function resolveDocsPage(requestPath: string): DocsPageResult | null {
	const normalized = normalizeRequestPath(requestPath);
	const candidates = new Set<string>();

	if (!normalized) {
		candidates.add('index');
	} else {
		candidates.add(stripMdxExtension(normalized));
		candidates.add(normalized.replaceAll('-', '_'));
	}

	for (const candidate of candidates) {
		const filePath = getDocsPageFile(candidate);
		if (filePath) {
			return {pageId: candidate, filePath};
		}
	}

	return null;
}

function normalizeRequestPath(requestPath: string): string {
	return requestPath.replace(/^\/+/, '').replace(/\/+$/, '');
}

function stripMdxExtension(value: string): string {
	return value.endsWith('.mdx') ? value.slice(0, -4) : value;
}

function docsHref(path: string): string {
	if (path === 'index') return DOCS_BASE_PATH;
	if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('mailto:')) {
		return path;
	}
	if (path.startsWith(DOCS_BASE_PATH)) return path;
	return `${DOCS_BASE_PATH}/${path.replace(/^\/+/, '')}`;
}

function resolveWithinDocs(relativePath: string): string | null {
	const resolvedPath = resolve(DOCS_DIR, relativePath);
	const safeRoot = DOCS_DIR.endsWith(sep) ? DOCS_DIR : `${DOCS_DIR}${sep}`;
	if (resolvedPath !== DOCS_DIR && !resolvedPath.startsWith(safeRoot)) {
		return null;
	}
	return resolvedPath;
}

function serveDocsStaticFile(logger: Logger, requestPath: string): Response {
	const result = serveStaticFile({
		requestPath,
		resolvedStaticDir: DOCS_DIR,
		logger,
	});

	if (!result.success) {
		return new Response('Not Found', {status: HttpStatus.NOT_FOUND});
	}

	return new Response(result.content, {
		status: HttpStatus.OK,
		headers: {
			'Content-Type': result.mimeType,
			'Cache-Control': result.cacheControl,
			'X-Content-Type-Options': 'nosniff',
		},
	});
}

function renderDocsMdx(content: string): string {
	const placeholders = new Map<string, string>();
	let placeholderIndex = 0;

	const createPlaceholder = (html: string): string => {
		const token = `FLUXER_DOCS_COMPONENT_${placeholderIndex++}`;
		placeholders.set(token, html);
		return token;
	};

	let processed = content.replace(/\r\n/g, '\n').trim();

	processed = replaceComponentBlocks(processed, 'CardGroup', (_attributes, innerContent) => {
		const cards = extractCards(innerContent)
			.map((card) => renderCard(card.attributes, card.content))
			.join('');
		return createPlaceholder(`<div class="docs-card-grid">${cards}</div>`);
	});

	processed = replaceComponentBlocks(processed, 'Card', (attributes, innerContent) => {
		return createPlaceholder(renderCard(attributes, innerContent));
	});

	processed = replaceComponentBlocks(processed, 'Warning', (_attributes, innerContent) => {
		return createPlaceholder(renderCallout('Warning', 'docs-callout-warning', renderDocsMdx(innerContent)));
	});

	processed = replaceComponentBlocks(processed, 'Note', (_attributes, innerContent) => {
		return createPlaceholder(renderCallout('Note', 'docs-callout-note', renderDocsMdx(innerContent)));
	});

	processed = replaceComponentBlocks(processed, 'Expandable', (attributes, innerContent) => {
		const title = getAttributeValue(attributes, 'title') ?? 'Details';
		return createPlaceholder(renderExpandable(title, renderDocsMdx(innerContent)));
	});

	processed = replaceComponentBlocks(processed, 'Frame', (attributes, innerContent) => {
		const caption = getAttributeValue(attributes, 'caption');
		return createPlaceholder(renderFrame(renderDocsMdx(innerContent), caption));
	});

	processed = processed.replace(markdownImageRegex, (_match, alt, src) => {
		return createPlaceholder(renderImage(resolveDocsHref(src as string), alt as string));
	});

	let html = renderMarkdownWithBase(processed, DOCS_BASE_PATH, DOCS_BASE_PATH, {allowSectionReferences: true}, 'Copy link');
	for (const [token, replacement] of placeholders) {
		html = html.replaceAll(`<p>${token}</p>`, replacement);
		html = html.replaceAll(token, replacement);
	}

	return html;
}

function renderCard(attributes: string, innerContent: string): string {
	const title = getAttributeValue(attributes, 'title') ?? 'Untitled';
	const href = resolveDocsHref(getAttributeValue(attributes, 'href') ?? DOCS_BASE_PATH);
	const body = renderDocsMdx(innerContent);
	return `<a class="docs-card" href="${escapeHtmlAttribute(href)}"><h3 class="docs-card-title">${escapeHtml(title)}</h3><div class="docs-card-body">${body}</div></a>`;
}

function renderCallout(title: string, className: string, bodyHtml: string): string {
	return `<div class="docs-callout ${className}"><strong>${escapeHtml(title)}</strong><div>${bodyHtml}</div></div>`;
}

function renderExpandable(title: string, bodyHtml: string): string {
	return `<details class="docs-expandable"><summary>${escapeHtml(title)}</summary><div class="docs-expandable-body">${bodyHtml}</div></details>`;
}

function renderFrame(bodyHtml: string, caption: string | null): string {
	const captionHtml = caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : '';
	return `<figure class="docs-figure">${bodyHtml}${captionHtml}</figure>`;
}

function renderImage(src: string, alt: string): string {
	return `<figure class="docs-figure"><img src="${escapeHtmlAttribute(src)}" alt="${escapeHtmlAttribute(alt)}" loading="lazy" /></figure>`;
}

function replaceComponentBlocks(
	content: string,
	tagName: string,
	renderer: (attributes: string, innerContent: string) => string,
): string {
	const regex = new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, 'g');
	return content.replace(regex, (_match, attributes, innerContent) => {
		return `\n${renderer((attributes as string) ?? '', (innerContent as string) ?? '')}\n`;
	});
}

function extractCards(content: string): Array<{attributes: string; content: string}> {
	const cards: Array<{attributes: string; content: string}> = [];
	const regex = /<Card\b([^>]*)>([\s\S]*?)<\/Card>/g;
	for (const match of content.matchAll(regex)) {
		cards.push({
			attributes: match[1] ?? '',
			content: match[2] ?? '',
		});
	}
	return cards;
}

function getAttributeValue(attributes: string, name: string): string | null {
	const regex = new RegExp(`${name}=(?:"([^"]*)"|'([^']*)'|\\{([^}]*)\\})`);
	const match = attributes.match(regex);
	if (!match) return null;
	return (match[1] ?? match[2] ?? match[3] ?? '').trim();
}

function resolveDocsHref(href: string): string {
	if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:') || href.startsWith('#')) {
		return href;
	}
	if (href.startsWith(DOCS_BASE_PATH)) return href;
	if (href.startsWith('/')) return `${DOCS_BASE_PATH}${href}`;
	return href;
}

function humanizePageId(pageId: string): string {
	const leaf = pageId.split('/').pop() ?? pageId;
	return leaf
		.replaceAll('_', ' ')
		.replaceAll('-', ' ')
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function escapeHtmlAttribute(value: string): string {
	return escapeHtml(value);
}

const markdownImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
