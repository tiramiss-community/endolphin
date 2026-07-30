# 草案を commit 可能な spec に蒸留する

MCP ループの 2 周目。[exploring-with-mcp.md](exploring-with-mcp.md) で得た草案 (操作列 + セレクタ + 待ち) や codegen 生出力を、**endolphin 規約に沿った短く・速く・安定な spec** に作り替える段階。

## ステップ 1: そもそも入れるべきか / どこに置くか

まず採否を判定する → [knowledge/what-belongs-in-pw.md](../knowledge/what-belongs-in-pw.md)。入れると決めたら Stage に対応する置き場を選ぶ:

| 置き場 | Stage | 入れるもの |
|---|---|---|
| `playwright/tests/core/` | 1 | 絶対死守の基幹 happy-path (投稿→TL / signup / login / drive / follow / 設定) |
| `playwright/tests/removed/` | 2 | 削除コントラクト回帰 (UI 導線除去・スタブ API の 410/空) |
| `playwright/tests/fork/` | 3 | fork 自作の低 churn 画面 (デッキ多カラム / About / fork 設定) |

upstream 全機能の網羅は **入れない** (upstream の Playwright e2e = 継承の領分)。

## ステップ 2: codegen の生出力を house style に作り替える

codegen 出力は素材であって成果物ではない。次へ作り替える:

- **fixtures を使う。** ベタ書きのログイン手順や reset を `../../fixtures/misskey` のヘルパに置換する (一覧は [knowledge/fixtures-and-selectors.md](../knowledge/fixtures-and-selectors.md))。
  - `import { test, expect, prepareLoggedInUser, dismissUserSetup } from '../../fixtures/misskey';`
  - ログイン済の前提なら `beforeEach` で `prepareLoggedInUser(page, request)` → 遷移後に `dismissUserSetup(page)`。
- **`test.describe('category / name', …)` 形式**にする (既存 spec は `'core / note'` `'removed / API stub contracts'` 等)。
- **セレクタは upstream の `data-testid` 優先**。codegen が吐く脆い CSS/XPath を、`getByTestId` / `getByRole` / `getByText` に置換する (方針は [knowledge/fixtures-and-selectors.md](../knowledge/fixtures-and-selectors.md))。
- **固定 `sleep` / `waitForTimeout` を消す**。codegen が挿す任意待ちは flake の元。`waitFor({ state: 'visible' })` / `waitForResponse` など**正しいシグナル待ち**に置き換える (理由は [triaging-flakes.md](triaging-flakes.md))。
- **タイムアウトは既存慣習に合わせる**。重い初回描画は `30_000`、TL 反映など伝播待ちは `15_000` 程度 (`tests/core/note.spec.ts` 参照)。
- **直列前提を壊さない**。rig は `workers: 1` / `fullyParallel: false`、`resetDb` は共有 DB を初期化する。並列分離を前提にした書き方をしない。

API スタブ契約 (`removed/`) を書くなら、UI を経由せず `callApi` / `expectFeatureRemoved` で直接叩く形にする (`tests/removed/api-stubs.spec.ts` が手本)。

## ステップ 3: SPDX ヘッダーを付ける

`playwright/**` の新規 `.ts` は **AGPL SPDX (TS コメント形式)** が要る (rig 出荷規約)。ファイル冒頭に:

```ts
/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */
```

## ステップ 4: 蒸留例 (codegen → spec)

codegen がこう吐いたとする (使い捨ての生出力):

```ts
await page.goto('http://localhost:61812/');
await page.getByRole('button', { name: 'Note' }).click();
await page.locator('textarea').fill('hello');
await page.getByRole('button', { name: 'Note' }).nth(1).click();
await page.waitForTimeout(3000);
```

蒸留後 (`tests/core/` に置ける形):

```ts
/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test, expect, prepareLoggedInUser, dismissUserSetup } from '../../fixtures/misskey';

test.describe('core / note', () => {
	test.beforeEach(async ({ page, request }) => {
		await prepareLoggedInUser(page, request);
		await dismissUserSetup(page);
	});

	test('posting a note shows it on the timeline', async ({ page }) => {
		const body = 'Hello, Playwright e2e!';
		await page.getByTestId('open-post-form').click();
		await page.getByTestId('post-form-text').fill(body);
		await page.getByTestId('post-form-submit').click();
		await expect(page.getByText(body).first()).toBeVisible({ timeout: 15_000 });
	});
});
```

`goto` / ログインは fixtures に、脆いセレクタは upstream の `data-testid` に、`waitForTimeout(3000)` は「投稿が TL に見える」という**結果の可視待ち**に置き換わっている。

## ステップ 5: 検証

```bash
pnpm build                                   # start:test が使う built 資産を更新（spec 前にビルド）
pnpm -C playwright run typecheck             # spec の型チェック
pnpm -C playwright test --grep "core / note" # 該当 spec だけ実行（compose で pg/redis も自動起動）
```

緑になったらこの spec だけを commit する。**草案・codegen 生出力・探索ログは commit しない。**

## 出口

commit / PR 前に必ず [shipping-misskey-change](../../../shipping-misskey-change/SKILL.md) を通す (SPDX / `pnpm lint` / CHANGELOG 判定)。
