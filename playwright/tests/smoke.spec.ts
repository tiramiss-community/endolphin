/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test, expect, resetDb } from '../fixtures/misskey';

// Stage 0: リグが end-to-end で通ることの最小確認（compose + webServer + browser）。
test.describe('smoke', () => {
	test('home renders', async ({ page, request }) => {
		await resetDb(request);
		await page.goto('/');
		await expect(page.locator('button').first()).toBeVisible({ timeout: 30_000 });
	});
});
