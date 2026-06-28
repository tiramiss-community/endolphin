/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import path from 'node:path';
import { test, expect, prepareLoggedInUser, dismissUserSetup } from '../../fixtures/misskey';
import type { Page } from '@playwright/test';

// Stage 1: メディアアップロードの接合点。クライアント前処理（圧縮 / 圧縮スキップ）とサーバ処理
// （ffmpeg サムネ生成）がエラーなく噛み合うことを、生成された DriveFile で機械保証する。
// - 静止画像 (PNG)        → クライアントが WebP に再エンコード圧縮する（type が image/webp になる）
// - アニメ画像 (GIF)      → クライアントは圧縮をスキップし原本のまま上げる（type は image/gif のまま）
// - 動画 (MP4)            → サーバが ffmpeg でサムネを生成する（thumbnailUrl が付き、実際に配信される）
//
// アップローダーダイアログ（os.launchUploader → MkUploaderDialog → useUploader）を必ず通すため、
// ドライブページの「Upload」導線から上げる（既存 drive.spec.ts と同じ経路 = クライアント前処理が走る）。
// API 直叩きだとクライアント圧縮を素通りするので UI 経由が必須。

const MEDIA_DIR = path.join(__dirname, '../../fixtures/media');

type CreatedFile = {
	name: string;
	type: string;
	size: number;
	thumbnailUrl: string | null;
};

/**
 * ドライブページの「Upload」メニューから 1 ファイルを上げ、/api/drive/files/create のレスポンス
 * （= 生成された DriveFile）を返す。クライアント前処理が完了してアップロードボタンが有効化されるまで待つ。
 */
async function uploadViaDrivePage(page: Page, fileName: string): Promise<CreatedFile> {
	// ドライブ nav のメニュー（ページ内にスコープして app navbar の同種アイコンと区別）
	await page.locator('._pageScrollable button:has(i.ti-dots)').first().click();

	// メニューの「Upload」で <input type=file> が click され filechooser が発火する
	const [chooser] = await Promise.all([
		page.waitForEvent('filechooser'),
		page.getByText('Upload', { exact: true }).click(),
	]);
	await chooser.setFiles(path.join(MEDIA_DIR, fileName));

	// アップローダーダイアログ: クライアント前処理（圧縮など）が終わると Upload ボタンが有効化される。
	// （ボタンの accessible name はアイコン分の先頭スペースを含む " Upload" なので exact は使わない）
	const uploadBtn = page.getByRole('button', { name: 'Upload' });
	await expect(uploadBtn).toBeEnabled({ timeout: 30_000 });

	// 確定 → /api/drive/files/create のレスポンス body を捕捉
	const [resp] = await Promise.all([
		page.waitForResponse((r) => r.url().includes('/api/drive/files/create') && r.ok()),
		uploadBtn.click(),
	]);
	return (await resp.json()) as CreatedFile;
}

test.describe('core / media upload', () => {
	test.beforeEach(async ({ page, request }) => {
		await prepareLoggedInUser(page, request);
		await page.goto('/my/drive');
		await dismissUserSetup(page); // 遷移先でウィザードを閉じてから操作する
	});

	test('static image is compressed to WebP on the client', async ({ page }) => {
		const created = await uploadViaDrivePage(page, 'static.png');

		// クライアントが PNG を WebP に再エンコードした（接合: 前処理 → multipart → サーバ受理）
		expect(created.type).toBe('image/webp');
		expect(created.name.endsWith('.webp')).toBe(true);

		await expect(page.getByText(created.name).first()).toBeVisible({ timeout: 15_000 });
	});

	test('animated image is uploaded without compression (passthrough)', async ({ page }) => {
		const created = await uploadViaDrivePage(page, 'animated.gif');

		// アニメは isAnimated 判定で圧縮スキップ → 原本のまま（WebP 化されない）
		expect(created.type).toBe('image/gif');
		expect(created.name).toBe('animated.gif');

		await expect(page.getByText('animated.gif').first()).toBeVisible({ timeout: 15_000 });
	});

	test('video upload gets a server-side ffmpeg thumbnail', async ({ page, request }) => {
		const created = await uploadViaDrivePage(page, 'video.mp4');

		expect(created.type).toMatch(/^video\//);

		// サーバ ffmpeg がサムネを生成できた証拠。生成失敗時は DriveService が握り潰して
		// thumbnailUrl=null になる（アップロード自体は成功する）ので、ここが ffmpeg 接合の要。
		expect(created.thumbnailUrl, 'video should have a server-generated thumbnail').toBeTruthy();

		// サムネが実際に配信される（bytes が存在する）ことまで確認する。thumbnailUrl のホストは
		// テスト設定上 misskey.local（解決不可）なので、パスだけ取り出してローカルインスタンスから取得する。
		const thumbPath = new URL(created.thumbnailUrl as string).pathname;
		const thumbRes = await request.get(thumbPath);
		expect(thumbRes.ok()).toBe(true);
		expect(thumbRes.headers()['content-type']).toMatch(/^image\//);
	});
});
