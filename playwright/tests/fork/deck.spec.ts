/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test, expect, prepareLoggedInUser, dismissUserSetup } from '../../fixtures/misskey';

// Stage 3: デッキ多カラム UI。P1（厳選UXファースト）で「剥がさない」と明言された
// パワーユーザー向けアフォーダンス。fork が死守する UX なので多カラム導線の死活を固定する。
// deck モードは URL パラメータ `?ui=deck` で強制できる（boot/main-boot.ts）。

test.describe('fork / deck multi-column UI', () => {
	test.beforeEach(async ({ page, request }) => {
		await prepareLoggedInUser(page, request);
		await dismissUserSetup(page);
	});

	test('deck mode exposes the multi-column add affordance', async ({ page }) => {
		// deck UI へ切替え（boot 時に searchParams.ui を解釈）
		await page.goto('/?ui=deck');
		// 再 boot でウィザードが再オープンし backdrop がクリックを遮るため deck 上で閉じ直す
		await dismissUserSetup(page);

		// deck の「カラム追加」ボタン（tooltip=Add column / ti-plus）が side/bottom メニューに
		// 存在することが、P1 で守る多カラム UX の死活。
		const addColumn = page.getByRole('button').filter({ has: page.locator('i.ti-plus') });
		await expect(addColumn.first()).toBeVisible({ timeout: 30_000 });
	});

	test('a column can be added in deck mode', async ({ page }) => {
		await page.goto('/?ui=deck');
		await dismissUserSetup(page);
		const addColumn = page.getByRole('button').filter({ has: page.locator('i.ti-plus') });
		await expect(addColumn.first()).toBeVisible({ timeout: 30_000 });

		// 追加前のカラム数（各 deck カラムの root は ._forceShrinkSpacer）を記録
		const columns = page.locator('section > ._forceShrinkSpacer');
		const before = await columns.count();

		await addColumn.first().click();

		// addColumn は os.select（MkDialog + MkSelect）でカラム種別を尋ねる。
		// MkSelect の既定値は null なので、種別を選ばず OK すると addColumn が早期 return する。
		// → MkSelect を開いて種別を 1 つ選んでから OK する必要がある。
		const okButton = page.getByTestId('modal-dialog-ok').last();
		await okButton.waitFor({ state: 'visible', timeout: 15_000 });

		// MkSelect コンテナ（chevron-down を内包する tabindex=0 の入力枠）を開く → os.popupMenu
		const selectBox = page.locator('div[tabindex="0"]:has(.ti-chevron-down)').last();
		await selectBox.click();
		// popupMenu の「Timeline」項目を選択
		await page.getByRole('menuitem', { name: 'Timeline' }).first().click()
			.catch(async () => { await page.getByText('Timeline', { exact: true }).last().click(); });
		await okButton.click();

		// カラムが 1 つ増える = 多カラム追加が機能する（P1 の UX アフォーダンス死活）
		await expect.poll(async () => columns.count(), { timeout: 15_000 }).toBeGreaterThan(before);
	});

	test('deck settings page opens', async ({ page }) => {
		await page.goto('/settings/deck');
		await dismissUserSetup(page);
		await expect(page).toHaveURL(/\/settings\/deck/);
		// 設定ページのルート（安定リテラルクラス、core/settings.spec と同じ）
		await expect(page.locator('.vvcocwet')).toBeVisible({ timeout: 30_000 });
	});
});
