/*
 * Copyright (C) 2026 RdChat Contributors
 *
 * This file is part of RdChat.
 *
 * RdChat is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * RdChat is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with RdChat. If not, see <https://www.gnu.org/licenses/>.
 */

/** @jsxRuntime automatic */
/** @jsxImportSource hono/jsx */

export interface PolicyMetadata {
	slug: string;
	title: string;
	description: string;
	category: string | null;
	lastUpdated: string;
}

export const POLICY_METADATA: ReadonlyArray<PolicyMetadata> = [
	{
		slug: 'terms',
		title: 'Terms of Service',
		description: 'The legal agreement between you and RdChat Open Project that governs your use of the platform.',
		category: 'Legal',
		lastUpdated: '2026-03-29',
	},
	{
		slug: 'privacy',
		title: 'Privacy Policy',
		description: 'How RdChat Open Project collects, uses, and protects your information when you use RdChat.',
		category: 'Legal',
		lastUpdated: '2026-03-29',
	},
	{
		slug: 'guidelines',
		title: 'Community Guidelines',
		description:
			'The rules and expectations for participating in the RdChat community. Help us keep RdChat safe and welcoming.',
		category: 'Community',
		lastUpdated: '2026-02-21',
	},
	{
		slug: 'security',
		title: 'Security Policy',
		description: 'Information about responsible disclosure and how to report security issues affecting RdChat.',
		category: 'Security',
		lastUpdated: '2026-03-29',
	},
	{
		slug: 'company-information',
		title: 'Company Information',
		description: 'Contact and organizational information for RdChat Open Project.',
		category: 'Legal',
		lastUpdated: '2026-03-29',
	},
];

export function getPolicyMetadata(slug: string): PolicyMetadata | null {
	return POLICY_METADATA.find((policy) => policy.slug === slug) ?? null;
}
