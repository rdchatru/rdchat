/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
	docsSidebar: [
		{
			type: 'category',
			label: 'Getting started',
			items: ['index', 'quickstart', 'introduction/authentication'],
		},
		{
			type: 'category',
			label: 'API reference',
			items: ['api-reference/introduction', 'media-proxy-api/introduction', 'relay-api/introduction'],
		},
		{
			type: 'category',
			label: 'Gateway',
			items: [
				'gateway/overview',
				'gateway/connection_lifecycle',
				'gateway/opcodes',
				'gateway/close_codes',
				'gateway/events',
			],
		},
		{
			type: 'category',
			label: 'Topics',
			items: [
				'topics/snowflakes',
				'topics/error_codes',
				'topics/audit_log',
				'topics/rate_limits',
				'topics/permissions',
				'topics/voice',
				'topics/media_proxy',
				'topics/oauth2',
			],
		},
		{
			type: 'category',
			label: 'Resources',
			items: [
				'resources/overview',
				'resources/users',
				'resources/guilds',
				'resources/channels',
				'resources/invites',
				'resources/webhooks',
				'resources/oauth2',
				'resources/billing',
				'resources/premium',
				'resources/gifts',
				'resources/gateway',
				'resources/auth',
				'resources/instance',
				'resources/admin',
				'resources/search',
				'resources/themes',
				'resources/packs',
				'resources/klipy',
				'resources/saved_media',
				'resources/reports',
				'resources/read_states',
				'resources/media_proxy',
				'resources/common',
			],
		},
		{
			type: 'category',
			label: 'Self-hosting',
			items: [
				'self_hosting/overview',
				'self_hosting/quickstart',
				'self_hosting/configuration',
				'self_hosting/architecture',
				'self_hosting/voice',
				'self_hosting/upgrading',
			],
		},
	],
};

export default sidebars;
