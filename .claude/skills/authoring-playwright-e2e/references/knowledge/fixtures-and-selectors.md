# fixtures とセレクタ戦略

蒸留した spec が短く・安定になるための 2 本柱。**正本は [playwright/fixtures/misskey.ts](../../../../../playwright/fixtures/misskey.ts)** (ここではフルコードを複製せず、何があるか + 使い分けだけ示す)。

## fixtures ヘルパ (`../../fixtures/misskey` から import)

spec からは相対パス `../../fixtures/misskey` で import する (`tests/<category>/foo.spec.ts` から見た場合)。

| ヘルパ | 役割 |
|---|---|
| `test` / `expect` | `@playwright/test` の再エクスポート。spec はこれを import する |
| `resetDb(request)` | `POST /api/reset-db` → 204 を確認。テスト DB 初期化 |
| `registerUser(request, name, pass, isAdmin?)` | admin は `/api/admin/accounts/create` (`setupPassword` 同梱)、一般は `/api/signup`。作成 body (`token` / `id` を含む) を返す |
| `setupInstance(request)` | `registerUser('admin', 'admin1234', true)` で初期管理者を作りインスタンスをセットアップ。admin を返す |
| `login(page, name, pass)` | `data-cy-signin*` 経由の UI ログイン。signin 後の home リロード競合を避けるため、`signin-flow` 応答 + home 要素の可視まで待つ |
| `dismissUserSetup(page)` | 新規ユーザーが login 直後に出す初期設定ウィザードを閉じる。**操作対象ページへ遷移した後**に 1 回呼ぶ (遷移前に閉じても再オープンして backdrop がクリックを遮る) |
| `prepareLoggedInUser(page, request, name?, pass?)` | `resetDb` → `setupInstance` → `registerUser` → `login` の一括。既定ユーザーは `alice` / `alice1234` |
| `callApi(request, endpoint, data?)` | `POST /api/{endpoint}` を叩き `{ status, body }` を返す。スタブ read 系の shape 検証に使う |
| `expectFeatureRemoved(request, endpoint, token?, extra?)` | 削除 write 系が 410 + `error.code === 'FEATURE_REMOVED'` を返すことを検証 |

定数 `ADMIN_SETUP_PASSWORD` も export される (初期管理者作成の `setupPassword`)。

典型の組み方:

```ts
test.beforeEach(async ({ page, request }) => {
	await prepareLoggedInUser(page, request); // reset→admin→user→login
	await dismissUserSetup(page);             // 遷移後にウィザードを閉じる
});
```

API 契約テスト (`removed/`) は UI を経由せず `beforeAll` で `resetDb` + `setupInstance` + `registerUser` してトークンを取り、`callApi` / `expectFeatureRemoved` で叩く (手本: [playwright/tests/removed/api-stubs.spec.ts](../../../../../playwright/tests/removed/api-stubs.spec.ts))。

## セレクタ戦略

優先順位は次の通り。**理由は「upstream の低 churn な契約に乗ることで DOM 変更に巻き込まれにくくする」** こと。

1. **`data-cy-*` 再利用 (最優先)。** upstream が自分の Cypress 用に保守している属性。`page.locator('[data-cy-open-post-form]')` や `getByTestId(...)` で使う。例: `data-cy-signin` / `data-cy-signin-username` / `data-cy-open-post-form` / `data-cy-post-form-text` / `data-cy-open-post-form-submit` / `data-cy-user-setup` / `data-cy-modal-window-close` / `data-cy-modal-dialog-ok`。
2. **role / text (`data-cy` が無い画面)。** `getByRole('menuitem', { name: 'Timeline' })` / `getByText(...)`。rig は `locale: 'en-US'` 固定なので英語テキストで決定的に当たる (`playwright.config.ts` 参照)。
3. **安定 CSS class (最後の手段)。** フォロー の `.koudoku` など、意味が安定しているクラスのみ。codegen が吐く脆い nth-child / 長い CSS パスはここに**頼らない**。

新たに `data-cy-*` を upstream UI に足したくなったら、それは `packages/frontend/` の改変＝ upstream churn を増やす行為。原則は**既存 `data-cy-*` の再利用**に留め、無ければ role/text で凌ぐ (fork-policy P2 の追従コスト最小化)。

## 手本 spec

- 基幹 happy-path: [playwright/tests/core/note.spec.ts](../../../../../playwright/tests/core/note.spec.ts)
- 削除コントラクト: [playwright/tests/removed/api-stubs.spec.ts](../../../../../playwright/tests/removed/api-stubs.spec.ts)
- fork 自作画面: [playwright/tests/fork/deck.spec.ts](../../../../../playwright/tests/fork/deck.spec.ts)
