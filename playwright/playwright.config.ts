/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// endolphin fork 所有の e2e リグ。upstream の cypress/ は触らない（docs/endolphin/playwright-e2e.md 参照）。
const ROOT = path.resolve(__dirname, '..');
const BASE_URL = 'http://localhost:61812';

export default defineConfig({
	testDir: path.join(__dirname, 'tests'),
	globalSetup: path.join(__dirname, 'global-setup.ts'),
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
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
	],
	// 案1（起動/終了サイクルにアプリを乗せる）: start:test を spawn し :61812 を待つ。
	// start:test は無改変で呼ぶだけ（.github/misskey/test.yml をそのまま読む）。
	webServer: {
		command: 'pnpm start:test',
		cwd: ROOT,
		url: BASE_URL,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000,
		stdout: 'pipe',
		stderr: 'pipe',
	},
});
