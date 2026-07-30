/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test, expect, prepareLoggedInUser, dismissUserSetup } from '../../fixtures/misskey';

// Stage 1: ノート投稿 → タイムライン反映（最ホットコアの happy-path）。
test.describe('core / note', () => {
	test.beforeEach(async ({ page, request }) => {
		await prepareLoggedInUser(page, request);
		// ログイン直後の home でウィザードを閉じる（この後 home 上で操作するため）
		await dismissUserSetup(page);
	});

	test('posting a note shows it on the timeline', async ({ page }) => {
		const body = 'Hello, Playwright e2e!';

		await expect(page.getByTestId('open-post-form')).toBeVisible({ timeout: 30_000 });
		await page.getByTestId('open-post-form').click();

		await page.getByTestId('post-form-text').fill(body);
		await page.getByTestId('post-form-submit').click();

		// 投稿がタイムラインに反映される
		await expect(page.getByText(body).first()).toBeVisible({ timeout: 15_000 });
	});
});
