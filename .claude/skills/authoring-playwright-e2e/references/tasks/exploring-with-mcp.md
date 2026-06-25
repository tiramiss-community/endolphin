# 起動中インスタンスを Playwright MCP で探索して spec 草案を得る

MCP ループの 1 周目。**実ブラウザで実インスタンスを歩き、後で spec に蒸留できる「操作列 + セレクタ」を採取**する段階。ここで作る探索ログ・codegen 出力は**使い捨て** ([distilling-a-spec.md](distilling-a-spec.md) で蒸留したものだけが資産)。

## ステップ 1: インスタンスを上げる

`browser_*` も `codegen` も「起動中の Misskey」を前提にする。`:61812` を上げてから探索する。

```bash
# 推奨: 探索セッション用ヘルパ。compose(pg/redis) + start:test を上げて :61812 を保持し、
# Ctrl-C で start:test 停止 + docker compose down -v まで自動で後片付けする。
pnpm build && pnpm -C playwright explore

# 手動でやるなら（後片付けも手動）:
#   pnpm build && pnpm start:test        # 起動
#   docker compose -f playwright/compose.test.yml down -v   # 終了後に撤去
```

- どちらも e2e rig と同じ test.yml 構成（`/api/reset-db` が使える・DB は使い捨て）。
- `start:test` は `node built/entry.js` を起動するので**事前に `pnpm build` が要る** (フロント built 資産も使う)。
- spec の「実行」は `pnpm -C playwright test` が webServer + globalTeardown で起動/終了を自前にやるので、explore ヘルパは**探索セッション専用**（テスト実行には不要）。
- DB を綺麗にしたいだけ / e2e と同じ初期状態で探索したいなら start:test を推す (fixtures の `resetDb` / `setupInstance` がそのまま効く)。
- 既存の開発データを見ながら UI を眺めたいだけなら `pnpm dev` (default.yml) でも可。ただし spec の前提とはズレるので、最終的な確認は start:test 側で。
- **本番インスタンスに対して MCP 探索しない** (破壊的操作・実ユーザーデータ混入のリスク)。

## ステップ 2: 探索の初期状態を作る

ログイン後の画面を探索したいことが多い。fixtures と同じ手順を**手で再現**できる (MCP の `browser_*` で UI を叩いてもよいし、API を直接叩いてもよい):

```bash
# テスト DB 初期化 → 初期管理者作成 → 一般ユーザー作成（fixtures/misskey.ts と同じ呼び出し）
curl -s -X POST localhost:61812/api/reset-db -d '{}'
curl -s -X POST localhost:61812/api/admin/accounts/create \
  -d '{"username":"admin","password":"admin1234","setupPassword":"example_password_please_change_this_or_you_will_get_hacked"}'
curl -s -X POST localhost:61812/api/signup -d '{"username":"alice","password":"alice1234"}'
```

セレクタや fixtures の正本は [knowledge/fixtures-and-selectors.md](../knowledge/fixtures-and-selectors.md)。

## ステップ 3: Playwright MCP で対象フローを歩く

Claude Code は `playwright@claude-plugins-official` プラグイン経由で `browser_*` ツールを使える (詳細・規約は [knowledge/playwright-mcp.md](../knowledge/playwright-mcp.md))。`http://localhost:61812` を起点に、テストしたいフローを 1 回通す。歩きながら次を採取する:

- **各操作で使うセレクタ**。優先順位は `data-cy-*` 再利用 → role/text → 安定 CSS class (理由とフォールバック方針は [knowledge/fixtures-and-selectors.md](../knowledge/fixtures-and-selectors.md))。snapshot で DOM を見て `data-cy-*` 属性を拾う。
- **待ちの正体**。「TL に出るまで」「signin 後 home に戻るまで」など、何が出たら次に進めるのかを観察する (これが spec の `waitFor` / `waitForResponse` になり、flake を防ぐ → [triaging-flakes.md](triaging-flakes.md))。
- **モーダル / ウィザードの割り込み**。新規ユーザーは login 直後に初期設定ウィザードが出る (fixtures の `dismissUserSetup` が閉じる)。割り込みの有無と順序を記録する。

## ステップ 4 (任意): codegen で操作を録画する

手で歩く代わりに、Playwright の codegen に操作を録画させて草案コードを得てもよい:

```bash
pnpm -C playwright codegen   # http://localhost:61812 に対して起動（package.json の codegen script）
```

codegen の出力は**生のセレクタ羅列で boilerplate まみれ**なので、そのままでは commit しない。[distilling-a-spec.md](distilling-a-spec.md) で fixtures・data-cy・describe 構造へ作り替える素材として使う。

## 出力 = 次の段への受け渡し

この段のゴールは「**操作列 + 採取したセレクタ + 待ちの正体**」のメモ (＝ spec 草案)。これを [distilling-a-spec.md](distilling-a-spec.md) に渡す。

## 鉄則

**探索ログ・codegen 生出力・スナップショット・MCP のやり取りは commit しない。** 蒸留した spec だけが `playwright/tests/` に入る。探索は使い捨て、資産は spec。
