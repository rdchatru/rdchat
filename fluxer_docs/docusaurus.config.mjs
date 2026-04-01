/** @type {import('@docusaurus/types').Config} */
const config = {
	title: 'Fluxer Docs',
	tagline: 'Developer documentation for Fluxer',
	url: 'https://fluxer.app',
	baseUrl: '/docs/',
	favicon: 'favicon.svg',
	onBrokenLinks: 'warn',
	onBrokenAnchors: 'warn',
	markdown: {
		hooks: {
			onBrokenMarkdownLinks: 'warn',
		},
	},
	i18n: {
		defaultLocale: 'en',
		locales: ['en'],
	},
	presets: [
		[
			'classic',
			{
				docs: {
					path: '.',
					routeBasePath: '/',
					sidebarPath: './sidebars.mjs',
					include: ['**/*.md', '**/*.mdx'],
					exclude: [
						'build/**',
						'node_modules/**',
						'scripts/**',
						'src/**',
						'**/*.json',
						'**/*.png',
						'**/*.svg',
						'**/*.css',
					],
				},
				blog: false,
				pages: false,
				theme: {
					customCss: './src/css/custom.css',
				},
			},
		],
	],
	staticDirectories: ['static'],
	themeConfig: {
		image: 'https://static.rdchat.ru/marketing/branding/logo-color.svg',
		navbar: {
			title: 'Fluxer Docs',
			logo: {
				alt: 'Fluxer',
				src: 'https://static.rdchat.ru/marketing/branding/logo-color.svg',
				srcDark: 'https://static.rdchat.ru/marketing/branding/logo-white.svg',
				href: '/docs/',
			},
			items: [
				{
					type: 'docSidebar',
					sidebarId: 'docsSidebar',
					position: 'left',
					label: 'Documentation',
				},
				{
					href: 'https://github.com/rdchatru/rdchat',
					label: 'GitHub',
					position: 'right',
				},
				{
					href: 'https://web.rdchat.ru/channels/@me',
					label: 'Open RdChat',
					position: 'right',
				},
			],
		},
		footer: {
			style: 'dark',
			links: [
				{
					title: 'Resources',
					items: [
						{label: 'Help center', href: 'https://rdchat.ru/help'},
						{label: 'Donate', href: 'https://rdchat.ru/donate'},
						{label: 'Security', href: 'https://rdchat.ru/security'},
					],
				},
				{
					title: 'Project',
					items: [
						{label: 'Source code', href: 'https://github.com/rdchatru/rdchat'},
						{label: 'Support', href: 'mailto:support@rdchat.ru'},
					],
				},
			],
			copyright: `Copyright © ${new Date().getFullYear()} Fluxer Contributors`,
		},
		colorMode: {
			defaultMode: 'light',
			disableSwitch: false,
			respectPrefersColorScheme: true,
		},
	},
};

export default config;
