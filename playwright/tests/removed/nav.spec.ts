/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test, expect, prepareLoggedInUser, dismissUserSetup } from '../../fixtures/misskey';

// Stage 2: 削除機能への UI 導線（ナビ項目 / プロフィールタブ）が残っていないことを保証する。
// navbar.ts から gallery/pages/achievements/games 等のエントリは除去済み、ユーザープロフィールの
// gallery/pages/achievements タブも撤去済み。href ベースでリンクの不在を機械保証する。

const REMOVED_LINK_HREFS = [
	'/gallery',
	'/pages',
	'/achievements',
	'/reversi',
	'/games',
	'/clicker',
	'/drop-and-fusion',
	'/my/favorites',
];

test.describe('removed / no UI entry points', () => {
	test.beforeEach(async ({ page, request }) => {
		await prepareLoggedInUser(page, request);
		await dismissUserSetup(page);
	});

	test('no nav / page links point to removed features', async ({ page }) => {
		// home 描画完了を待つ（ナビが揃ってから href を数える）
		await expect(page.getByTestId('open-post-form')).toBeVisible({ timeout: 30_000 });

		for (const href of REMOVED_LINK_HREFS) {
			// 完全一致と prefix（/gallery/edit 等）両方を弾く
			const exact = page.locator(`a[href="${href}"]`);
			const prefixed = page.locator(`a[href^="${href}/"]`);
			await expect(exact, `link to ${href} should not exist`).toHaveCount(0);
			await expect(prefixed, `link under ${href}/ should not exist`).toHaveCount(0);
		}
	});

	test('user profile has no gallery / pages / achievements tabs', async ({ page }) => {
		await page.goto('/@alice');
		// プロフィールページ描画を待つ（ユーザー名が出る）
		await expect(page.getByText('@alice').first()).toBeVisible({ timeout: 30_000 });

		// 削除機能のプロフィールタブ URL が存在しない
		for (const seg of ['gallery', 'pages', 'achievements']) {
			await expect(
				page.locator(`a[href^="/@alice/${seg}"]`),
				`profile tab ${seg} should not exist`,
			).toHaveCount(0);
		}
	});
});
