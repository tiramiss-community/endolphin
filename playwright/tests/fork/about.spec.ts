/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test, expect, resetDb, setupInstance } from '../../fixtures/misskey';

// Stage 3: fork 自作の低 churn 画面。/about-misskey は endolphin が Endolphin / Misskey の
// 2 タブ構成に再編した fork 固有 UI（CHANGELOG-endolphin: about ページ 2 タブ化）。
// （`/about` はインスタンス情報ページで別物。fork 固有のタブ UI は `/about-misskey`）
// upstream 追従に巻き込まれない純粋な fork 価値として品質を固定する。

test.describe('fork / about page', () => {
	test.beforeAll(async ({ request }) => {
		await resetDb(request);
		await setupInstance(request);
	});

	test('about-misskey shows the Endolphin tab with a source link', async ({ page }) => {
		await page.goto('/about-misskey');

		// Endolphin タブ（既定アクティブ）の wordmark
		await expect(page.getByRole('heading', { name: 'Endolphin' }).first())
			.toBeVisible({ timeout: 30_000 });

		// Endolphin タブのソースコードリンクが endolphin リポジトリを指す
		await expect(page.locator('a[href="https://github.com/tiramiss-community/endolphin"]'))
			.toBeVisible({ timeout: 15_000 });
		// fork メンバー（@samunohito）の導線も Endolphin タブ固有
		await expect(page.locator('a[href="https://github.com/samunohito"]').first())
			.toBeVisible({ timeout: 15_000 });
	});

	test('can switch to the Misskey tab', async ({ page }) => {
		await page.goto('/about-misskey');
		await expect(page.getByRole('heading', { name: 'Endolphin' }).first())
			.toBeVisible({ timeout: 30_000 });

		// タブヘッダのタイトルはハードコード（'Endolphin' / 'Misskey'）で locale 非依存に安定。
		// PageWithHeader のタブ（button）をクリックして Misskey タブへ切替える。
		await page.getByRole('button', { name: 'Misskey', exact: true }).first().click();

		// Misskey タブ固有の内容（misskey-hub.net への外部リンク）が描画される
		await expect(page.locator('a[href*="misskey-hub.net"]').first())
			.toBeVisible({ timeout: 15_000 });
	});
});
