/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test, expect, resetDb, setupInstance, registerUser, login } from '../../fixtures/misskey';

// Stage 1: 認証の happy-path（endolphin が絶対壊してはいけない基幹フロー）。
test.describe('core / auth', () => {
	test.beforeEach(async ({ request }) => {
		await resetDb(request);
	});

	test('user can sign up via UI and lands on the setup wizard', async ({ page, request }) => {
		const admin = await setupInstance(request);
		// 登録を開放（招待不要にする）。既定で開放済みでも no-op。
		await request.post('/api/admin/update-meta', { data: { i: admin.token, disableRegistration: false } });

		await page.goto('/');
		await page.locator('[data-cy-signup]').click();

		// 利用規約への同意
		await page.locator('[data-cy-signup-rules-notes-agree] [data-cy-switch-toggle]').click();
		await page.locator('[data-cy-modal-dialog-ok]').click();
		await page.locator('[data-cy-signup-rules-continue]').click();

		// アカウント情報
		await page.locator('[data-cy-signup-username] input').fill('bob');
		await page.locator('[data-cy-signup-password] input').fill('bob12345');
		await page.locator('[data-cy-signup-password-retype] input').fill('bob12345');

		await Promise.all([
			page.waitForResponse((r) => r.url().includes('/api/signup') && r.request().method() === 'POST'),
			page.locator('[data-cy-signup-submit]').click(),
		]);

		// サインアップ成功なら初期設定ウィザードが開く
		await expect(page.locator('[data-cy-user-setup-continue]')).toBeVisible({ timeout: 30_000 });
	});

	test('registered user can sign in via UI', async ({ page, request }) => {
		await setupInstance(request);
		await registerUser(request, 'alice', 'alice1234');

		await login(page, 'alice', 'alice1234');

		// 新規ユーザーはサインイン直後に初期設定ウィザードが出る = サインイン成功の証左
		await expect(page.locator('[data-cy-user-setup-continue]')).toBeVisible({ timeout: 30_000 });
	});
});
