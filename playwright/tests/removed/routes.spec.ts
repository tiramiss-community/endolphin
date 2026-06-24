/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test, expect, resetDb, setupInstance } from '../../fixtures/misskey';

// Stage 2: 削除機能のルートが復活していない（catch-all = not-found に落ちる）ことを UI で機械保証する。
// endolphin は削除済みページ .vue を物理削除し router からも除いているため、これらの URL は
// not-found ページ（MkResult type="notFound"）を描画する。本家実装が誤って戻ると即検知できる。
//
// locale は en-US 固定（playwright.config.ts）なので英語の not-found 文言で assert する。
const NOT_FOUND_TEXT = 'No page corresponding to this URL could be found.';

// 削除機能のトップ導線 URL（feature-inventory.md の remove 一覧に対応）。
const REMOVED_ROUTES = [
	'/gallery',
	'/pages',
	'/my/favorites',
	'/achievements',
	'/reversi',
	'/games',
	'/clicker',
	'/drop-and-fusion',
];

test.describe('removed / routes resolve to not-found', () => {
	test.beforeAll(async ({ request }) => {
		// not-found ページの描画にインスタンスのセットアップは不要だが、未初期化だと
		// welcome/setup へ飛ぶ環境差を避けるため初期管理者だけ作っておく。
		await resetDb(request);
		await setupInstance(request);
	});

	for (const route of REMOVED_ROUTES) {
		test(`${route} renders not-found`, async ({ page }) => {
			await page.goto(route);
			await expect(page.getByText(NOT_FOUND_TEXT)).toBeVisible({ timeout: 30_000 });
		});
	}
});
