# endolphin Feature Inventory (Phase 1 Deliverable 1)

- **日付**: 2026-06-18
- **対象 spec**: [docs/superpowers/specs/2026-06-18-endolphin-product-definition-design.md](../superpowers/specs/2026-06-18-endolphin-product-definition-design.md) §9（未解決事項 / Phase 1 冒頭の機能インベントリ作成タスク）
- **位置づけ**: Phase 1 の **ゲーティングドキュメント**。全 REST endpoint と全フロント画面を列挙し、各機能を keep / remove / no-op に分類する。これが §9.2（最小モデレーション）/ §9.3（最小ロール）/ §9.4（未言及機能の最終確認）の判断材料になる。

## 目的

本 spec §9 は「具体的なインベントリに対してのみ判断可能」な事項を Phase 1 の成果物に委ねている。本ファイルはその成果物であり、以下を満たす:

1. backend の全 endpoint（endpoint-list 登録分）を機能単位で分類する。
2. frontend の全画面・コンポーネントを機能単位で分類する。
3. Phase 1 の 6 削除機能に属する endpoint / 画面を **網羅的に** 列挙する。
4. 明らかなコア機能は機能グループ単位で `keep(core)` にまとめ、過剰分析しない。
5. §9.2 / §9.3 / §9.4 で後送りにする判断対象を staging（決定はしない）。

## keep / remove / no-op のセマンティクス（endolphin Phase 1 削除コントラクト）

spec §3 P3 / §5 の削除実行方式に対応する。

| 区分 | 意味 |
|---|---|
| **keep** | 機能を残す。endpoint も画面もそのまま。 |
| **no-op (read endpoint)** | endpoint は endpoint-list に登録したまま残し（misskey-js も型を生成し続ける）、ハンドラは削除済み entity を参照せず **静的に空（`[]` / `null` / 既定値）を返す**。削除機能の read 系 endpoint が対象。サードパーティアプリがエンドポイント呼び出しで落ちないようにするため。 |
| **ApiError stub (write endpoint)** | endpoint は endpoint-list に登録したまま残すが、ハンドラは `FEATURE_REMOVED`（HTTP 410 Gone）の `ApiError` を throw する。削除機能の write 系 endpoint（create / update / delete / like / unlike 等）が対象。 |
| **remove (UI / service)** | frontend のページ・コンポーネント、および参照されなくなった backend service を **物理削除** する。一方で **entity / table / migration / JSON-schema（misskey-js が参照する `ref` 型など）は KEEP**（DB 互換・型互換維持のため）。 |

> **重要**: no-op stub は削除済み entity / service を参照しない。read endpoint のハンドラ本体を「静的な空レスポンス」に置き換える。write endpoint のハンドラは `ApiError(410, FEATURE_REMOVED)` に置き換える。endpoint ファイル自体・meta / paramDef / res 定義・endpoint-list 登録行は残す（型生成のため）。

## Phase 1 削除対象 6 機能

spec §6 Phase 1 で「葉機能のハード削除」とされる 6 機能:

| # | 機能 | feature タグ | 備考 |
|---|---|---|---|
| 1 | ギャラリー | `gallery` | 葉・自己完結。read endpoint は no-op stub。 |
| 2 | ページ | `pages` | 葉・自己完結。read endpoint は no-op stub。`MkPageHeader` / `PageWithHeader` 等のコア「ページ枠」レイアウトとは別物（後者は keep）。 |
| 3 | 実績 | `achievements` | `claimAchievement()` 呼び出しが各サービスに散在（削除は段階的、呼び出し点除去 → 本体削除）。 |
| 4 | Games | `reversi` / `bubble-game` / `clicker` | リバーシ + bubble-game（drop-and-fusion）+ clicker を Games として一括削除。 |
| 5 | お気に入り | `favorites` | ノートのお気に入り（`notes/favorites/*`, `i/favorites`, `i/export-favorites`）。クリップ（clips）は **残す**。 |
| 6 | 埋め込み | `embed` | `packages/frontend-embed` 別パッケージ + フロントの埋め込みコード生成ダイアログ。**REST endpoint は持たない**（endpoint-list に embed エントリ無し）ため endpoint 表には現れない。 |

### Phase 2（本ファイルでは keep-for-now）

spec §6 Phase 2 はコア絡みの削除。本 Phase 1 インベントリでは **削除しない**（keep-for-now / Phase 2 マーク）。

| 機能 | feature タグ | 扱い |
|---|---|---|
| チャンネル | `channels(Phase2)` | keep-for-now。ノート生成 / ストリーミング / TL に統合されているため Phase 2 で依存切り後に削除。 |
| チャート | `charts(Phase2)` | keep-for-now。集計フックが各サービスに散在。Phase 2 でフック除去後にエンジン削除 or no-op 化。 |

## カウント整合性（実測値）

以下はすべて本ファイル作成時点（2026-06-18, branch `develop`）の実測値。再計測コマンドは「再生成方法」節を参照。

- **総 endpoint 数**: **437**（`endpoint-list.ts` の `export * as 'X'` 行数）
- **総フロント `.vue` 数**: **586**（`packages/frontend/src` 配下）
  - `pages/`: **248**
  - `components/`: **267**
  - `widgets/`: **38**
  - `ui/`: **33**
- **ルータブルパス数**: **151**（`router.definition.ts` の `path:` 行数）

> spec §9 では「439 endpoint / 586 画面」と概算されていた。実測では endpoint は **437**（fork 基盤整備時点での upstream 状態に依存。±数件は upstream マージで変動しうる）、`.vue` は **586** で一致した。endpoint 数（437）と `.vue` 数（586）と ルータブルパス数（151）は **別軸の数え方**であり一致しない（1 機能が複数 endpoint・複数コンポーネントを持つ、レイアウト用 `.vue` はルートを持たない、等）。
>
> **keep / remove の判断は個別行ではなく FEATURE レベルで行う。** 例えば「gallery」という 1 機能の決定が、`gallery/*` の全 endpoint と `*gallery*.vue` の全画面に伝播する。本表は機能の根拠として個別行を列挙するが、決定の単位は機能である。

## 再生成方法（upstream マージ後にこのドキュメントを更新する手順）

```bash
cd <repo-root>

# 総 endpoint 数
grep -cE "^export \* as '" packages/backend/src/server/api/endpoint-list.ts

# 全 endpoint 名の列挙
grep -E "^export \* as '" packages/backend/src/server/api/endpoint-list.ts \
  | sed -E "s/^export \* as '([^']+)'.*/\1/"

# 総フロント .vue 数（ディレクトリ別）
find packages/frontend/src           -name '*.vue' | wc -l
find packages/frontend/src/pages      -name '*.vue' | wc -l
find packages/frontend/src/components -name '*.vue' | wc -l
find packages/frontend/src/widgets    -name '*.vue' | wc -l
find packages/frontend/src/ui         -name '*.vue' | wc -l

# ルータブルパス数
grep -cE "^\s*path:" packages/frontend/src/router.definition.ts

# 削除機能の画面探索（例）
find packages/frontend/src -iname '*gallery*.vue' -o -iname '*reversi*.vue' \
  -o -iname '*achievement*.vue' -o -iname '*drop-and-fusion*.vue' \
  -o -iname '*clicker*.vue' -o -iname '*embed*.vue'

# 個別 endpoint の read/write 判定（meta.kind を確認）
grep -hE "kind:|requireCredential:" \
  packages/backend/src/server/api/endpoints/<group>/<name>.ts
```

read/write の機械判定が曖昧な場合は当該 endpoint ファイルを開き、`meta.kind`（`read:*` / `write:*`）または `requireCredential` / 実際に mutation するかで確定する。

---

## 2. Endpoint 表

`endpoint | group | rw | decision | feature | notes`。`group` = path 第 1 セグメント。

明らかなコアグループ（`notes` / `users` / `drive` / `following` 等）は **グループ単位で `keep(core)` に集約** し、その中に紛れている削除機能 endpoint だけを個別行に展開する。削除機能・モデレーション・ロールは網羅的に列挙する。

### 削除機能 endpoint（網羅）

#### gallery（feature: gallery） — グループ全体が削除対象

| endpoint | rw | decision | notes |
|---|---|---|---|
| `gallery/featured` | read | no-op (read) | 静的に `[]` を返す（`requireCredential: false`）。 |
| `gallery/popular` | read | no-op (read) | 静的に `[]`。 |
| `gallery/posts` | read | no-op (read) | 静的に `[]`。 |
| `gallery/posts/show` | read | no-op (read) | 静的に `null` / NoSuchPost 風空応答。 |
| `gallery/posts/create` | write | ApiError stub (write) | `kind: write:gallery`。FEATURE_REMOVED 410。 |
| `gallery/posts/update` | write | ApiError stub (write) | FEATURE_REMOVED 410。 |
| `gallery/posts/delete` | write | ApiError stub (write) | FEATURE_REMOVED 410。 |
| `gallery/posts/like` | write | ApiError stub (write) | `kind: write:gallery-likes`。 |
| `gallery/posts/unlike` | write | ApiError stub (write) | `kind: write:gallery-likes`。 |

`i/*` / `users/*` グループに属する gallery 関連:

| endpoint | group | rw | decision | notes |
|---|---|---|---|---|
| `i/gallery/likes` | i | read | no-op (read) | 自分の like 一覧。静的 `[]`。 |
| `i/gallery/posts` | i | read | no-op (read) | 自分の投稿一覧。静的 `[]`。 |
| `users/gallery/posts` | users | read | no-op (read) | 指定ユーザーの投稿一覧。静的 `[]`。 |

#### pages（feature: pages） — グループ全体が削除対象

| endpoint | rw | decision | notes |
|---|---|---|---|
| `pages/featured` | read | no-op (read) | 静的 `[]`。 |
| `pages/show` | read | no-op (read) | 静的 `null`。 |
| `pages/create` | write | ApiError stub (write) | FEATURE_REMOVED 410。 |
| `pages/update` | write | ApiError stub (write) | FEATURE_REMOVED 410。 |
| `pages/delete` | write | ApiError stub (write) | FEATURE_REMOVED 410。 |
| `pages/like` | write | ApiError stub (write) | `kind: write:page-likes`。 |
| `pages/unlike` | write | ApiError stub (write) | `kind: write:page-likes`。 |
| `page-push` | write | ApiError stub (write) | ページの AiScript push。FEATURE_REMOVED 410。 |

`i/*` / `users/*` グループに属する pages 関連:

| endpoint | group | rw | decision | notes |
|---|---|---|---|---|
| `i/page-likes` | i | read | no-op (read) | 静的 `[]`。 |
| `i/pages` | i | read | no-op (read) | 自分のページ一覧。静的 `[]`。 |
| `users/pages` | users | read | no-op (read) | 指定ユーザーのページ一覧。静的 `[]`。 |

#### achievements（feature: achievements）

| endpoint | group | rw | decision | notes |
|---|---|---|---|---|
| `i/claim-achievement` | i | write | ApiError stub (write) | `kind: write:account`。実績付与。FEATURE_REMOVED 410。各サービスの `claimAchievement()` 呼び出し点除去は別タスク。 |
| `users/achievements` | users | read | no-op (read) | `requireCredential: false`。静的 `[]`。 |

#### Games: reversi（feature: reversi）

| endpoint | rw | decision | notes |
|---|---|---|---|
| `reversi/games` | read | no-op (read) | `requireCredential: false`。静的 `[]`。 |
| `reversi/show-game` | read | no-op (read) | `requireCredential: false`。静的 `null`。 |
| `reversi/invitations` | read | no-op (read) | `kind: read:account`。静的 `[]`。 |
| `reversi/verify` | read | no-op (read) | ゲーム状態の CRC 照合。静的に `{ desynced: true, game: null }` 相当を返す。 |
| `reversi/match` | write | ApiError stub (write) | `kind: write:account`。マッチング。FEATURE_REMOVED 410。 |
| `reversi/cancel-match` | write | ApiError stub (write) | FEATURE_REMOVED 410。 |
| `reversi/surrender` | write | ApiError stub (write) | FEATURE_REMOVED 410。 |

#### Games: bubble-game（feature: bubble-game / drop-and-fusion）

| endpoint | rw | decision | notes |
|---|---|---|---|
| `bubble-game/ranking` | read | no-op (read) | `allowGet`。静的 `[]`。 |
| `bubble-game/register` | write | ApiError stub (write) | `kind: write:account`。スコア登録。FEATURE_REMOVED 410。 |

> clicker（`MkClickerGame` / `WidgetClicker` / `clicker.vue`）は **フロント完結** で専用 REST endpoint を持たない（永続化はノート / registry 経由）。endpoint 表には現れず、UI のみ remove 対象。

#### favorites（feature: favorites） — ノートのお気に入り。clips は別機能で keep

| endpoint | group | rw | decision | notes |
|---|---|---|---|---|
| `notes/favorites/create` | notes | write | ApiError stub (write) | `kind: write:favorites`。FEATURE_REMOVED 410。 |
| `notes/favorites/delete` | notes | write | ApiError stub (write) | `kind: write:favorites`。 |
| `i/favorites` | i | read | no-op (read) | お気に入りノート一覧。静的 `[]`。`favorites.vue` がこれを叩く。 |
| `i/export-favorites` | i | write | ApiError stub (write) | `secure: true`。エクスポートジョブ起動 = mutation。FEATURE_REMOVED 410。 |

> `clips/favorite` / `clips/unfavorite` / `clips/my-favorites` / `channels/favorite` 等の「favorite」は **クリップ / チャンネルのお気に入り** であり、削除対象の「ノートお気に入り」ではない。clips は keep(core)、channels は Phase 2。

#### embed（feature: embed）

- **REST endpoint なし**（`endpoint-list.ts` に `embed` エントリは存在しない）。埋め込みはサーバ側の別ルート + `packages/frontend-embed` 別パッケージ + フロントの埋め込みコード生成ダイアログで構成される。endpoint 表には行が無い。UI / パッケージのみ remove 対象（画面表を参照）。

### コアグループ（keep(core) に集約）

以下は機能グループ単位で `keep(core)`。削除機能に属する個別 endpoint は上の節で既に抜き出し済み。

| group | 代表 endpoint 数の所属 | decision | feature | notes |
|---|---|---|---|---|
| `notes` | timeline / create / delete / reactions / polls / drafts / search / thread-muting 等 | keep(core) | core | 高 churn コア。**例外**: `notes/favorites/*` のみ削除（上記 favorites 節）。`notes/clips` は keep（clips 機能）。 |
| `users` | show / search / following / followers / lists/* / notes / reactions / relation 等 | keep(core) | core | **例外**: `users/gallery/posts`（gallery）/ `users/pages`（pages）/ `users/achievements`（achievements）は削除（各節参照）。`users/flashs` は keep（Play/Flash は残す）。`users/report-abuse` は §9.2 レビュー対象。 |
| `i` | update / notifications / 2fa/* / registry/* / apps / webhooks/* / export-*/import-* / pin / move 等 | keep(core) | core | **例外**: `i/favorites` / `i/export-favorites`（favorites）、`i/pages` / `i/page-likes`（pages）、`i/gallery/*`（gallery）、`i/claim-achievement`（achievements）は削除（各節参照）。 |
| `drive` | files/* / folders/* / stream 等 | keep(core) | core | 高 churn コア。全 keep。 |
| `following` | create / delete / list / requests/* / update 等 | keep(core) | core | 全 keep。 |
| `notifications` | create / flush / mark-all-as-read / test-notification | keep(core) | core | 全 keep。 |
| `antennas` | create / delete / list / notes / show / update / remove-note | keep(core) | core | spec §4「残す」（アンテナ）。 |
| `clips` | create / delete / list / add-note / remove-note / favorite / unfavorite / my-favorites / notes / show / update | keep(core) | core | spec §4「残す」（クリップ）。favorites 機能とは別。 |
| `flash` | create / delete / update / show / featured / like / unlike / my / my-likes / search | keep(core) | core | spec §4「残す」（Play / Flash）。Games ではない。 |
| `hashtags` | list / search / show / trend / users | keep(core) | core | spec §4「残す」（ハッシュタグ / トレンド）。 |
| `blocking` / `mute` / `renote-mute` | create / delete / list | keep(core) | core | 個人レベルのブロック / ミュート。spec §4「残す」。 |
| `following` 系の `users/lists/*` | （users グループ内） | keep(core) | core | spec §4「残す」（リスト）。 |
| `auth` / `app` / `my/apps` / `miauth` | session/* / create / show / gen-token | keep(core) | core | API トークン / OAuth 互換。spec §4「残す」。 |
| `sw` | register / show-registration / unregister / update-registration | keep(core) | core | Web Push。通知に必要。 |
| `announcements` | announcements / show / admin/announcements/* | keep(core) | core | spec §4「残す」（アナウンス）。 |
| `invite` | create / delete / limit / list / admin/invite/* | keep(core) | core | spec §4「残す」（登録 / 招待）。 |
| `ap` | get / show | keep(core) | core | ActivityPub。完全準拠維持（spec §3 P3）。 |
| `federation` | followers / following / instances / show-instance / stats / users / update-remote-user | keep(core) | core | 連合。完全準拠維持。`federation/update-remote-user` は admin 寄り。 |
| `emoji` / `emojis` / `export-custom-emojis` / `get-avatar-decorations` | （トップレベル read） | keep(core) | core | spec §4「残す」（カスタム絵文字）。 |
| `meta` / `stats` / `ping` / `server-info` / `endpoint(s)` / `emoji(s)` / `get-online-users-count` / `pinned-users` / `retention` / `email-address/available` / `username/available` / `fetch-rss` / `fetch-external-resources` / `verify-email` / `request-reset-password` / `reset-password` / `promo/read` / `test` / `reset-db` | （メタ / ユーティリティ） | keep(core) | core | インスタンスメタ・ユーティリティ。全 keep。`reset-db` / `test` はテスト専用（NODE_ENV ガード）。 |
| `notifications` 系 `i/notifications*` | （i グループ） | keep(core) | core | 通知。keep。 |
| `chat/*` | messages/* / rooms/* / history / read-all | keep(core) | core | チャット。spec 未言及だが「明らかに冗長でなければ残す」（§4 既定ルール）→ keep-for-now。§9.4 で最終確認。 |

### moderation / admin / roles（§9.2 / §9.3 レビュー対象）

spec §9.2（最小モデレーション）/ §9.3（最小ロール）で線引きを後送り。**現時点では全 keep(core)** だが、後で削減候補になりうるためフラグを立てる。

#### roles（feature: roles）

| endpoint | group | rw | decision | notes |
|---|---|---|---|---|
| `roles/list` | roles | read | keep(core) — review §9.3 | 公開ロール一覧。 |
| `roles/show` | roles | read | keep(core) — review §9.3 | |
| `roles/users` | roles | read | keep(core) — review §9.3 | |
| `roles/notes` | roles | read | keep(core) — review §9.3 | ロールタイムライン。 |
| `admin/roles/create` | admin | write | keep(core) — review §9.3 | ロール作成。 |
| `admin/roles/delete` | admin | write | keep(core) — review §9.3 | |
| `admin/roles/update` | admin | write | keep(core) — review §9.3 | |
| `admin/roles/list` | admin | read | keep(core) — review §9.3 | |
| `admin/roles/show` | admin | read | keep(core) — review §9.3 | |
| `admin/roles/users` | admin | read | keep(core) — review §9.3 | |
| `admin/roles/assign` | admin | write | keep(core) — review §9.3 | |
| `admin/roles/unassign` | admin | write | keep(core) — review §9.3 | |
| `admin/roles/update-default-policies` | admin | write | keep(core) — review §9.3 | ポリシー既定値。最小ロール線引きの中心。 |

#### moderation（abuse-report / user-state / federation / ad / promo 等; feature: moderation）

| endpoint | group | rw | decision | notes |
|---|---|---|---|---|
| `admin/abuse-user-reports` | admin | read | keep(core) — review §9.2 | 通報一覧。 |
| `admin/resolve-abuse-user-report` | admin | write | keep(core) — review §9.2 | |
| `admin/forward-abuse-user-report` | admin | write | keep(core) — review §9.2 | |
| `admin/update-abuse-user-report` | admin | write | keep(core) — review §9.2 | |
| `admin/abuse-report/notification-recipient/create` | admin | write | keep(core) — review §9.2 | |
| `admin/abuse-report/notification-recipient/delete` | admin | write | keep(core) — review §9.2 | |
| `admin/abuse-report/notification-recipient/list` | admin | read | keep(core) — review §9.2 | |
| `admin/abuse-report/notification-recipient/show` | admin | read | keep(core) — review §9.2 | |
| `admin/abuse-report/notification-recipient/update` | admin | write | keep(core) — review §9.2 | |
| `users/report-abuse` | users | write | keep(core) — review §9.2 | 通報送信（一般ユーザー）。 |
| `admin/suspend-user` | admin | write | keep(core) — review §9.2 | ユーザー凍結。 |
| `admin/unsuspend-user` | admin | write | keep(core) — review §9.2 | |
| `admin/delete-account` | admin | write | keep(core) — review §9.2 | |
| `admin/delete-all-files-of-a-user` | admin | write | keep(core) — review §9.2 | |
| `admin/reset-password` | admin | write | keep(core) — review §9.2 | |
| `admin/update-user-note` | admin | write | keep(core) — review §9.2 | モデレーションメモ。 |
| `admin/unset-user-avatar` | admin | write | keep(core) — review §9.2 | |
| `admin/unset-user-banner` | admin | write | keep(core) — review §9.2 | |
| `admin/show-user` | admin | read | keep(core) — review §9.2 | |
| `admin/show-users` | admin | read | keep(core) — review §9.2 | |
| `admin/get-user-ips` | admin | read | keep(core) — review §9.2 | |
| `admin/show-moderation-logs` | admin | read | keep(core) — review §9.2 | |
| `admin/federation/update-instance` | admin | write | keep(core) — review §9.2 | インスタンスブロック / サイレンス。 |
| `admin/federation/delete-all-files` | admin | write | keep(core) — review §9.2 | |
| `admin/federation/remove-all-following` | admin | write | keep(core) — review §9.2 | |
| `admin/federation/refresh-remote-instance-metadata` | admin | write | keep(core) — review §9.2 | |
| `admin/accounts/create` | admin | write | keep(core) — review §9.2 | アカウント手動作成。 |
| `admin/accounts/delete` | admin | write | keep(core) — review §9.2 | |
| `admin/accounts/find-by-email` | admin | read | keep(core) — review §9.2 | |
| `admin/relays/add` | admin | write | keep(core) — review §9.2 | リレー。 |
| `admin/relays/list` | admin | read | keep(core) — review §9.2 | |
| `admin/relays/remove` | admin | write | keep(core) — review §9.2 | |

#### admin（その他: meta / emoji / drive / queue / ad / announcements / webhook / captcha / invite / ip-stats; feature: moderation/admin）

| endpoint group | endpoints | decision | notes |
|---|---|---|---|
| `admin/meta` / `admin/update-meta` / `admin/server-info` / `admin/get-index-stats` / `admin/get-table-stats` / `admin/update-proxy-account` / `admin/send-email` | read / write | keep(core) — review §9.2 | インスタンス設定。小規模でも必要だが範囲精査対象。 |
| `admin/emoji/*`（add / add-aliases-bulk / copy / delete / delete-bulk / import-zip / list / list-remote / remove-aliases-bulk / set-aliases-bulk / set-category-bulk / set-license-bulk / update）+ `v2/admin/emoji/list` | read / write | keep(core) | カスタム絵文字管理（spec §4「残す」）。 |
| `admin/drive/*`（clean-remote-files / cleanup / files / show-file） | read / write | keep(core) — review §9.2 | ドライブ管理。 |
| `admin/queue/*`（clear / deliver-delayed / inbox-delayed / retry-job / remove-job / show-job / show-job-logs / promote-jobs / pause / resume / jobs / stats / queues / queue-stats / promo/* 含む） | read / write | keep(core) — review §9.2 | ジョブキュー管理。運用に必要だが範囲精査。 |
| `admin/ad/*`（create / delete / list / update）+ `admin/promo/create` | read / write | keep(core) — review §9.4 | 広告 / プロモ。小規模コミュニティでは不要候補。§9.4 で確認。 |
| `admin/announcements/*`（create / delete / list / update） | read / write | keep(core) | アナウンス（spec §4「残す」）。 |
| `admin/avatar-decorations/*`（create / delete / list / update） | read / write | keep(core) — review §9.4 | アバターデコレーション。§9.4 で確認。 |
| `admin/invite/*`（create / list） | read / write | keep(core) | 招待（spec §4「残す」）。 |
| `admin/captcha/*`（current / save） | read / write | keep(core) | 登録時 CAPTCHA。 |
| `admin/system-webhook/*`（create / delete / list / show / test / update） | read / write | keep(core) — review §9.4 | システム Webhook。 |
| `auth/accept` | write | keep(core) | OAuth 互換。 |

### charts（Phase 2; feature: charts(Phase2)）— keep-for-now

| endpoint | rw | decision | notes |
|---|---|---|---|
| `charts/active-users` / `charts/ap-request` / `charts/drive` / `charts/federation` / `charts/instance` / `charts/notes` / `charts/users` | read | keep(core) — Phase 2 | インスタンスチャート。Phase 2 でフック除去後に削除 or no-op 化。 |
| `charts/user/drive` / `charts/user/following` / `charts/user/notes` / `charts/user/pv` / `charts/user/reactions` | read | keep(core) — Phase 2 | ユーザーチャート。 |

### channels（Phase 2; feature: channels(Phase2)）— keep-for-now

| endpoint | rw | decision | notes |
|---|---|---|---|
| `channels/create` / `channels/update` | write | keep(core) — Phase 2 | |
| `channels/favorite` / `channels/unfavorite` / `channels/follow` / `channels/unfollow` | write | keep(core) — Phase 2 | |
| `channels/featured` / `channels/followed` / `channels/my-favorites` / `channels/owned` / `channels/search` / `channels/show` / `channels/timeline` | read | keep(core) — Phase 2 | |
| `channels/mute/create` / `channels/mute/delete` | write | keep(core) — Phase 2 | |
| `channels/mute/list` | read | keep(core) — Phase 2 | |

> Phase 2 でノート生成 / ストリーミング / TL 統合を依存切りした後に削除。本 Phase 1 では一切手を付けない。

---

## 3. Screen / component 表

`kind | path | feature | decision`。`*.stories.impl.ts`（Storybook）は対応コンポーネントと一緒に削除されるが、画面数にはカウントしない（参考として併設有無を notes 化）。

削除機能の画面・コンポーネントは **網羅的に** 列挙し `remove`。それ以外はグループ集約で keep。

### 削除機能の画面・コンポーネント（網羅 / remove）

#### gallery（feature: gallery）

| kind | path | feature | decision |
|---|---|---|---|
| page | `packages/frontend/src/pages/gallery/index.vue` | gallery | remove |
| page | `packages/frontend/src/pages/gallery/edit.vue` | gallery | remove |
| page | `packages/frontend/src/pages/gallery/edit.root.vue` | gallery | remove |
| page | `packages/frontend/src/pages/gallery/post.vue` | gallery | remove |
| page | `packages/frontend/src/pages/user/gallery.vue` | gallery | remove |
| component | `packages/frontend/src/components/MkGalleryPostPreview.vue` | gallery | remove（併設 `MkGalleryPostPreview.stories.impl.ts` も削除） |

#### pages（feature: pages） — コア「ページ枠」レイアウトとは別物

| kind | path | feature | decision |
|---|---|---|---|
| page | `packages/frontend/src/pages/pages.vue` | pages | remove |
| page | `packages/frontend/src/pages/page.vue` | pages | remove |
| page | `packages/frontend/src/pages/user/pages.vue` | pages | remove |
| page | `packages/frontend/src/pages/page-editor/page-editor.vue` | pages | remove |
| page | `packages/frontend/src/pages/page-editor/page-editor.blocks.vue` | pages | remove |
| page | `packages/frontend/src/pages/page-editor/page-editor.container.vue` | pages | remove |
| page | `packages/frontend/src/pages/page-editor/els/page-editor.el.image.vue` | pages | remove |
| page | `packages/frontend/src/pages/page-editor/els/page-editor.el.note.vue` | pages | remove |
| page | `packages/frontend/src/pages/page-editor/els/page-editor.el.section.vue` | pages | remove |
| page | `packages/frontend/src/pages/page-editor/els/page-editor.el.text.vue` | pages | remove |
| component | `packages/frontend/src/components/page/page.vue` | pages | remove |
| component | `packages/frontend/src/components/page/page.block.vue` | pages | remove |
| component | `packages/frontend/src/components/page/page.dynamic.vue` | pages | remove |
| component | `packages/frontend/src/components/page/page.image.vue` | pages | remove |
| component | `packages/frontend/src/components/page/page.note.vue` | pages | remove |
| component | `packages/frontend/src/components/page/page.section.vue` | pages | remove |
| component | `packages/frontend/src/components/page/page.text.vue` | pages | remove |
| component | `packages/frontend/src/components/MkPagePreview.vue` | pages | remove（`/@user/pages/...` へリンク） |
| component | `packages/frontend/src/components/MkPageWindow.vue` | pages | remove（ページのウィンドウ表示） |

> **KEEP（pages 機能ではないコアレイアウト、削除しない）**: `components/global/MkPageHeader.vue` / `MkPageHeader.tabs.vue` / `PageWithHeader.vue` / `PageWithAnimBg.vue` / `components/MkFolderPage.vue`。これらは全画面共通の「ページ枠 / ヘッダ」コンポーネントであり、Misskey 独自の「ページ」機能とは無関係。`MkPageHeader.stories.impl.ts` 等も keep。

#### achievements（feature: achievements）

| kind | path | feature | decision |
|---|---|---|---|
| page | `packages/frontend/src/pages/achievements.vue` | achievements | remove |
| page | `packages/frontend/src/pages/user/achievements.vue` | achievements | remove |
| component | `packages/frontend/src/components/MkAchievements.vue` | achievements | remove（併設 `MkAchievements.stories.impl.ts` も削除） |

#### Games: reversi（feature: reversi）

| kind | path | feature | decision |
|---|---|---|---|
| page | `packages/frontend/src/pages/reversi/index.vue` | reversi | remove |
| page | `packages/frontend/src/pages/reversi/game.vue` | reversi | remove |
| page | `packages/frontend/src/pages/reversi/game.board.vue` | reversi | remove |
| page | `packages/frontend/src/pages/reversi/game.setting.vue` | reversi | remove |

#### Games: drop-and-fusion / bubble-game（feature: bubble-game）

| kind | path | feature | decision |
|---|---|---|---|
| page | `packages/frontend/src/pages/drop-and-fusion.vue` | bubble-game | remove |
| page | `packages/frontend/src/pages/drop-and-fusion.game.vue` | bubble-game | remove |

#### Games: clicker（feature: clicker）

| kind | path | feature | decision |
|---|---|---|---|
| page | `packages/frontend/src/pages/clicker.vue` | clicker | remove |
| component | `packages/frontend/src/components/MkClickerGame.vue` | clicker | remove（併設 `MkClickerGame.stories.impl.ts` も削除） |
| widget | `packages/frontend/src/widgets/WidgetClicker.vue` | clicker | remove |

#### Games: ランディング（feature: games）

| kind | path | feature | decision |
|---|---|---|---|
| page | `packages/frontend/src/pages/games.vue` | games | remove（Games ハブ画面） |

#### favorites（feature: favorites）

| kind | path | feature | decision |
|---|---|---|---|
| page | `packages/frontend/src/pages/favorites.vue` | favorites | remove（`i/favorites` を叩く。no-op 化後は空になるが画面自体を削除） |

#### embed（feature: embed）

| kind | path | feature | decision |
|---|---|---|---|
| component | `packages/frontend/src/components/MkEmbedCodeGenDialog.vue` | embed | remove（呼び出し元 `utility/get-embed-code.ts` も整理） |

> **加えて**: `packages/frontend-embed`（埋め込み専用パッケージ全体）と、サーバ側の埋め込みルートも remove 対象（spec §5 削除トリアージ表「埋め込み = パッケージごと撤去」）。これらは `.vue` 画面表の対象外（別パッケージ / バックエンドルート）だが、embed 機能削除の一部としてここに記録する。

### コア画面・コンポーネント（グループ集約 / keep）

削除機能に属さない `.vue` はすべて keep。代表ディレクトリを集約で示す。

| kind | path (集約) | feature | decision | notes |
|---|---|---|---|---|
| page | `pages/` の残り（gallery / page-editor / page* / reversi / drop-and-fusion* / clicker / games / achievements* / favorites を除く全 ~220 ページ） | core | keep | timeline / note / user / settings / admin / drive / clip / antenna / list / search / about / announcements / chat 等。`pages/channels*` は Phase 2、`pages/admin/*` は §9.2/§9.3 レビュー対象。 |
| component | `components/` の残り（MkGalleryPostPreview / MkPagePreview / MkPageWindow / page/* / MkAchievements / MkClickerGame / MkEmbedCodeGenDialog を除く全 ~250 コンポーネント） | core | keep | `Mk*` 共通部品（note / drive / form / dialog / picker / global layout 等）。`components/global/MkPageHeader*` / `PageWithHeader` / `PageWithAnimBg` / `MkFolderPage` は明示 keep（上記注記参照）。 |
| widget | `widgets/` の残り（WidgetClicker を除く全 37 ウィジェット） | core | keep | デッキ / ウィジェット（spec §4「残す」: デッキ）。`WidgetActivity.chart.vue` / `WidgetFederation.vue` は charts/federation 表示を含むため Phase 2 で再確認。 |
| ui | `ui/` 全 33（deck / classic / universal レイアウト等） | core | keep | クライアントレイアウト。spec §4「残す」（デッキ等の UI アフォーダンス、§3 P1）。 |

---

## 4. 未決事項（§9.2 / §9.3 / §9.4 staging）

本ファイルは以下の判断を **行わない**。後続タスクで本インベントリに対して確定させるための staging のみ。

### §9.2 最小モデレーションの線引き（未決）

対象 endpoint グループ:
- `admin/abuse-*` / `admin/resolve-abuse-user-report` / `admin/forward-abuse-user-report` / `admin/update-abuse-user-report` / `admin/abuse-report/notification-recipient/*`（通報処理）
- `users/report-abuse`（一般ユーザーからの通報送信）
- `admin/suspend-user` / `admin/unsuspend-user` / `admin/delete-account` / `admin/delete-all-files-of-a-user` / `admin/reset-password` / `admin/update-user-note` / `admin/unset-user-avatar` / `admin/unset-user-banner`（ユーザー凍結 / 操作）
- `admin/federation/update-instance`（インスタンスブロック / サイレンス）/ `admin/federation/*`
- `admin/show-user` / `admin/show-users` / `admin/get-user-ips` / `admin/show-moderation-logs`（モデレーション閲覧）
- NG ワード関連は `admin/update-meta`（meta 内のワードミュート設定）に内包

→ 小規模コミュニティに必要な最小セットをインベントリに対して決定（本表では全 `keep(core) — review §9.2`）。

### §9.3 最小ロールの線引き（未決）

対象 endpoint グループ:
- `roles/list` / `roles/show` / `roles/users` / `roles/notes`（公開ロール参照）
- `admin/roles/*`（create / delete / update / list / show / users / assign / unassign / update-default-policies）

→ ロール / ポリシーのうち残す範囲をインベントリに対して決定（本表では全 `keep(core) — review §9.3`）。特に `admin/roles/update-default-policies`（ポリシー既定値）が中心論点。

### §9.4 未言及機能の最終 keep/remove 確認（未決）

spec §4「未言及のコアは明らかに冗長でなければ残す」の適用結果を確認する対象（本表では keep-for-now だが §9.4 で再確認）:
- `admin/ad/*` / `admin/promo/create` / `promo/read`（広告 / プロモ — 小規模では不要候補）
- `admin/avatar-decorations/*`（アバターデコレーション）
- `admin/system-webhook/*` / `i/webhooks/*`（Webhook — spec §4 では「残す」に明記だが範囲確認）
- `chat/*`（チャット — spec §4 未言及。keep-for-now）
- `retention` / `admin/get-index-stats` / `admin/get-table-stats`（統計系）

→ いずれも本 Phase 1 では触らず、§9.4 のレビューで最終判断する。
