/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test, expect, resetDb, setupInstance, registerUser, callApi, expectFeatureRemoved } from '../../fixtures/misskey';

// Stage 2（★ Playwright 固有価値）: 削除機能のスタブ契約を API レベルで機械保証する。
// read 系 = 静的な空（[] / null / {} / 空チャート）、write 系 = FEATURE_REMOVED（HTTP 410）。
// endpoint 登録・型は互換のため維持されているので、3rd-party アプリが呼んでも落ちないことを保証する。
// 期待値は実装の ground-truth（feature-inventory.md の意図と差異あり）に合わせる:
//   - *show 系（gallery/pages/reversi）は no-op ではなく NO_SUCH_* を throw する仕様。
//   - reversi/verify は { desynced: false } を返す。
//   - admin/get-table-stats は {}、get-index-stats は [] を返す。

test.describe('removed / API stub contracts', () => {
	let adminToken: string;
	let userToken: string;
	let userId: string;

	test.beforeAll(async ({ request }) => {
		await resetDb(request);
		const admin = await setupInstance(request);
		adminToken = admin.token;
		const user = await registerUser(request, 'alice', 'alice1234');
		userToken = user.token;
		userId = user.id ?? user.user?.id;
	});

	test.describe('read endpoints return static empty', () => {
		// [endpoint, requiresToken, extraParams?]: paramDef の required を満たすため一部に追加 param。
		// param 検証は handler より先に走るため、required を満たさないと 400 で no-op に届かない。
		const EMPTY_ARRAY: Array<[string, boolean, Record<string, unknown>?]> = [
			['gallery/featured', false],
			['gallery/popular', false],
			['gallery/posts', false],
			['i/gallery/likes', true],
			['i/gallery/posts', true],
			['users/gallery/posts', false, { __userId: true }],
			['pages/featured', false],
			['i/pages', true],
			['i/page-likes', true],
			['users/pages', false, { __userId: true }],
			['users/achievements', false, { __userId: true }],
			['reversi/games', false],
			['reversi/invitations', true],
			['bubble-game/ranking', false, { gameMode: 'normal' }],
			['i/favorites', true],
			['retention', false],
			['admin/get-index-stats', true],
			['admin/ad/list', true],
			['chat/history', true],
		];

		for (const [endpoint, needsToken, extra] of EMPTY_ARRAY) {
			test(`${endpoint} → []`, async ({ request }) => {
				const tokenFor = endpoint.startsWith('admin/') ? adminToken : userToken;
				const { __userId, ...rest } = (extra ?? {}) as Record<string, unknown> & { __userId?: boolean };
				const data = {
					...(needsToken ? { i: tokenFor } : {}),
					...(__userId ? { userId } : {}),
					...rest,
				};
				const { status, body } = await callApi(request, endpoint, data);
				expect(status, `${endpoint} status (${JSON.stringify(body)})`).toBe(200);
				expect(Array.isArray(body), `${endpoint} should be an array`).toBe(true);
				expect(body).toEqual([]);
			});
		}

		test('admin/get-table-stats → {}', async ({ request }) => {
			const { status, body } = await callApi(request, 'admin/get-table-stats', { i: adminToken });
			expect(status).toBe(200);
			expect(body).toEqual({});
		});

		test('reversi/verify → { desynced: false }', async ({ request }) => {
			const { status, body } = await callApi(request, 'reversi/verify', { gameId: 'x', crc32: '0' });
			expect(status).toBe(200);
			expect(body).toMatchObject({ desynced: false });
		});

		test('charts return empty series', async ({ request }) => {
			for (const chart of ['charts/notes', 'charts/users', 'charts/active-users']) {
				const { status, body } = await callApi(request, chart, { span: 'day' });
				expect(status, `${chart}`).toBe(200);
				// 空チャートはキーごとに全て 0 埋めの配列。少なくとも object であることと
				// 値が全部 0 であることを確認する（getEmptyChart の契約）。
				expect(typeof body, `${chart} body`).toBe('object');
				const flat = JSON.stringify(body);
				expect(/[1-9]/.test(flat.replace(/"[^"]*":/g, '')), `${chart} should be all zeros`).toBe(false);
			}
		});

		// *show 系は no-op ではなく NO_SUCH_* を throw する（実装 ground-truth）。
		const NO_SUCH: Array<[string, Record<string, unknown>, string]> = [
			['gallery/posts/show', { postId: 'xxxxxxxxxx' }, 'NO_SUCH_POST'],
			['pages/show', { pageId: 'xxxxxxxxxx' }, 'NO_SUCH_PAGE'],
			['reversi/show-game', { gameId: 'xxxxxxxxxx' }, 'NO_SUCH_GAME'],
		];
		for (const [endpoint, data, code] of NO_SUCH) {
			test(`${endpoint} → ${code}`, async ({ request }) => {
				const { body } = await callApi(request, endpoint, data);
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				expect((body as any)?.error?.code, `${endpoint} (${JSON.stringify(body)})`).toBe(code);
			});
		}
	});

	test.describe('write endpoints return FEATURE_REMOVED (410)', () => {
		test('gallery/posts/create', async ({ request }) => {
			await expectFeatureRemoved(request, 'gallery/posts/create', userToken, { title: 't', fileIds: ['x'] });
		});
		test('pages/create', async ({ request }) => {
			await expectFeatureRemoved(request, 'pages/create', userToken, { title: 't', name: 'n', content: [], variables: [], script: '' });
		});
		test('notes/favorites/create', async ({ request }) => {
			await expectFeatureRemoved(request, 'notes/favorites/create', userToken, { noteId: 'x' });
		});
		test('i/claim-achievement', async ({ request }) => {
			await expectFeatureRemoved(request, 'i/claim-achievement', userToken, { name: 'notes1' });
		});
		test('reversi/match', async ({ request }) => {
			await expectFeatureRemoved(request, 'reversi/match', userToken, { userId: 'x' });
		});
		test('bubble-game/register', async ({ request }) => {
			await expectFeatureRemoved(request, 'bubble-game/register', userToken, { score: 1, gameMode: 'normal', gameVersion: 1, seed: 'x', logs: [] });
		});
		test('admin/ad/create', async ({ request }) => {
			await expectFeatureRemoved(request, 'admin/ad/create', adminToken, { url: 'https://example.com', memo: '', place: 'square', priority: 'middle', ratio: 1, expiresAt: 0, startsAt: 0, imageUrl: 'https://example.com/a.png', dayOfWeek: 0 });
		});
	});
});
