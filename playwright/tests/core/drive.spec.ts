/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test, expect, prepareLoggedInUser, dismissUserSetup } from '../../fixtures/misskey';

// Stage 1: ドライブへのファイルアップロード（基幹のメディア入口）。
test.describe('core / drive', () => {
	test('uploading a file shows it in the drive', async ({ page, request }) => {
		await prepareLoggedInUser(page, request);

		await page.goto('/my/drive');
		await dismissUserSetup(page); // 遷移先でウィザードを閉じてから操作する

		// ドライブ nav のメニュー（ページ内にスコープして app navbar の同種アイコンと区別）
		await page.locator('._pageScrollable button:has(i.ti-dots)').first().click();

		// メニューの「Upload」で <input type=file> が click され filechooser が発火する
		const [chooser] = await Promise.all([
			page.waitForEvent('filechooser'),
			page.getByText('Upload', { exact: true }).click(),
		]);
		await chooser.setFiles({
			name: 'endolphin-e2e.txt',
			mimeType: 'text/plain',
			buffer: Buffer.from('endolphin playwright e2e'),
		});

		// アップローダーダイアログで Upload を確定 → /api/drive/files/create
		// （ボタンの accessible name はアイコン分の先頭スペースを含む " Upload" なので exact は使わない）
		await Promise.all([
			page.waitForResponse((r) => r.url().includes('/api/drive/files/create') && r.ok()),
			page.getByRole('button', { name: 'Upload' }).click(),
		]);

		// アップロードしたファイル名が現れる
		await expect(page.getByText('endolphin-e2e.txt').first()).toBeVisible({ timeout: 15_000 });
	});
});
