# 落ちる / 不安定な spec を trace・video で切り分ける

MCP ループの 3 周目。spec が落ちる・たまに落ちる (flake) を、**trace viewer と video で原因を特定し、正しいシグナル待ちで直す**段階。endolphin の rig は失敗時アーティファクトを自動で残すので、それを読むのが基本。

## rig のアーティファクト設定 (既定)

`playwright.config.ts` の `use`:

- `trace: 'on-first-retry'` / `video: 'on-first-retry'` / `screenshot: 'only-on-failure'`
- `retries: process.env.CI ? 2 : 0` — **retry は CI だけ**。ローカルは 0 なので、ローカルで trace を採るには retry を明示的に有効化する。
- CI は `playwright-report/` を artifact としてアップロードする (workflow が `always()` で回収)。

## ステップ 1: ローカルで trace 付き再現

ローカルは `retries: 0` で `on-first-retry` が発火しないため、trace を強制する:

```bash
pnpm -C playwright test --grep "<test name>" --trace on   # 毎回 trace を採る
pnpm -C playwright show-report                            # = pnpm -C playwright report
```

CI で落ちた場合は、その run の `playwright-report` artifact を落として `pnpm -C playwright exec playwright show-trace <trace.zip>` で開く。

## ステップ 2: trace を読む

trace viewer のタイムラインで、**落ちたアクションの直前に「何を待っていたか / 何が来なかったか」**を見る。典型の見分け:

- アクションが **要素を待ち続けてタイムアウト** → セレクタが合っていない (data-cy のズレ) か、要素がまだ描画されていない (待ちが早すぎ)。
- クリックが **別要素に当たる / intercept される** → モーダル backdrop が乗っている。
- ネットワーク完了前に次へ進んでいる → API 応答待ちが抜けている。

## ステップ 3: endolphin 頻出の flake 原因と対処

| 症状 | 原因 | 対処 |
|---|---|---|
| login 直後の操作が welcome 画面に飛ぶ | signin 成功後にクライアントが token を localStorage に保存して home へ**リロード**する。これと競合 | `fixtures/misskey.ts` の `login()` が `signin-flow` 応答 + home 要素の可視を待つ。自前ログインせず fixtures を使う |
| クリックが効かない / backdrop に阻まれる | 新規ユーザーの初期設定ウィザードが全ページ共通 popup で割り込む | **遷移先に着いた後**に `dismissUserSetup(page)` を 1 回呼ぶ (遷移前に閉じても再オープンする) |
| 投稿したノートが TL に出ない (たまに) | TL 反映に伝播ラグがある | `waitForTimeout` でなく `expect(page.getByText(body).first()).toBeVisible({ timeout: 15_000 })` で**結果**を待つ |
| upstream sync 後に急に全滅 | `data-cy-*` 属性が upstream 側で変わった | セレクタを現行 DOM に合わせて直す (安価)。詳細は [knowledge/what-belongs-in-pw.md](../knowledge/what-belongs-in-pw.md) のメンテ規律 |

## 原則: sleep でなくシグナルを待つ

flake の最大の元は**任意時間の `waitForTimeout`**。直すときは「何が起きたら次へ進めるのか」を `waitFor({ state: 'visible' })` / `waitForResponse((r) => r.url().includes('/api/…'))` / `expect(...).toBeVisible()` で**明示的に待つ**。MCP 探索 ([exploring-with-mcp.md](exploring-with-mcp.md)) で観察した「待ちの正体」がそのままここで効く。

## 直したら

`--trace on` で複数回回して安定を確認し、`pnpm -C playwright run typecheck` を通してから commit。アーティファクト (trace.zip / video / report) は commit しない (`playwright/` の出荷規約・[exploring-with-mcp.md](exploring-with-mcp.md) の鉄則と同じ)。
