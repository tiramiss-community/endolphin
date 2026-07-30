/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test, expect, resetDb, setupInstance } from '../../fixtures/misskey';

// Stage 1: anonymous visitor landing page. Signup/login entry must remain usable before login.
test.describe('core / visitor landing', () => {
	test.beforeEach(async ({ request }) => {
		await resetDb(request);
		await setupInstance(request);
	});

	test('welcome page provides a scrollable container', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByTestId('signup')).toBeVisible({ timeout: 30_000 });

		const before = await page.evaluate(() => {
			const signup = document.querySelector('[data-testid="signup"]');
			if (!(signup instanceof HTMLElement)) throw new Error('signup button not found');
			const scrollable = findWelcomeScrollable(signup);
			if (scrollable == null) throw new Error('welcome scroll container not found');
			const rect = scrollable.getBoundingClientRect();
			return {
				scrollTop: scrollable.scrollTop,
				scrollHeight: scrollable.scrollHeight,
				clientHeight: scrollable.clientHeight,
				overflowY: getComputedStyle(scrollable).overflowY,
				x: rect.x,
				y: rect.y,
				width: rect.width,
				height: rect.height,
			};

			function findWelcomeScrollable(start: HTMLElement): HTMLElement | null {
				let el: HTMLElement | null = start;
				while (el != null) {
					const style = getComputedStyle(el);
					if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
						return el;
					}
					el = el.parentElement;
				}
				return null;
			}
		});
		expect(before.scrollHeight).toBeGreaterThan(before.clientHeight);
		expect(before.overflowY).toBe('auto');

		await page.getByTestId('signup').hover();
		await page.mouse.wheel(0, 400);

		await expect.poll(async () => page.evaluate(() => {
			const signup = document.querySelector('[data-testid="signup"]');
			if (!(signup instanceof HTMLElement)) throw new Error('signup button not found');
			const scrollable = findWelcomeScrollable(signup);
			if (scrollable == null) throw new Error('welcome scroll container not found');
			return scrollable.scrollTop;

			function findWelcomeScrollable(start: HTMLElement): HTMLElement | null {
				let el: HTMLElement | null = start;
				while (el != null) {
					const style = getComputedStyle(el);
					if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
						return el;
					}
					el = el.parentElement;
				}
				return null;
			}
		})).toBeGreaterThan(before.scrollTop);
	});
});
