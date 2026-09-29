import { defineConfig } from 'vitepress';

const targetVersion = '2026.9.1-endolphin.0';

export default defineConfig({
	title: 'Endolphin',
	description: '小規模コミュニティ向け Misskey fork Endolphin の利用者・運用者向けドキュメント',
	lang: 'ja-JP',
	base: '/endolphin/',
	cleanUrls: true,
	srcExclude: ['README.md'],
	themeConfig: {
		nav: [
			{ text: 'Endolphin について', link: '/guide/about' },
			{ text: '機能', link: '/guide/features' },
			{ text: '本家との違い', link: '/guide/differences' },
			{ text: 'サーバー運用', link: '/setup/' },
		],
		sidebar: [
			{
				text: 'はじめに',
				items: [
					{ text: 'Endolphin について', link: '/guide/about' },
					{ text: '本家 Misskey との違い', link: '/guide/differences' },
				],
			},
			{
				text: '利用者向け',
				items: [{ text: '機能一覧', link: '/guide/features' }],
			},
			{
				text: 'サーバー運用者向け',
				items: [
					{ text: '構築ガイド', link: '/setup/' },
					{ text: 'systemd で構築', link: '/setup/systemd' },
					{ text: 'Docker で構築', link: '/setup/docker' },
					{ text: '運用・保守', link: '/setup/operations' },
				],
			},
		],
		search: {
			provider: 'local',
		},
		editLink: {
			pattern: 'https://github.com/tiramiss-community/endolphin/edit/develop/docs/site/:path',
			text: 'このページを編集する',
		},
		footer: {
			message: `対象リリース: ${targetVersion}`,
			copyright: 'Powered by VitePress',
		},
	},
});
