/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test, expect, resetDb, setupInstance, registerUser, login, dismissUserSetup } from '../../fixtures/misskey';

// Stage 1: ユーザーフォロー（フォローグラフの基幹）。
test.describe('core / follow', () => {
	test('a user can follow another user from their profile', async ({ page, request }) => {
		await resetDb(request);
		await setupInstance(request);
		await registerUser(request, 'alice', 'alice1234');
		await registerUser(request, 'bob', 'bob12345');

		await login(page, 'alice', 'alice1234');

		await page.goto('/@bob');
		await dismissUserSetup(page); // 遷移先でウィザードを閉じてから操作する

		// プロフィールのフォローボタン（安定クラス koudoku, full 表示）
		const followButton = page.locator('.koudoku');
		await expect(followButton).toBeVisible({ timeout: 30_000 });

		const followCreated = page.waitForResponse((r) => r.url().includes('/api/following/create'));
		await followButton.click();
		// alwaysConfirmFollow（既定 true）でクリック後に確認ダイアログが必ず出る → OK。
		// 直前の dismissUserSetup の skip 確認ダイアログが DOM に残留することがあるため visible に限定する。
		await page.locator('[data-cy-modal-dialog-ok]:visible').last().click();

		// following/create が 200 を返す = UI 操作からフォローが成立した（成功の真値）。
		// ボタンの「フォロー中」表示は streaming 依存（profile では isFollowing!=null で
		// stream 購読がスキップされリロードまで更新されない）ため、ここでは表示は assert しない。
		const resp = await followCreated;
		expect(resp.ok(), `following/create -> ${resp.status()}`).toBeTruthy();
	});
});
