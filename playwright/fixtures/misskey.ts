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

/**
 * 初期設定ウィザードを閉じる（× → skip 確認 OK で accountSetupWizard=-1）。
 * ウィザードは全ページ共通の popup（boot 時に開く）なので、**操作対象ページへ遷移した後**に
 * 1 度だけ呼ぶこと（遷移直後に再オープンして backdrop がクリックを遮るため、遷移前に閉じても無駄）。
 */
export async function dismissUserSetup(page: Page): Promise<void> {
	const close = page.locator('[data-cy-user-setup] [data-cy-modal-window-close]');
	await close.waitFor({ state: 'visible', timeout: 30_000 });
	await close.click();
	// 「スキップしますか？」確認ダイアログの OK
	const ok = page.locator('[data-cy-modal-dialog-ok]');
	await ok.waitFor({ state: 'visible', timeout: 10_000 });
	await ok.click();
	await page.locator('[data-cy-user-setup]').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
}

/** reset → 初期管理者作成 → 対象ユーザー作成 → UI ログイン まで（ウィザードは遷移先で completeUserSetup する）。 */
export async function prepareLoggedInUser(
	page: Page,
	request: APIRequestContext,
	username = 'alice',
	password = 'alice1234',
): Promise<void> {
	await resetDb(request);
	await setupInstance(request);
	await registerUser(request, username, password);
	await login(page, username, password);
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

	// signin 成功後、クライアントはトークンを localStorage に保存して home にリロードする。
	// これを待たずに goto するとリロードと競合し、未ログインの welcome 画面へ飛ぶ。
	// ログイン後 home（post ボタン or 初期設定ウィザード）が出るまで待ち、セッション確立を保証する。
	await page.locator('[data-cy-open-post-form], [data-cy-user-setup]').first()
		.waitFor({ state: 'visible', timeout: 30_000 });
}

/**
 * 削除機能の read endpoint を叩いて静的な空レスポンス（[] / null / {} 等）を検証する。
 * endolphin の no-op stub 契約: endpoint 登録は維持しつつ削除済み entity を参照せず空を返す。
 * 返り値（parse 済み body）を返すので呼び出し側で更に shape を assert できる。
 */
export async function callApi(
	request: APIRequestContext,
	endpoint: string,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	data: Record<string, any> = {},
): Promise<{ status: number; body: unknown }> {
	const res = await request.post(`/api/${endpoint}`, { data });
	const text = await res.text();
	let body: unknown = null;
	try {
		body = text.length > 0 ? JSON.parse(text) : null;
	} catch {
		body = text;
	}
	return { status: res.status(), body };
}

/**
 * 削除機能の write endpoint が FEATURE_REMOVED（HTTP 410）を返すことを検証する。
 * 認証が要る endpoint には token を渡す（body の `i` に乗る）。
 */
export async function expectFeatureRemoved(
	request: APIRequestContext,
	endpoint: string,
	token?: string,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	extra: Record<string, any> = {},
): Promise<void> {
	const { status, body } = await callApi(request, endpoint, { ...(token ? { i: token } : {}), ...extra });
	if (status !== 410) {
		throw new Error(`${endpoint}: expected 410, got ${status} (${JSON.stringify(body)})`);
	}
	// ApiError shape: { error: { code, id, kind, httpStatusCode } }
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const code = (body as any)?.error?.code;
	if (code !== 'FEATURE_REMOVED') {
		throw new Error(`${endpoint}: expected error.code FEATURE_REMOVED, got ${String(code)} (${JSON.stringify(body)})`);
	}
}

export const test = base;
export { expect };
