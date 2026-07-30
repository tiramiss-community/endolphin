/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// endolphin fork 所有の e2e リグ。upstream の frontend e2e は触らない（docs/endolphin/playwright-e2e.md 参照）。
const ROOT = path.resolve(__dirname, '..');
const BASE_URL = 'http://localhost:61812';

export default defineConfig({
	testDir: path.join(__dirname, 'tests'),
	globalTeardown: path.join(__dirname, 'global-teardown.ts'),
	// テスト用 Misskey は単一インスタンスを共有するため直列実行する
	fullyParallel: false,
	workers: 1,
	timeout: 60_000,
	expect: { timeout: 10_000 },
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI
		? [['github'], ['html', { open: 'never' }]]
		: [['list']],
	use: {
		baseURL: BASE_URL,
		trace: 'on-first-retry',
		video: 'on-first-retry',
		screenshot: 'only-on-failure',
	},
	projects: [
		// locale を固定して i18n テキストベースのセレクタを決定的にする（data-testid が無い画面用）
		{ name: 'chromium', use: { ...devices['Desktop Chrome'], locale: 'en-US' } },
	],
	// 案1+2: 先に compose で infra を上げ（Playwright は webServer を globalSetup より先に
	// 起動するため、DB 依存の start:test より前に compose を確実に上げる必要がある）、続けて
	// 無改変の start:test を spawn して :61812 を待つ。compose 撤去は globalTeardown が行う。
	// PW_SKIP_COMPOSE=1 で compose 起動をスキップ（外部 pg/redis 利用時）。
	webServer: {
		command: '[ -n "$PW_SKIP_COMPOSE" ] || docker compose -f playwright/compose.test.yml up -d --wait && pnpm start:test',
		cwd: ROOT,
		url: BASE_URL,
		reuseExistingServer: !process.env.CI,
		timeout: 240_000,
		stdout: 'pipe',
		stderr: 'pipe',
	},
});
