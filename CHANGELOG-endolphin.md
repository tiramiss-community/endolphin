# endolphin Changelog

endolphin 固有の変更を記録する。本家 Misskey 由来の変更は upstream 所有の `CHANGELOG.md` を参照（fork では手編集しない）。

書式は本家 `CHANGELOG.md` に倣い、`### General` / `### Client` / `### Server` の下に
`- <Feat|Enhance|Fix|Remove>: <概要>` を 1 行で追記する（機能削除は `Remove:`）。

## Unreleased

### General
- Feat: endolphin fork の基盤を整備（fork メタデータ / upstream 追従フロー / changelog 分離 / fork policy）
- Enhance: ブランディング方針を確定（アプリ識別名のみ Endolphin 化 / 連合自己申告・内部識別子・プラットフォーム prose は温存）し、ビジュアル資産の差し替え口台帳 `docs/endolphin/branding.md` を整備（資産実体・テーマ色 `#86b300` は当面温存）
- Remove: Games 削除（Phase 1）で孤児化していたゲームエンジンのサブパッケージ `misskey-reversi` / `misskey-bubble-game` を撤去（workspace / Dockerfile / CI / vite / 各 package.json 依存 / dev・clean スクリプト / 連合テスト compose の参照も除去）。併せて `GlobalEventService` の死にコードと化していた reversi ストリームのイベント型・publish メソッドを撤去（`ReversiGame` entity / `ReversiGameDetailed` 型 / reversi endpoint スタブは互換のため温存）
- Feat: フロント e2e / LLM 駆動の基盤として fork 所有の Playwright 環境を追加（`playwright/` 一式 / compose で test 用 postgres・redis をライフサイクル管理 / 専用 CI workflow `test-frontend-e2e-playwright.yml`、ローカル実行も対応）。基幹 happy-path（signup / signin / ノート投稿→TL 反映 / ドライブアップロード / フォロー / 設定画面）のスイートを同梱。LLM 駆動の Playwright MCP は Claude Code の既存プラグイン経由で利用（project `.mcp.json` は二重登録回避のため同梱しない）。upstream の cypress・start:test は無改変で流用（詳細は `docs/endolphin/playwright-e2e.md`）
- Feat: Playwright e2e に Stage 2（削除コントラクト回帰）と Stage 3（fork 自作の低 churn 画面）のスイートを追加。Stage 2 = 削除機能（gallery / pages / achievements / Games / favorites / ads / charts / chat 等）のルートが not-found に落ちること・ナビ/プロフィールタブに導線が残っていないこと・read API がスタブ空（`[]`/`null`/`{}`/空チャート/NO_SUCH_*）/write API が `FEATURE_REMOVED`(410) を返すこと・削除後も基幹（投稿→TL）が回ることを機械保証（`playwright/tests/removed/`）。Stage 3 = デッキ多カラム UI（P1 で守る UX アフォーダンス：カラム追加導線と追加動作）・fork 固有の about ページ（`/about-misskey` の Endolphin/Misskey 2 タブ）・設定サブセットの死活を固定（`playwright/tests/fork/`）。スタブ契約検証ヘルパ（`callApi` / `expectFeatureRemoved`）を fixtures に追加
- Enhance: Playwright e2e に探索セッション用ヘルパ `pnpm -C playwright explore` を追加（Stage 4）。`test` と同じ compose（pg/redis）+ 無改変 `start:test` を起動して `:61812` を保持し、Ctrl-C で `start:test` 停止 + `docker compose down -v` まで自動撤去する（既に `:61812` が起動済なら再利用し撤去しない / `PW_SKIP_COMPOSE=1` で compose スキップ）。対話的な Playwright MCP（`browser_*`）/ codegen 探索向け。spec の実行は従来どおり `pnpm -C playwright test` が webServer + globalTeardown で起動/終了を自前にやるためこのヘルパは不要＝探索セッション専用

### Client
- Remove: お気に入り (favorites) 機能の UI（一覧ページ / ナビ項目 / ノートメニュー / データエクスポート項目）を削除
- Remove: ギャラリー (gallery) 機能の UI（一覧/投稿/編集ページ / ナビ項目 / プロフィールタブ）を削除
- Remove: Games（リバーシ / バブルゲーム / クリッカー / ゲームハブ）の UI（各ページ / ナビ項目 / クリッカーウィジェット）を削除
- Remove: ページ (Pages) 機能の UI（一覧/閲覧ページ / ページエディタ / ナビ項目 / プロフィールタブ）を削除
- Remove: 実績 (achievements) 機能の UI（実績ページ / ナビ項目 / プロフィールタブ）を削除し、実績獲得処理を無効化（通知の表示互換は維持）
- Remove: 埋め込みコード生成 UI（ノート/ユーザー/クリップ/タグの「埋め込み」メニューとコード生成ダイアログ）を削除
- Remove: チャート (charts) 機能の UI（`MkChart` / インスタンス統計 `MkInstanceStats` / About のチャートタブ / インスタンス情報のチャートタブ / 管理ダッシュボードのチャートセクション（Stats・Active users・Federation・Ap requests・New users）/ 管理ユーザー詳細のチャート / ユーザーのアクティビティチャート / アクティビティウィジェット / 訪問者ダッシュボードのアクティブユーザーチャート / ドライブ設定のチャート）を削除（ヒートマップ / リテンション / キュー監視チャート / ミニチャート等の Chart.js 共有部品は維持）
- Remove: 初回チュートリアル（タイムラインチュートリアル）を削除（`MkTutorialDialog` 一式 / インスタンスメニューの起動項目）
- Enhance: 初期設定ウィザードをフォロー提案・プッシュ通知許可のみに簡素化（プロフィール / プライバシー編集ステップとチュートリアル誘導を撤去し 6 → 4 ページに）
- Fix: チャート削除後に残っていたインスタンスメニューの「チャート」項目（`/about#charts` への dead link）を除去
- Remove: 管理画面の DB ダッシュボード（`/admin/database`）とナビ項目を削除
- Remove: 管理概要のリテンション分析セクションと専用コンポーネント（`MkRetentionHeatmap` / `MkRetentionLineChart`）を削除（アクティビティヒートマップは維持）
- Remove: 広告枠（タイムライン / ストリーミング TL / Play の広告表示）・広告管理画面（`/admin/ads`）・広告一覧ページ（`/ads`）・`MkAd` コンポーネント・管理設定の広告配信フォームを削除
- Remove: チャット（DM / グループ）の UI を削除（全チャット画面 `/chat*` / `MkChatHistories` / `WidgetChat` / デッキの chat 列 / ナビ・ユーザーメニューの導線 / 設定のチャット項目（読み取り既読化・送信者名表示・Enter送信・chatScope・チャット音）/ チャット招待通知の表示分岐 / ロールポリシーエディタの chatAvailability 項目）。通知種別自体は互換のため温存
- Enhance: about ページの wordmark を Misskey → Endolphin に変更
- Feat: about ページを Endolphin / Misskey の 2 タブ構成に再編（`PageWithHeader` の既存タブ機構を使用）。Endolphin タブは概要・ソースコード（GitHub）・「Endolphin プロジェクトメンバー」（@samunohito）と Misskey タブへの導線を表示、Misskey タブは従来の about 内容（ソース / 翻訳 / 寄付 / プロジェクトメンバー / Special thanks / 支援者）を踏襲（locale キー `_aboutMisskey.aboutEndolphin` / `endolphinProjectMembers` / `learnAboutMisskey` を追加）

### Server
- Enhance: アプリ識別名のフォールバックを Misskey → Endolphin に変更（PWA manifest 静的値 / document `<title>`・`og:*`・`application-name` メタ / OpenSearch / error・CLI・BIOS・flush・info-card view の見出し・メタ / 全 HTML 先頭コメントの挨拶 / `instanceName`・`title` フォールバック）。連合 nodeinfo `software.name`・User-Agent・内部識別子・テーマ色 `#86b300` は互換のため温存。runtime はインスタンス設定（`meta.name` 等）が従来どおり優先
- Remove: お気に入り (favorites) 機能の write API を無効化し read API は空を返すよう変更（`notes/favorites/create`・`notes/favorites/delete`・`i/export-favorites` は `FEATURE_REMOVED` を返却、`i/favorites` は空配列を返却。endpoint 登録と型は互換のため維持）。関連の `NoteFavoriteEntityService` / お気に入りエクスポート処理を削除
- Remove: ギャラリー (gallery) 機能の write API を無効化し read API は空を返すよう変更（endpoint 登録と型は互換のため維持、web ルートと GalleryPost/GalleryLike の packing service を削除）
- Remove: Games（リバーシ / バブルゲーム）の write API を無効化し read API は空を返すよう変更（endpoint 登録と型は互換のため維持、ReversiService・リバーシ streaming channel・web ルート・packing service を削除）
- Remove: ページ (Pages) 機能の write API を無効化し read API は空を返すよう変更（endpoint 登録と型は互換のため維持、PageService・PageLike の packing service・web ルートを削除。pinnedPage 表示は維持）
- Remove: 実績 (achievements) の獲得 API（i/claim-achievement）を無効化し read API は空を返すよう変更（endpoint 登録と型は互換のため維持、AchievementService を削除。achievementEarned 通知型とカラムは inert 保持）
- Remove: 埋め込み配信を撤去（`packages/frontend-embed` パッケージ・backend の `/embed/*`・`/embed.js`・`/embed_vite` ルート・埋め込み asset 配信機構を削除し、workspace / Dockerfile / CI / clean スクリプトの参照も除去）
- Remove: チャート (charts) 機能を削除（12 チャートサービスクラス・`ChartManagementService`・`ChartLoggerService`・tick/clean/resync の定期ジョブとプロセッサ・各サービスに散在する集計フック（`*Chart.update()` 等）を撤去）。read API（`charts/*`）は登録・型を維持したまま空チャートを返すスタブに変更。`getJsonSchema` とチャート entity 定義は型・DB 互換のため温存（破壊的 migration なし）
- Enhance: チャート削除に伴い `stats` と nodeinfo のノート数・ユーザー数を、チャート集計から DB の直接カウント（クエリキャッシュ付き）に変更（fediverse 統計サイト等が参照する公開面の数値精度を維持）。大規模インスタンスでの COUNT コストは issue #3 で追跡
- Remove: 管理 DB 統計 API（`admin/get-index-stats`・`admin/get-table-stats`）を空返却スタブに変更（endpoint 登録と型は互換のため維持。e2e の汎用 admin 認証フィクスチャ互換のため 200 を維持）
- Remove: リテンション分析を削除（公開 read API `retention` は空配列を返すスタブに変更、`aggregateRetention` 定期ジョブと `AggregateRetentionProcessorService` を撤去。endpoint 登録・型・`retention_aggregation` entity / migration は互換のため温存）
- Remove: 広告・プロモ配信を撤去（`admin/ad/{create,update,delete}`・`admin/promo/create` は `FEATURE_REMOVED` を返却、`admin/ad/list` は空配列・`promo/read` は no-op を返却。`MetaEntityService` の `ads` 配信を常に空配列に置換。endpoint 登録・型・`MetaDetailed.ads`/`notesPerOneAd` 型・`ad`/`promo_note`/`promo_read` entity は互換のため温存）
- Remove: チャット（DM / グループ）の業務サービス・ストリーミングを撤去（`ChatService`・chat-user/chat-room streaming channel を削除、chat/* 25 endpoint は登録維持のままスタブ化（write は `FEATURE_REMOVED` 410 / read は空配列 / `messages/show`・`rooms/show` は not-found を throw）、`drive/files/attached-chat-messages` は空配列スタブ）。`UserEntityService` の `canChat`/`hasUnreadChatMessages` を静的 false に置換（`chatScope` はパススルー温存）。`ChatEntityService`（招待通知 packing 用）・5 entity・6 migration・JSON-schema・misskey-js 型・`chatRoomInvitationReceived` 通知種別・`chatAvailability` ロールポリシーは互換のため温存（破壊的 migration なし）
