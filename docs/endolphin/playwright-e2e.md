# Playwright E2E / LLM 駆動基盤（endolphin）

endolphin に **fork 所有の Playwright 環境**を導入するための正本ドキュメント。狙いは 2 つ:

1. **LLM エコシステム**: Playwright MCP で LLM / エージェントが起動中の Misskey を実ブラウザ駆動し、探索・テスト作成・flake 切り分けをしやすくする（Claude Code は `playwright@claude-plugins-official` プラグイン経由で利用。後述）。
2. **フロント e2e の充実**: 機能を厳選した endolphin の**基幹機能の品質を底上げ**し、削除/スタブ化が core flow を壊していないことを機械保証する。

> このドキュメントは [fork-policy.md](fork-policy.md) の設計原則 P1〜P3 と [feature-inventory.md](feature-inventory.md) の削除コントラクトに従う。Phase 4 の機能削減とは独立した、テスト/開発基盤の追加であり、機能の復活・削除には関与しない。

---

## 大前提: upstream 所有の E2E を一切触らない

既存の Playwright E2E（`packages/frontend/test/e2e/` / `packages/frontend/playwright.config.ts` / `.github/workflows/test-frontend.yml`）と起動スクリプト（root `package.json` の `start:test` / `e2e`）は **upstream 所有**。endolphin はこれらを **継承・凍結** として扱い、改変・撤去しない。

- Playwright は **fork 所有の新規ディレクトリ `playwright/` に閉じる**。upstream マージで競合が出ない。
- セレクタは upstream が自分の Playwright E2E 用に維持する **`data-testid` 属性を再利用**（`getByTestId`）。無い箇所のみ role / text ベース。`data-testid` は upstream が保守する低 churn の契約なので DOM 変更に巻き込まれにくい。
- CI は既存 `test-frontend.yml` に job 追加せず、**新規 fork 所有 workflow ファイル**を作る。

所有境界:

| 領域 | 所有 | 扱い |
|---|---|---|
| `packages/frontend/test/e2e/` `packages/frontend/playwright.config.ts` | upstream | 継承・凍結（触らない） |
| `start:test` / `e2e` script（root package.json） | upstream | 無改変で**呼ぶだけ** |
| `.github/workflows/test-frontend.yml` | upstream | 触らない |
| `playwright/**` | endolphin | fork 所有 |
| Playwright MCP（LLM 駆動） | — | Claude Code は `playwright@claude-plugins-official` プラグイン経由（`.claude/settings.json`）。project `.mcp.json` は二重登録になるため同梱しない |
| `.github/workflows/test-frontend-e2e-playwright.yml`（新規） | endolphin | fork 所有 |

---

## ランタイム構成（トポロジ A + compose）

**案1（起動/終了サイクルにアプリを乗せる）= アプリ層 → Playwright `webServer`**、**案2（infra をコンテナで別管理・ライフサイクル共有）= インフラ層 → compose** の 2 レイヤー分担。両者は排他ではなく相補。

決め手: [test.yml](../../.github/misskey/test.yml) は固定ポート（backend `61812` / postgres `127.0.0.1:54312` / redis `127.0.0.1:56312`、db `test-misskey` / user `postgres` / pass 空）。**compose を同じ固定ポートで公開すれば `start:test` は無改変で動く**（`start:test` が毎回 `.github/misskey/test.yml` を `.config/test.yml` にコピーして読むため）。

```
Playwright run
├─ webServer:      compose up -d --wait（pg→:54312 / redis→:56312）に続けて `pnpm start:test`
│                  を spawn → :61812 を wait。Playwright は webServer を globalSetup より先に
│                  起動するため、DB 依存の start:test より前に compose を同コマンド内で上げる。
│                  start:test はそのまま test.yml を読む（改変不要）。
├─ tests:          playwright/tests/**.spec.ts
└─ globalTeardown: `docker compose down -v`（PW_SKIP_COMPOSE=1 でスキップ可）
```

- ライフサイクルが Playwright run に完全に紐づく（テスト終了で infra も落ちる）= 案2 の狙い。
- `start-server-and-test` 依存は fork 所有 Playwright リグからは不要（root `e2e` script は upstream Playwright 用に温存）。
- **Misskey 本体はコンテナ化しない**: ビルド済み `built/entry.js` をホストでそのまま使えて inner loop が速く、CI の現行（pg/redis のみ service コンテナ・Misskey はランナー上）とも一致し divergence ゼロ。
- **前提**: `start:test` は `node built/entry.js` を起動するので事前に `pnpm build` が必要。CI は明示ステップ、ローカルは一度ビルドする（webServer コマンドに build を埋めると reuse 時に遅くなるため埋めない）。
- **CI**: infra は GitHub の **service container**（postgres/redis・固定ポート・upstream e2e と同方式）で用意し、webServer は `PW_SKIP_COMPOSE=1` で compose をスキップして `start:test` を起動する。compose の公開ポートが GH runner から `start:test`（ホスト）へ届かないことがあるため、**ローカル=compose / CI=service container** と使い分ける。`reuseExistingServer` はローカルのみ true。
- **Node**: Playwright 1.61 の TS loader は Node 22.15.0（`.node-version`）で `context.conditions?.includes is not a function` を起こすため、e2e ジョブのみ Node を 22.22.x に固定する。ローカルでも Node ≥ 22.22 で実行すること（`playwright/pnpm-workspace.yaml` の `engineStrict` で install 時に強制）。

### なぜ compose（testcontainers ではない）か

固定ポート公開で `start:test` 無改変、既存 `compose.local-db.yml` の前例踏襲、CI と一致、という 3 点で compose を既定とする。並列分離やポート衝突回避が必要になったら testcontainers へ昇格する段階論で十分。

### トポロジ B（全部 compose）

pg+redis+**Misskey コンテナ**まで compose に入れ、Playwright は URL を wait するだけ。最大限の再現性/隔離だが Misskey イメージのビルド/キャッシュコストで inner loop が遅い。**完全 hermetic な release ゲート用**に将来検討、日常開発は A。

---

## ディレクトリ構成

```
playwright/
├─ playwright.config.ts        # baseURL=:61812 / webServer=(compose up + start:test) / globalTeardown
├─ compose.test.yml            # postgres:18→:54312 / redis:8→:56312（fork 所有・固定ポート）
├─ global-teardown.ts          # compose down -v
├─ fixtures/
│  └─ misskey.ts               # resetDb / setupInstance / registerUser / login / dismissUserSetup（upstream e2e helper を基に実装）
├─ tests/
│  ├─ smoke.spec.ts            # Stage 0: ホーム描画
│  ├─ core/                    # Stage 1: 基幹 happy-path
│  ├─ removed/                 # Stage 2: 削除コントラクト回帰
│  └─ fork/                    # Stage 3: fork 自作の低 churn 画面
└─ tsconfig.json
```

upstream E2E の helper を基にするヘルパ:

| ヘルパ | 内容 |
|---|---|
| `resetDb` | `POST /api/reset-db` → 204 を確認（テスト DB 初期化） |
| `registerUser(name, pass, isAdmin)` | admin は `POST /api/admin/accounts/create`（`setupPassword` 同梱）、一般は `POST /api/signup`。作成 body（`token` 含む）を返す |
| `setupInstance` | `registerUser('admin', _, true)` で初期管理者を作成しインスタンスをセットアップ |
| `login(name, pass)` | upstream の `data-testid` 経由の UI ログインフロー |
| `dismissUserSetup` | 新規ユーザーがログイン直後に出す初期設定ウィザードを閉じる |

---

## ローカル実行

CI は新規 workflow が自動で行うが、**ローカルでも同じリグをそのまま実行できる**。

> `playwright/` は **独立した pnpm workspace**（`playwright/pnpm-workspace.yaml` が境界）。root package.json には依存も script も足していないため、Playwright 関連の操作はすべて `playwright/` ディレクトリ配下で行う（`pnpm -C playwright …` または `cd playwright`）。

```bash
# 1) 一度だけ: テストランナー（@playwright/test）を playwright/ workspace に install
pnpm -C playwright i

# 2) 一度だけ: Playwright のブラウザを導入（chromium のみ）
#    --with-deps は OS 依存パッケージを apt で入れる（sudo 必要）ため CI 専用。ローカルでは付けない。
pnpm -C playwright exec playwright install chromium

# 3) フロント / バックエンドをビルド（start:test が built/entry.js とフロント built 資産を使う。root で実行）
pnpm build

# 4) 実行（compose の pg/redis 起動 → start:test 起動 → 後片付け まで全自動）
pnpm -C playwright test
```

- **Docker が必須**（compose で test 用 pg/redis を起動するため）。`docker compose version` で確認。
- ポート `54312` / `56312` / `61812` が空いていること（compose と start:test が使う）。
- **Node ≥ 22.22** が必要（`playwright/pnpm-workspace.yaml` の `engineStrict` + `engines` で install 時に強制。理由は後述の「Node」節）。
- 既に `pnpm start:test`（= test.yml → compose の DB を使う構成）を手動起動済みなら、`pnpm -C playwright test` はそれを再利用する（`reuseExistingServer: !CI`）。`pnpm dev` は別 config（default.yml）なので再利用対象にしない。
- 外部の pg/redis を使いたい場合は `PW_SKIP_COMPOSE=1 pnpm -C playwright test` で compose 起動をスキップできる。
- テスト作成補助: `pnpm -C playwright codegen`（起動中インスタンスに対して codegen）。レポート閲覧: `pnpm -C playwright report`。
- 対話的な MCP / codegen 探索のために**インスタンスを起動して保持**したいだけなら `pnpm -C playwright explore`（要 `pnpm build`）。`test` と同じ compose + `start:test` を上げて `:61812` を保持し、**Ctrl-C で `start:test` 停止 + `docker compose down -v` まで自動撤去**する（既に `:61812` が上がっていれば再利用し撤去しない / `PW_SKIP_COMPOSE=1` で compose をスキップ）。spec の実行は `test` が起動/終了を自前にやるのでこのヘルパは不要＝探索セッション専用。

## Playwright MCP（LLM 駆動）

Claude Code は公式プラグイン `playwright@claude-plugins-official`（`.claude/settings.json` で有効化済み）経由で Playwright MCP ツール（`browser_*`）を利用できる。**project `.mcp.json` は同梱しない**（プラグインと二重登録になるため）。

- 使い方: ローカルで Misskey を起動（探索なら `pnpm -C playwright explore` が最短 = 起動保持 + Ctrl-C 自動撤去。`pnpm dev` / `pnpm start:test` でも可）し、エージェントに MCP で `http://localhost:61812` を探索・操作させる。
- Claude 以外の MCP クライアントから使いたい場合のみ、project `.mcp.json` に `@playwright/mcp` を別途登録する（その際 Claude 側はプラグインを無効化して二重登録を避ける）。

## 育成ロードマップ

### Stage 0 — 足場（rig を end-to-end で通す）
- deps: `@playwright/test`（CI e2e ランナー）。**root package.json には足さず**、`playwright/package.json` + `playwright/pnpm-workspace.yaml` で独立 workspace 化（root を汚さない）
- `playwright.config.ts`（baseURL / webServer=`pnpm start:test` / global setup/teardown / trace・video on-first-retry）
- `compose.test.yml`（固定ポート 54312 / 56312、healthcheck 付きで `up --wait` 対応）
- `fixtures/misskey.ts`（上記ヘルパ移植）
- `tests/smoke.spec.ts`（ホームが描画される 1 本）
- Playwright MCP は Claude Code の `playwright@claude-plugins-official` プラグインを利用（`.claude/settings.json` で有効化済み）。project `.mcp.json` は二重登録になるため置かない
- 新規 CI `.github/workflows/test-frontend-e2e-playwright.yml`
- **gate**: 新規 workflow が CI で緑

### Stage 1 — 基幹フロー スモーク（品質底上げの背骨）
endolphin が絶対壊してはいけない happy-path を固定: インスタンス初期セットアップ / signup / login / **ノート投稿 → TL 反映 → ノート詳細** / ドライブにアップロード / ユーザーフォロー / 設定画面が開く。全て upstream の `data-testid` 再利用で短く・速く・安定に。

### Stage 2 — 削除コントラクト回帰（★ fork 所有 Playwright 固有価値・upstream E2E と非重複）
「機能を削っても基幹が壊れない」を機械保証する。fork にしか無いニーズ。
- 削除機能（gallery / pages / achievements / games / favorites / embed / charts / admin統計 / retention / ads / chat）の導線除去を UI 側で確認
- スタブ契約を e2e ハーネス内の API 呼び出しで検証: read 系=`[]`/`null`、write 系=410（`FEATURE_REMOVED`）
- 削除直後でも投稿・TL・ドライブが回ることの回帰
- 元表は [feature-inventory.md](feature-inventory.md) の削除一覧

### Stage 3 — fork 自作の低 churn 画面
fork 所有 UI の品質を純粋な fork 価値として固める: デッキ多カラム（P1 で守る UX アフォーダンス）/ オンボーディング・About など自作ページ / endolphin が握る設定サブセット。churn が低く upstream 追従に巻き込まれない。

### Stage 4 — LLM 駆動オーサリング運用（目的1の本丸）
MCP を「探索 → spec 蒸留」の定常ループに乗せる。
- エージェントが Playwright MCP で起動中インスタンスを探索 → codegen で spec 草案 → trace viewer で flake 切り分け
- 規約: **MCP 探索ログは commit せず、蒸留した spec のみ** `playwright/` に commit
- この「探索 → 蒸留 → flake 切り分け」ループの手順は [.claude/skills/authoring-playwright-e2e/](../../.claude/skills/authoring-playwright-e2e/SKILL.md) スキルに成文化済（Codex 向けスタブは `.agents/skills/authoring-playwright-e2e/`）。`playwright/` の e2e を書く・直すときの入口

### 継続運用 — メンテ規律（育成を負債化させない）
- upstream sync のたびに fork 所有 pw スイートを実行。落ちたら `data-testid` のズレを直す（安価）
- fork 所有 pw に足すか迷ったら判定: 「fork 固有（削除契約 / 自作画面）か、絶対死守の基幹 happy-path」なら入れる。upstream 全機能網羅は入れない（upstream Playwright E2E = 継承の領分）
- flake は trace / video アーティファクトで切り分け、retry は CI のみ

---

## 出荷規約（実装時に必ず守る）

- 新規 `.ts`（`playwright/**`）には AGPL SPDX ヘッダー（TS コメント形式）。`.md` は不要。
- API 変更は伴わない（既存 `/api/reset-db` 等を呼ぶだけ）ため `misskey-js` 再生成は不要。
- entity / migration を触らないため `check-migrations` 対象外。
- `pnpm-lock.yaml` を commit に含める（deps 追加分）。
- [CHANGELOG-endolphin.md](../../CHANGELOG-endolphin.md) `## Unreleased` の `### General` に 1 行追記。
- locale yml は編集しない。
- commit / PR / 手戻り前に `shipping-misskey-change` スキルを通す。
