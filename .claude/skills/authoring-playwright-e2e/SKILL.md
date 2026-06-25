---
name: authoring-playwright-e2e
description: Use whenever authoring, exploring, or debugging the fork-owned Playwright e2e specs under the `playwright/` directory of this endolphin Misskey fork — the LLM-driven loop of exploring a running instance with the Playwright MCP `browser_*` tools, drafting via `codegen`, distilling into a committed spec, and triaging flakes with the trace viewer. Covers which flows belong in the suite (fork removal contracts, fork-built screens, must-keep core happy-paths), reuse of the `fixtures/misskey.ts` helpers and upstream `data-cy-*` selectors, and the rule that raw MCP logs and codegen output are never committed (only the distilled spec is). Must be consulted before writing or fixing any Playwright e2e test or running MCP browser exploration against the local instance, even when the user only says "add an e2e test", "explore the UI", or "this test is flaky".
---

# authoring-playwright-e2e

`playwright/` e2e を **書く・直す** ときに最初に参照するスキル。Stage 0–3 の rig (`playwright.config.ts` / `fixtures/misskey.ts` / `compose.test.yml` / CI) は整備済で、このスキルは [docs/endolphin/playwright-e2e.md](../../../docs/endolphin/playwright-e2e.md) の **Stage 4「LLM 駆動オーサリング運用」** ＝ Playwright MCP を「**探索 → spec 蒸留 → flake 切り分け**」の定常ループに乗せる手順をまとめる。

SKILL.md 本体は references への索引だけ。具体的な手順や規約は該当ファイルを Read すること (progressive disclosure)。

`playwright/` の spec は `packages/frontend/` 外なので `working-on-frontend` のトリガ対象外。**fork e2e に触る入口はこのスキル**。

## 前提

- **起動中インスタンスが要る** (`browser_*` も `codegen` も実ブラウザで実インスタンスを叩く)。探索用途なら **`pnpm -C playwright explore`** が最短 — e2e rig と同じ compose (pg/redis) + `start:test` を上げて `:61812` を保持し、**Ctrl-C で自動撤去** (`/api/reset-db` も使える)。事前に `pnpm build` が要る。spec の「実行」は `pnpm -C playwright test` が自前で起動/終了するのでこのヘルパは不要。UI 開発中のデータを見たいだけなら `pnpm dev` でも可。
- **rig 自体 (config / fixtures / compose / CI workflow) は触らない**。Stage 0–3 で完成済。詳細は [docs/endolphin/playwright-e2e.md](../../../docs/endolphin/playwright-e2e.md)。
- Playwright 関連コマンドはすべて独立 workspace の `playwright/` 配下で叩く (`pnpm -C playwright …`)。

## 作業別ワークフロー (tasks)

タスク単位の完結した手順。MCP ループの 1 周を回すときに開く。

- 起動中インスタンスを Playwright MCP で探索して spec 草案を得る → [references/tasks/exploring-with-mcp.md](references/tasks/exploring-with-mcp.md)
- 草案 (codegen 出力 / 探索メモ) を endolphin 規約の commit 可能な spec に蒸留する → [references/tasks/distilling-a-spec.md](references/tasks/distilling-a-spec.md)
- 落ちる / 不安定な spec を trace・video で切り分けて直す → [references/tasks/triaging-flakes.md](references/tasks/triaging-flakes.md)

## 共通知識 (knowledge)

ループのどこでも踏みうる背景知識。

- Playwright MCP (`browser_*`) の使い方・プラグイン構成・探索ログ非 commit 規約 → [references/knowledge/playwright-mcp.md](references/knowledge/playwright-mcp.md)
- `fixtures/misskey.ts` のヘルパ一覧と `data-cy-*` セレクタ戦略 → [references/knowledge/fixtures-and-selectors.md](references/knowledge/fixtures-and-selectors.md)
- pw に入れる / 入れないの採否判定 (fork 固有 or 基幹 happy-path) と Stage 分類 → [references/knowledge/what-belongs-in-pw.md](references/knowledge/what-belongs-in-pw.md)

## 鉄則 (この fork でだけ価値が出る一点)

**MCP 探索ログ・codegen の生出力・スナップショットは commit しない。蒸留した spec だけを `playwright/tests/` に置く。** 探索は使い捨て、資産は spec。これを守らないと探索ノイズがリポジトリに溜まり、Stage 4 の「探索 → 蒸留」分業が崩れる。

## 必ず最後に通る場所

spec を commit / PR にする前に、必ず [shipping-misskey-change](../shipping-misskey-change/SKILL.md) の最終チェックリストに従う。特に **新規 `.ts` の AGPL SPDX ヘッダー (TS コメント形式)** と `pnpm lint` を確認する (rig 出荷規約は [docs/endolphin/playwright-e2e.md](../../../docs/endolphin/playwright-e2e.md) 末尾)。
