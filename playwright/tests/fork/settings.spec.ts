/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test, expect, prepareLoggedInUser, dismissUserSetup } from '../../fixtures/misskey';

// Stage 3: endolphin が握る設定サブセットの死活。core/settings.spec が /settings の入口を
// 担保するのに対し、ここでは fork が UX として保持する個別サブページが開くことを固定する。
// （deck 設定は fork/deck.spec で別途担保するため、ここでは profile / preferences をカバー）

const SUBPAGES = ['/settings/profile', '/settings/preferences'];

test.describe('fork / settings subset', () => {
	test.beforeEach(async ({ page, request }) => {
		await prepareLoggedInUser(page, request);
		await dismissUserSetup(page);
	});

	for (const path of SUBPAGES) {
		test(`${path} opens`, async ({ page }) => {
			await page.goto(path);
			await expect(page).toHaveURL(new RegExp(path.replace(/\//g, '\\/')));
			// 設定ページのルート（安定リテラルクラス、core/settings.spec と同じ）
			await expect(page.locator('.vvcocwet')).toBeVisible({ timeout: 30_000 });
		});
	}
});
