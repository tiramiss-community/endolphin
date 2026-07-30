/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test, expect, resetDb, setupInstance, registerUser, login, dismissUserSetup, callApi, expectFeatureRemoved } from '../../fixtures/misskey';

// Stage 2: 削除コントラクトを踏んだ直後でも基幹（投稿 → TL 反映）が回ることの回帰。
// 「機能を削っても基幹が壊れない」を 1 本のシナリオで担保する。

test.describe('removed / core still works after touching removed features', () => {
	test('posting works right after hitting removed read+write stubs', async ({ page, request }) => {
		await resetDb(request);
		await setupInstance(request);
		const user = await registerUser(request, 'alice', 'alice1234');
		await login(page, 'alice', 'alice1234');

		// 削除機能の read（空）と write（410）を一通り叩く。例外/500 で落ちないこと自体が回帰検証。
		const gallery = await callApi(request, 'gallery/featured');
		expect(gallery.status).toBe(200);
		expect(gallery.body).toEqual([]);

		// write stub は requireCredential が先に効くため token 必須（無トークンだと 401）。
		await expectFeatureRemoved(request, 'gallery/posts/create', user.token, { title: 't', fileIds: ['x'] });

		// 基幹: ノート投稿 → TL 反映が依然として動く
		await dismissUserSetup(page);
		const body = 'core survives removal';
		await expect(page.getByTestId('open-post-form')).toBeVisible({ timeout: 30_000 });
		await page.getByTestId('open-post-form').click();
		await page.getByTestId('post-form-text').fill(body);
		await page.getByTestId('post-form-submit').click();
		await expect(page.getByText(body).first()).toBeVisible({ timeout: 15_000 });
	});
});
