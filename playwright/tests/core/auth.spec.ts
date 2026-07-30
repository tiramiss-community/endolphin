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
		await page.getByTestId('signup').click();

		// 利用規約への同意
		await page.getByTestId('signup-rules-notes-agree').getByTestId('switch-toggle').click();
		await page.getByTestId('modal-dialog-ok').click();
		await page.getByTestId('signup-rules-continue').click();

		// アカウント情報
		await page.getByTestId('signup-username').locator('input').fill('bob');
		await page.getByTestId('signup-password').locator('input').fill('bob12345');
		await page.getByTestId('signup-password-retype').locator('input').fill('bob12345');

		await Promise.all([
			page.waitForResponse((r) => r.url().includes('/api/signup') && r.request().method() === 'POST'),
			page.getByTestId('signup-submit').click(),
		]);

		// サインアップ成功なら初期設定ウィザードが開く
		await expect(page.getByTestId('user-setup-continue')).toBeVisible({ timeout: 30_000 });
	});

	test('registered user can sign in via UI', async ({ page, request }) => {
		await setupInstance(request);
		await registerUser(request, 'alice', 'alice1234');

		await login(page, 'alice', 'alice1234');

		// 新規ユーザーはサインイン直後に初期設定ウィザードが出る = サインイン成功の証左
		await expect(page.getByTestId('user-setup-continue')).toBeVisible({ timeout: 30_000 });
	});
});
