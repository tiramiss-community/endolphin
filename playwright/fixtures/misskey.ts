/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';

// cypress/support/commands.ts から移植したヘルパ群。
// セレクタは upstream が維持する data-cy-* を再利用する（DOM 変更に巻き込まれにくい）。

export const ADMIN_SETUP_PASSWORD = 'example_password_please_change_this_or_you_will_get_hacked';

/** テスト DB を初期化する（POST /api/reset-db → 204）。 */
export async function resetDb(request: APIRequestContext): Promise<void> {
	const res = await request.post('/api/reset-db', { data: {} });
	if (res.status() !== 204) {
		throw new Error(`reset-db failed: ${res.status()} ${await res.text()}`);
	}
}

/** ユーザーを作成する。isAdmin の場合は初期管理者を作る。返り値は作成された body。 */
export async function registerUser(
	request: APIRequestContext,
	username: string,
	password: string,
	isAdmin = false,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
	const route = isAdmin ? '/api/admin/accounts/create' : '/api/signup';
	const res = await request.post(route, {
		data: {
			username,
			password,
			...(isAdmin ? { setupPassword: ADMIN_SETUP_PASSWORD } : {}),
		},
	});
	if (!res.ok()) {
		throw new Error(`registerUser(${username}) failed: ${res.status()} ${await res.text()}`);
	}
	return res.json();
}

/** 初期管理者を作成してインスタンスをセットアップする。作成された admin（token を含む）を返す。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function setupInstance(request: APIRequestContext): Promise<any> {
	return registerUser(request, 'admin', 'admin1234', true);
}

/** 新規ユーザーがログイン直後に表示する初期設定ウィザードを閉じる。 */
export async function dismissUserSetup(page: Page): Promise<void> {
	const close = page.locator('[data-cy-user-setup] [data-cy-modal-window-close]');
	await close.waitFor({ state: 'visible', timeout: 30_000 });
	await close.click();
	await page.locator('[data-cy-modal-dialog-ok]').click();
}

/** UI フローでサインインする（data-cy-signin* 経由）。 */
export async function login(page: Page, username: string, password: string): Promise<void> {
	await page.goto('/');
	await page.locator('[data-cy-signin]').click();
	await page.locator('[data-cy-signin-username] input').fill(username);
	await page.locator('[data-cy-signin-username] input').press('Enter');
	await page.locator('[data-cy-signin-password] input').waitFor({ state: 'visible' });
	await page.locator('[data-cy-signin-password] input').fill(password);
	await Promise.all([
		page.waitForResponse((r) => r.url().includes('/api/signin-flow')),
		page.locator('[data-cy-signin-password] input').press('Enter'),
	]);
}

export const test = base;
export { expect };
