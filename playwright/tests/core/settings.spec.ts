/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test, expect, prepareLoggedInUser, dismissUserSetup } from '../../fixtures/misskey';

// Stage 1: 設定画面が開く（基幹導線の死活）。
test.describe('core / settings', () => {
	test('settings page opens', async ({ page, request }) => {
		await prepareLoggedInUser(page, request);

		await page.goto('/settings');
		await dismissUserSetup(page); // 遷移先でウィザードを閉じる

		// desktop では既定サブページ（/settings/profile 等）へ遷移する
		await expect(page).toHaveURL(/\/settings(\/|$)/);

		// 設定ページのルート要素（安定リテラルクラス）が描画される
		await expect(page.locator('.vvcocwet')).toBeVisible({ timeout: 30_000 });
	});
});
