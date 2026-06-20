# endolphin Changelog

endolphin 固有の変更を記録する。本家 Misskey 由来の変更は upstream 所有の `CHANGELOG.md` を参照（fork では手編集しない）。

書式は本家 `CHANGELOG.md` に倣い、`### General` / `### Client` / `### Server` の下に
`- <Feat|Enhance|Fix|Remove>: <概要>` を 1 行で追記する（機能削除は `Remove:`）。

## Unreleased

### General
- Feat: endolphin fork の基盤を整備（fork メタデータ / upstream 追従フロー / changelog 分離 / fork policy）

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

### Server
- Remove: お気に入り (favorites) 機能の write API を無効化し read API は空を返すよう変更（`notes/favorites/create`・`notes/favorites/delete`・`i/export-favorites` は `FEATURE_REMOVED` を返却、`i/favorites` は空配列を返却。endpoint 登録と型は互換のため維持）。関連の `NoteFavoriteEntityService` / お気に入りエクスポート処理を削除
- Remove: ギャラリー (gallery) 機能の write API を無効化し read API は空を返すよう変更（endpoint 登録と型は互換のため維持、web ルートと GalleryPost/GalleryLike の packing service を削除）
- Remove: Games（リバーシ / バブルゲーム）の write API を無効化し read API は空を返すよう変更（endpoint 登録と型は互換のため維持、ReversiService・リバーシ streaming channel・web ルート・packing service を削除）
- Remove: ページ (Pages) 機能の write API を無効化し read API は空を返すよう変更（endpoint 登録と型は互換のため維持、PageService・PageLike の packing service・web ルートを削除。pinnedPage 表示は維持）
- Remove: 実績 (achievements) の獲得 API（i/claim-achievement）を無効化し read API は空を返すよう変更（endpoint 登録と型は互換のため維持、AchievementService を削除。achievementEarned 通知型とカラムは inert 保持）
- Remove: 埋め込み配信を撤去（`packages/frontend-embed` パッケージ・backend の `/embed/*`・`/embed.js`・`/embed_vite` ルート・埋め込み asset 配信機構を削除し、workspace / Dockerfile / CI / clean スクリプトの参照も除去）
- Remove: チャート (charts) 機能を削除（12 チャートサービスクラス・`ChartManagementService`・`ChartLoggerService`・tick/clean/resync の定期ジョブとプロセッサ・各サービスに散在する集計フック（`*Chart.update()` 等）を撤去）。read API（`charts/*`）は登録・型を維持したまま空チャートを返すスタブに変更。`getJsonSchema` とチャート entity 定義は型・DB 互換のため温存（破壊的 migration なし）
- Enhance: チャート削除に伴い `stats` と nodeinfo のノート数・ユーザー数を、チャート集計から DB の直接カウント（クエリキャッシュ付き）に変更（fediverse 統計サイト等が参照する公開面の数値精度を維持）。大規模インスタンスでの COUNT コストは issue #3 で追跡
