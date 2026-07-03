# Endolphin パフォーマンス改善ブレスト

- 作成日: 2026-07-02 / 最終更新: 2026-07-03
- ステータス: **起票済み** — Track A〜G の親 issue (#53〜#59) + sub-issue 45 件として管理中。本文書は調査知見のアーカイブとして追記を続ける（新しいアイデアは issue 起票と同期させる）
- 対象: バックエンド速度 / バックエンドメモリ / DB・Redis 負荷 / フロントのバッテリー持ち / フロントのデータ更新耐性 + 追加観点

## 0. 前提と方針

### fork 原則との整合

すべての案は [fork-policy.md](fork-policy.md) の 3 原則でフィルタする:

- **P2 (追従コスト)**: TL・ノート・投稿・ドライブ・連合は高 churn コア。ここを大きく書き換える案は「本家に PR して upstream 化する」「設定・インフラ層で解決する」を優先し、fork 独自改変は最終手段
- **P3 (互換維持)**: 連合プロトコル・REST API の観測可能な挙動を変える案は原則却下（内部最適化のみ可）

各アイデアに `[効果 / コスト / 乖離]` タグを付ける。乖離 = 本家からの diverge リスク（低=upstream 化可能 or 設定のみ、中=fork 局所差分、高=コア書き換え）。

### 実施済み施策（重複提案しない）

- 機能削除による負荷減: チャート 12 サービス + tick/clean/resync processor、リテンション集計、広告、チャット等の撤去。stats/nodeinfo は DB 直接カウント + クエリキャッシュ化
- フロント配信: JS チャンクの Brotli 事前圧縮（181MB→53MB）+ `@fastify/static` の `preCompressed`、locale 非依存チャンクの重複排除
- Docker 軽量化（Debian 1.22GB→922MB / distroless 728MB）
- 計測 CI: backend メモリ比較（heap snapshot + JS footprint）、frontend bundle レポート

### 計測ファースト

思いつきで最適化せず、まず「どこが遅い/重いか」を計測で特定する。既にメモリ・bundle の CI があるので、欠けているのは **レイテンシ（API p50/p99）・DB クエリ統計・実機の電力プロファイル**。§6.3 参照。

---

## 1. バックエンド: 動作速度

### 1.1 HTTP リクエスト/レスポンス

現状: Fastify は `logger: false`（`ServerService.ts:77`）。API レスポンス圧縮は未設定。pack の N+1 は `DebounceLoader` と `In()` バッチで対策済み（`NoteEntityService.ts:71,533,606`）。スロークエリログは 300ms 閾値（`postgres.ts:317`）。

- **ホットエンドポイントのプロファイル取得**: `notes/timeline` 系・`notes/create`・`i/notification` を clinic.js / 0x でフレームグラフ化し、CPU をどこで使っているか（pack? ajv? TypeORM hydration?）を確定させる。以降の案の優先度はこれで決める [効果:判断材料 / コスト:小 / 乖離:低]
- **レスポンス JSON の schema ベース直列化**: endpoint 定義には `res` schema が既にあるので、fast-json-stringify でコンパイルした serializer を通す。`JSON.stringify` 比 2〜5 倍速の実績があり、TL のような大きい配列レスポンスに効く [効果:中 / コスト:中 / 乖離:中（本家 PR 候補）]
- **API レスポンスの圧縮方針を明文化**: Node 側で `@fastify/compress` を入れるか、リバースプロキシ（nginx/Caddy）で gzip/brotli させるかを決めてドキュメント化。CPU トレードオフがあるので基本はプロキシ側推奨 [効果:中（帯域） / コスト:小 / 乖離:低]
- **リクエストパスから副作用を追い出す**: `ApiCallService` の IP 履歴記録などレスポンスに不要な書き込みを fire-and-forget / キュー化されているか確認し、await しているものがあれば外す [効果:小〜中 / コスト:小 / 乖離:低]
- **レートリミッタの Redis 往復削減**: API 1 呼び出しごとの limiter 往復回数を確認し、明らかに安全な読み取り系はワーカー内 L1（トークンバケット）で先に弾く 2 段構成を検討 [効果:小〜中 / コスト:中 / 乖離:中]
- **認証解決のキャッシュヒット率確認**: token→user 解決が毎回 DB に行っていないか。`CacheService` の userById（メモリ 5 分）に乗る前段の token 解決経路を計測 [効果:小 / コスト:小 / 乖離:低]
- **キャッシュ可能な公開エンドポイントに HTTP キャッシュヘッダ**: `/api/meta`・カスタム絵文字一覧・well-known 系に ETag / Cache-Control（short max-age + SWR）。絵文字 JSON はサイズが大きく再訪問で効く [効果:中 / コスト:小〜中 / 乖離:中（API 挙動には非破壊）]
- **statement_timeout の見直し**: 現在 10s（`postgres.ts:262-321`）。ワーストケースでリクエストが 10 秒吊るのを許すより、API 系は短い timeout + 失敗を早く返す方が体感が良い（バッチ系と分離できるかが論点） [効果:小 / コスト:小 / 乖離:低]

### 1.2 連合: 配送（outbound）

現状: deliver は concurrency 128・128/sec limiter・attempts 12・指数 backoff（`QueueProcessorService.ts:269-273,47-54`）。shared inbox の重複排除はあるが、`ApDeliverManagerService.ts:116` に「SELECT DISTINCT ON で先行フェッチ」の未実装 TODO が残っている。鍵ペアは Redis 24h / メモリ 1h でキャッシュ済み。

- **`ApDeliverManagerService.ts:116` の TODO を実装**: フォロワー全行を舐めてから JS で inbox を dedup する代わりに、`SELECT DISTINCT ON (sharedInbox)` で DB 側に寄せる。フォロワー数が多いアカウントの投稿で配送準備が軽くなる。本家コードの TODO なので upstream PR 向き [効果:中 / コスト:小〜中 / 乖離:低]
- **配送ペイロードの重複排除**: 同一 Activity を N 個の deliver ジョブそれぞれの job data にコピーしていると、Redis メモリと直列化コストが宛先数に比例する。ペイロードを 1 回だけ Redis に置き、ジョブは参照キーのみ持つ content-addressed 方式を検討（BullMQ の実装確認から） [効果:中（大規模時） / コスト:中 / 乖離:中]
- **死んでいるインスタンスへの早期スキップ強化**: 既存の suspend / notResponding 判定をサーキットブレーカ化（連続失敗 n 回 → 時間窓クローズ → half-open で試験配送）。失敗しつづける宛先に 12 attempts × 指数 backoff を毎回払うのを避ける [効果:中 / コスト:中 / 乖離:中]
- **送信 HTTP のコネクション再利用確認**: `HttpRequestService` の keep-alive agent / ソケットプール設定と DNS キャッシュを確認し、配送先ごとの TLS ハンドシェイク再発を減らす [効果:小〜中 / コスト:小 / 乖離:低]
- **署名アルゴリズム**: 本家の Ed25519 鍵対応（RSA より署名が桁違いに速い）の動向を追い、入ってきたら早めに追従する。詳細調査と見送り判断は §1.8 [効果:中 / コスト:追従のみ / 乖離:低]
- **deliver concurrency / limiter のチューニングガイド**: 128/128 は中規模向け。小規模インスタンス（endolphin の主対象）ではワーカー数・Redis 負荷とのバランスで下げた方が良い場合もある。config での推奨値を docs 化 [効果:小 / コスト:小 / 乖離:低]

### 1.3 連合: 受領（inbound）

現状: inbox は concurrency 16・32/sec limiter・attempts 8（`QueueProcessorService.ts:309-313`）。HTTP 署名検証 → 失敗時 LD-Signature フォールバック（`InboxProcessorService.ts:130-150`）。actor resolve はキャッシュあり。

- **重複 Activity の早期棄却**: 同一 activity id の再配送（リトライ・複数リレー経由）を、フル処理の前に Redis `SETNX` + TTL で弾く層があるか確認し、無ければ追加。inbox 処理の最も安いショートカット [効果:中 / コスト:小〜中 / 乖離:中（本家 PR 候補）]
- **リモート actor / 公開鍵キャッシュのヒット率計測**: 署名検証のたびに Person resolve →リモートフェッチが起きていないか。キャッシュミス時のフェッチがキュー詰まりの原因になりやすい [効果:中 / コスト:小 / 乖離:低]
- **inbox concurrency の動的調整**: バーストで大量受信した際、16 のままだと処理待ちが伸びる。CPU 空きに応じて config で上げられることを負荷試験で確認し、推奨値を docs 化 [効果:小〜中 / コスト:小 / 乖離:低]
- **LD-Signature フォールバックの頻度計測**: LD 署名検証は高価。どの実装由来のリクエストでフォールバックが起きているか集計し、多ければ原因側の対処（HTTP 署名の互換性改善）を検討 [効果:小 / コスト:小 / 乖離:低]

### 1.4 EntityService の pack 詳細度・内部効率（2026-07-03 追記）

現状（調査で確認）:

- `UserDetailed` 分岐で追加される profile / memo / relation 判定は `packMany` でバッチ化済み（`getRelations` は対象人数に関わらず固定 8 クエリ。ただし me のフォロー・ブロック等の全件ロード方式のため、フォロー数が多い me では行数側で重い）。最重量は **pinnedNotes**（必ず `detail: true` で note pack 連鎖、`UserEntityService.ts:550-552`）
- 非バッチの穴: `populatePoll` は `packMany` の `_hint_` 対象外で poll 付きノート N 件 = N クエリ（`NoteEntityService.ts:194-230`）。`iAmModerator` は閲覧者固定なのに `packMany` ループ内で毎回再計算（`UserEntityService.ts:424`）。badgeRoles / roles / policies / isSilenced はユーザーごと個別呼び出し（5 分キャッシュ頼み）
- アンテナチャンネルは配信イベントを**接続ごとに** `detail: true` で再 pack（`stream/channels/antenna.ts:65`）。ノート作成配信の「1 回 pack して全員に配る」方式と非対称
- `detail`（デフォルト true）パラメータの既存イディオム: `users/search` / `users/search-by-username-and-host` / `meta`。専用軽量エンドポイントの前例: `notes/show-partial-bulk`（id/reactions のみの射影）
- detail 切替を持たず常に Detailed を返す高トラフィック endpoint: `users/show`（userIds 一括含む）、`users/followers` / `following`（`UserDetailedNotMe` 固定）、`users/recommendation`
- フロントの過剰取得実例: `MkAvatars.vue`（`users/show` をアバター表示のみに使用、型は `UserLite[]` と記述済み）、`WidgetUserList.vue`、`MkPostForm.vue` の visibleUsers（acct 表示のみ）

アイデア（起票済み）:

- **pack 内部の純最適化**（populatePoll バッチ化・iAmModerator hoist・アンテナ再 pack 共有・role 系一括化）: API レスポンス不変で互換リスクゼロ、本家還流の最有力候補 [効果:中 / コスト:小〜中 / 乖離:低] → **C-8 (#103)**
- **`detail` パラメータの横展開 + フロント opt-in**: additive でデフォルト不変（P3 維持）、既存イディオムの横展開 [効果:中 / コスト:中 / 乖離:中] → **C-9 (#104)**
- 原則: デフォルトレスポンスを Lite に落とすのは REST API 互換（P3）違反なのでやらない。`withoutXXX` 型の細粒度 opt-out は型・テスト面が複雑化するため、計測で単独支配的と分かった項目（現状候補は pinnedNotes のみ）に限定する

### 1.5 投稿後処理（NoteCreateService.postNoteCreated）の HTTP プロセス負荷（2026-07-03 追記）

現状（調査で確認）:

- `create()` は `insertNote` まで await し、`postNoteCreated` は `setImmediate` の fire-and-forget（`NoteCreateService.ts:605-613`）。**HTTP レスポンスは投稿後処理を待たない**（レイテンシには直接効いていない）
- ただし本番のプロセス構成は **primary プロセス = HTTP 専任、cluster worker = ジョブキュー専任**（`boot/master.ts:97-108` / `boot/worker.ts:38-42`）のため、`postNoteCreated` は **HTTP プロセスの CPU/コネクションを消費し続ける**
- HTTP プロセス内で走る規模比例の処理: `pushToTl`（ローカルフォロワー全件 DB 取得 → 1 件ごとに Redis pipeline へ lpush/ltrim を積み最後に exec・未 await、`NoteCreateService.ts:1030-1163`）、**アンテナ照合（インスタンス全体のアクティブアンテナを投稿ごとに全件チェック**、`AntennaService.ts:98-111,212-219`）、フォロワー通知作成ループ（`:757-778`）、AP 配送準備（リモートフォロワー全件 find。実配送は deliverQueue へ addBulk）
- 検索インデックス（Meilisearch への HTTP 呼び出し）もキューを経ず HTTP プロセスから直接発火（`:909` / `SearchService.ts:135-155`）
- fire-and-forget の大半が**未 catch**（`trackPromise` は本番では no-op、`misc/promise-tracker.ts:12-19`）で unhandled rejection リスクあり
- リモートノート受信は inbox キュー経由で別プロセス実行のため本件の対象外（`disableClustering: true` の単一プロセス構成を除く）。`NoteDeleteService.delete` は逆にレスポンス前に全体 await される構造（`notes/delete.ts:73`）

アイデア:

- **fire-and-forget の catch 整備**: 未 catch promise 全てにエラーログ付き catch を付ける。挙動不変 [効果:小（安全性・可観測性） / コスト:小 / 乖離:低（本家 PR 候補）]
- **重量級投稿後処理のジョブ化検討**: `pushToTl`・アンテナ照合・フォロワー通知を BullMQ ジョブへ移し、HTTP プロセスから queue worker へ切り離す。高 churn コアの改変のため、まず C-3（#74）のプロファイルで「投稿バースト時に API レイテンシがどれだけ劣化するか」を定量化してから判断 [効果:中〜大（規模時） / コスト:大 / 乖離:高]
- **アンテナ照合のスケール改善**: 全アクティブアンテナ × 全投稿の照合はアンテナ数でスケールが壊れる。src 条件（user/list 指定）による事前絞り込み、アンテナ数のロールポリシー運用ガイド [効果:中（アンテナ多用時） / コスト:中 / 乖離:中]
- **検索インデックスのキュー化**: Meilisearch 使用時の外部 HTTP 呼び出しをジョブへ [効果:小〜中 / コスト:小〜中 / 乖離:中]

### 1.6 その他 EntityService の pack 効率・横断調査（2026-07-03 追記）

現状（調査で確認）: 大半のサービスは `userEntityService.packMany` + Map hint の統一パターンでバッチ化済みで健全（DriveFile / DriveFolder / Following / FollowRequest / Blocking / Muting / RenoteMuting / Flash / 管理系各種）。N+1 が確認できたのは以下:

1. **NotificationEntityService** — note / user はバッチ化済みだが、`roleAssigned` 型通知だけ通知ごとに `RoleEntityService.pack`（内部で roleAssignments への COUNT クエリ）を個別発行（`NotificationEntityService.ts:153` / `RoleEntityService.ts:38-45`）。`i/notifications*` は最高頻度 endpoint
2. **ChannelEntityService** — `packMany` 自体は banner/フォロー/お気に入り/ミュート/ピン留めを IN 一括取得する良実装なのに、`channels/featured`・`followed`・`my-favorites`・`owned`・`search` の 5 endpoint が `Promise.all(map(pack))` で**バイパス**しており、チャンネル数分の個別クエリが発行される（`packMany` を使うのは `channels/mute/list` のみ）
3. **ClipEntityService** — `favoritedCount` / `isFavorited` / `notesCount` が clip ごとに個別クエリ（`ClipEntityService.ts:54-56`。`clips/list` 等の中頻度 endpoint）
4. **AnnouncementEntityService** — 既読判定の countBy が announcement ごとに個別 + `packMany` は `map(pack)` の素通し（`:38-43,63-70`。認証不要 `announcements` で中〜高頻度）
5. **UserListEntityService** — `pack` が list ごとに membership を findBy（`:36-38`。`users/lists/list` が `map(pack)`）
6. **NoteReactionEntityService** — `packManyWithNote` が note の pack を hint なしで個別呼び出し（`:100-119`。`users/reactions`）
7. **RoleEntityService** — `pack` ごとに COUNT クエリ、`packMany` も `map(pack)`（`roles/list` / `admin/show-user` 等）

低頻度のため優先度低: App / FlashLike / NoteDraft / Emoji 管理バルク操作。Page は fork で機能削除済みのため実質影響なし。

アイデア:

- **packMany バイパスの是正**: channels 系 5 endpoint を既存の `packMany` 呼び出しに切り替えるだけ。実装済みバッチの取り込み忘れの是正であり最安 [効果:小〜中 / コスト:小 / 乖離:低（本家 PR 候補）]
- **hint 機構の追加**: Notification の role、Clip / Announcement / UserList / NoteReaction / Role の集計・参照系を IN / GROUP BY で一括化。いずれも API レスポンス不変の純最適化で C-8（#103）と同型 [効果:小〜中（endpoint による） / コスト:小〜中 / 乖離:低]

### 1.7 キャッシュ機構の活用漏れ — DB 直参照の置換候補（2026-07-03 追記）

現状（調査で確認）: `CacheService` には userById / localUserByNativeToken / userProfile / userMutings / userBlocking / userBlocked / renoteMutings / userFollowings の二層キャッシュがあり、`FanoutTimelineEndpointService` の TL フィルタは模範的に活用している（`FanoutTimelineEndpointService.ts:120-124`）。一方、同じデータを DB 直参照している箇所が複数見つかった:

1. **ChannelEntityService.pack** — isFollowing / isMuting をチャンネルごとに exists 直読み（`:72,86`）。`userFollowingChannelsCache` / `mutingChannelsCache` がキー方向完全一致で存在し、`pack` の `opts.followings` / `opts.muting` はまさにそのための引数なのに、呼出元 8 箇所すべてが未指定。無効化はイベント購読で担保済みで stale リスクなし。C-11（#106）の channels 系是正と同時対応が自然
2. **NoteEntityService.isVisibleForMe** — following を count 直読み + users 直読み（`:302-311`）。**同一ファイルの `shouldHideNote` は同じ判定を `userFollowingsCache` で実装済み**という不整合。呼出元はリアクション作成・リプライ投稿・リモート Renote 受信で高頻度
3. **NoteCreateService** — renote/reply 先ユーザーによるブロック判定を blockings の exists 直読み（`:332,385`）。`userBlockedCache`（blockee→blocker の Set）がキー方向完全一致で、`UserBlockingService.checkBlocked` に置換前例あり
4. **GetterService.getUser** — usersRepository 直読み（`GetterService.ts:68-69`）。`CacheService.findUserById`（userByIdCache 経由・suspend/update 系イベントで無効化）の確立パターンが未適用のまま、32 endpoint がここを経由。※メモリ 5 分 TTL のため、呼出元ごとの鮮度要件の監査は必要
5. **UserEntityService.getRelation/getRelations** — isFollowing / isBlocking / isBlocked / isMuted / isRenoteMuted の 5 判定はキャッシュのキー方向一致で置換可能。ただし `following.notify`・isFollowed・フォロリク往復は対応キャッシュが存在せず全置換は不可（部分置換、または followed 系キャッシュの追加検討）
6. **ReactionService** — リモートカスタム絵文字リアクションで emojisRepository を**同一リクエスト内に 2 回**直読み（`:135,235`）。`CustomEmojiService.emojisCache` は private かつ返却情報不足で転用不可、しかも絵文字編集イベントを購読しておらず stale リスクを内包（キャッシュ設計自体の見直しが必要）

キャッシュ自体が無い高頻度読み（参考）:

- channel 情報を `NoteEntityService.ts:386`・NoteCreateService 内 4 箇所で都度 findOneBy → `localEmojisCache` 型の channelsCache 追加候補
- user-list ストリーミングチャンネルが**接続ごとに 5 秒間隔**で membership を DB ポーリング（`stream/channels/user-list.ts:75-90`）。`UserListService.membersCache` がイベント購読で同種データを保持済みだが withReplies 欠落で転用できていない

アイデア（起票済み → **C-12 (#107)**）: 1〜4（+ 5 の部分置換）は挙動不変・無効化整備済みキャッシュへの置換のみで、C-8 / C-11 と同系の本家還流候補 [効果:中 / コスト:小〜中 / 乖離:低]。6・user-list ポーリングのイベント化は設計を伴うため C-12 の段階 3 として扱う [効果:中 / コスト:中 / 乖離:中]。channelsCache の新規追加のみ未起票（必要になったら個別判断）

### 1.8 Ed25519 署名対応の設計調査と見送り判断（2026-07-03 追記）

§1.2 の「署名アルゴリズム」項の深掘り。組み込み方の設計検討まで行った上で**見送り（本家マージ待ち）と判断**した。

現状（調査で確認）:

- **fork の署名パスは本家と完全一致**（改変はチャート集計フック撤去のみ）。追従前提の構えとして理想的な状態
- 現行構造: 送信署名は `ApRequestService`（`rsa-sha256` ハードコード、実署名は Rust 製 `slacc` で高速化済み）、受信検証は `@peertube/http-signature` + LD-Signature フォールバック（`JsonLdService`、`RsaSignature2017` 固定）。鍵は `MiUserKeypair`（RSA PEM 2 カラム）、リモート鍵の `user_publickey` は **PK が userId のため 1 ユーザー 1 鍵**（Ed25519 対応には複数鍵化の migration が必須）
- 本家 PR **[#16250](https://github.com/misskey-dev/misskey/pull/16250)**（tamaina 氏）: 自作ライブラリ `@misskey-dev/node-http-message-signatures` への置換 / nodeinfo での対応宣言 / actor への `additionalPublicKeys` / 受信の複数鍵検証、の一式（RFC 9421 は対象外）。**放置ではなく 2026-05 にも develop 追従が続き p1.a9z.dev で本番稼働中**。Blocked は依存 PR（#16279 / #16297 / #16268）未マージのため
- エコシステム: Ed25519 署名を受けられるのは tamaina 方式を実装した Misskey 系 / Sharkey のみ。Mastodon は RFC 9421 対応済みだが RSA のみ、FEP-521a の普及も限定的（2026-07 時点）。**ワイヤプロトコルは tamaina 方式一択**で、独自方式は相互運用ゼロ = 性能メリットゼロになる

設計知見（再検討時に有効）:

- 「DI コンテナでのストラテジ切替（サービス差し替え）」は**不成立**。署名アルゴリズムの選択はデプロイ単位ではなく**送信先ホスト単位のランタイム判断**（nodeinfo の宣言を見て相手ごとに出し分け）のため、ストラテジは `ApRequestService` の内側に置くことになる
- 実体は「①ユーザーごとの第 2 鍵ペア発行・保存（migration）②actor ドキュメントへの複数鍵公開 ③受信側の複数鍵取り込み + 両アルゴリズム検証 ④ホスト別出し分け」の**デュアルスタック + ネゴシエーション**であり、片側だけの部分導入では機能しない
- 取り込む場合の推奨は「#16250 のコア部分の選抜移植」（キュー並列度変更・admin UI 等の無関係な変更は除外）。本家マージ時に同形へ収束するため P2 に最も優しい

見送り判断（2026-07-03）:

- 小規模インスタンスでは deliver 署名の CPU 削減の絶対量が小さい（RSA は slacc で既に高速、Ed25519 が効くのは大規模ファンアウト）
- 高 churn の連合コアを自前改変するのは P2 が警告するパターンそのもの
- 本家マージされればマージ追従でほぼタダで手に入る
- **再検討トリガ**: (a) #16250 の Blocked 解除・本家マージ → 早期追従（§1.2 の方針どおり）(b) C-3（#74）のプロファイルで deliver 署名がホットと判明した場合

### 1.9 ネイティブ化の候補棚卸し（2026-07-03 追記）

現状（調査で確認）— **既にネイティブなもの**（追加提案は不要な領域）:

- `sharp`（libvips）/ `@napi-rs/canvas`（identicon 生成含む）/ `re2` / **`slacc`（Misskey 内製 NAPI-RS アドオン: AhoCorasick・RSA 署名・ZipReader）** / `ws` の native addon（`bufferutil`・`utf-8-validate` 導入済み）/ jemalloc（`Dockerfile:132-133,163` で LD_PRELOAD 済み → E-6 #90 の前提を訂正、コメント反映済み）
- ワードミュートは単一キーワード = slacc AhoCorasick、正規表現 = re2（`misc/check-word-mute.ts`）で、**ユーザー入力正規表現が JS RegExp で実行される箇所は無し**（ReDoS リスクなし）
- 対象外と判断: bcryptjs（純 JS だがログイン時のみで低頻度）/ JSON.parse・stringify（V8 native）/ JSON-LD 正規化（`jsonld` は純 JS だが LD-Signature フォールバック経路のみで低頻度）

純 JS のまま高頻度な CPU 仕事（頻度 × 重さ順）:

1. **mfm-js パース** — ノート作成で 2〜4 回、リモート受信で HTML 解析（node-html-parser）+ パース、AP 配信で再パース、フィード生成はリクエスト毎に全ノート再パース（`NoteCreateService.ts:562-565` / `ApMfmService.ts:32` / `FeedService.ts:89`）
2. **アンテナ照合のキーワード走査** — 投稿ごとに全アクティブアンテナ × `String.includes` の純 JS ループ（`AntennaService.ts:96-111,157-199`）
3. **blurhash.encode** — アップロード毎に DCT 計算が JS ループ。デコードは sharp（native）済みなのに後段だけ JS（`FileInfoService.ts:499`）
4. summaly（cheerio）の HTML 解析 — URL プレビュー毎（ネイティブ化よりプレビュー結果キャッシュの確認が先）

アイデア（起票・反映済み）:

- **アンテナ照合への slacc AhoCorasick 横展開**: check-word-mute で実績のある内製 native の適用で新規依存ゼロ。全アンテナのキーワードを 1 オートマトンに束ねて 1 回の走査にする構成まで検討。C-10 の事前絞り込みと補完関係 [効果:中 / コスト:中 / 乖離:低〜中] → **C-13 (#108)**
- **blurhash エンコードのネイティブ/WASM 化**: optionalDependencies + 純 JS フォールバック構成・出力互換前提 [効果:小〜中 / コスト:小〜中 / 乖離:低] → **C-14 (#109)**
- **mfm-js のネイティブ化は見送り**: 最大の純 JS CPU だが、パース結果の完全互換が必須（1 ノードのズレで mentions・連合 HTML が変わる = P3 リスク）のため本家が動かない限り fork 単独では非推奨。先に安い代替として **FeedService のリクエスト毎再パースのキャッシュ化**を検討する
- **ランタイム設定の残り**: `NODE_OPTIONS`（V8 フラグ）・`UV_THREADPOOL_SIZE` が未設定 → E-6（#90）の残スコープとしてコメント反映済み
- 小ネタ: `UtilityService` の RE2 を毎回 `new` している本家 TODO（`UtilityService.ts:99-100`）→ C-6（#77）の監査項目にコメントで追加済み
- **backend-rs 型の全面ネイティブ化は方針として不採用**（P2: アーキテクチャを本家から離すほど追従が「翻訳」になる）

---

## 2. バックエンド: メモリ使用量

現状: cluster worker は `min(clusterLimit, cpus)`（`master.ts:187-189`）で、各 worker が NestJS DI グラフ・locale・endpoint 定義を丸ごと持つ。`MemoryKVCache` は 3 分間隔の TTL GC のみで（`cache.ts:211`）、エントリ数上限は調査では確認できなかった。メモリ計測 CI（heap snapshot / JS footprint）は整備済み。

- **メモリキャッシュにエントリ数上限（LRU）を導入**: TTL だけだと「TTL 内に大量の異なるキーが流入する」ケース（クロール・連合バースト）で無制限に育つ。`MemoryKVCache` に max entries を足す or lru-cache 置換。メモリ比較 CI で before/after を定量化できるのが endolphin の強み [効果:中 / コスト:中 / 乖離:中（本家 PR 候補）]
- **worker 数とメモリのトレードオフ表を作る**: worker 1 個あたりの定常 RSS を計測 CI の数字から出し、「RAM x GB なら clusterLimit=n」の推奨表を docs 化。小規模向け fork として一番実用的なアウトプット [効果:中（運用） / コスト:小 / 乖離:低]
- **heap snapshot からの retainer 削減サイクル**: 計測 CI は既にあるので、「上位 retainer を 1 つ潰す」を定常タスク化する。候補: 常駐 locale データ、endpoint schema（ajv コンパイル結果）、絵文字キャッシュ [効果:中 / コスト:継続 / 乖離:低〜中]
- **重い依存の遅延ロード確認**: nsfwjs/TensorFlow（感度検出）、sharp まわりが「機能を無効化していれば require もされない」状態か確認。static import になっていれば dynamic import 化 [効果:中（該当時） / コスト:小 / 乖離:低]
- **sharp の並列度・キャッシュ制限**: 画像処理のピーク RSS を抑えるため `sharp.cache()` / `sharp.concurrency()` を config 化。アップロードバーストで OOM しにくくする [効果:小〜中 / コスト:小 / 乖離:低]
- **V8 / アロケータのチューニング**: Docker イメージで `--max-old-space-size` を実メモリ連動にする、jemalloc（LD_PRELOAD）でネイティブ断片化を抑える。fork は Docker イメージを自前最適化済みなので載せやすい [効果:小〜中 / コスト:小 / 乖離:低]
- **多 worker 構成でのメモリキャッシュ二重持ち削減**: 同じ内容のメモリキャッシュを worker 数ぶん持つ。worker 数が多い構成では一部キャッシュを Redis 単層に落とすオプション（レイテンシとのトレードオフ） [効果:中（多 worker 時） / コスト:中 / 乖離:中]
- **アイドル WebSocket 接続の回収**: 5 分無通信で ping は打っている（`StreamingApiServerService.ts:149-157`）が、応答しない接続を確実に切っているか確認。放置タブの接続はメモリ・pub/sub フィルタコスト両方に効く [効果:小〜中 / コスト:小 / 乖離:低]

---

## 3. バックエンド: DB・Redis 負荷

### 3.1 DB (PostgreSQL)

現状: TypeORM クエリキャッシュ（ioredis backend, `postgres.ts:298-308`）、リードレプリカ対応は config 済み（`postgres.ts:278-295`）、FanoutTimeline による TL の Redis 化あり。

- **pg_stat_statements + auto_explain を標準装備に**: 「どのクエリが総時間を食っているか」を常時見える化。300ms スロークエリログは単発しか見えないので、積算ビューが要る。docs にセットアップ手順を書くだけでも価値がある [効果:判断材料 / コスト:小 / 乖離:低]
- **インデックス監査**: pg_stat_statements の上位クエリに対し複合インデックスの過不足を点検。使われていないインデックスの削除も書き込み負荷減になる（note テーブルはインデックスが多く、INSERT のコストに直結） [効果:中 / コスト:中 / 乖離:低〜中（migration 追加は additive）]
- **PgBouncer 前提の接続数設計**: worker 数 × プールサイズが Postgres の max_connections を圧迫しがち。transaction pooling を挟む構成を推奨構成として docs 化 [効果:中（運用） / コスト:小 / 乖離:低]
- **リモートデータの保持ポリシー（プルーニング）**: 小規模インスタンスの DB 肥大の主因は「誰も見ないリモートノート・リモートユーザーの蓄積」。参照されていない古いリモートノートを段階的に削除するオプトインのバッチジョブを検討。連合互換（P3）には非破壊（自サーバのデータ保持の話）だが、設計は慎重に: 返信ツリー・ピン留め・リノート元の参照整合性 [効果:大（長期運用） / コスト:大 / 乖離:中〜高]
- **note テーブルのパーティショニング検討**: id（時系列）でのレンジパーティション。効果は大きいが TypeORM・migration との相性問題があるので、プルーニングで足りるなら不要。「プルーニング → それでも足りなければパーティション」の順 [効果:大（大規模時） / コスト:大 / 乖離:高]
- **カウント系クエリのキャッシュ徹底**: チャート削除で nodeinfo は直接カウント + キャッシュ化済み。他に定期実行される COUNT（管理画面・federation ページ等）が残っていないか棚卸し [効果:小〜中 / コスト:小 / 乖離:低]
- **autovacuum チューニングガイド**: note/notification のような追記型大テーブル向けの autovacuum 設定例を docs 化 [効果:中（運用） / コスト:小 / 乖離:低]

### 3.2 Redis

現状: FanoutTimeline が per-user の Redis List（`FanoutTimelineService.ts:43-120`、trim は push の 10% 確率で実行）。BullMQ のジョブログ保持 7 日（`QueueService.ts:117-118`）。TypeORM クエリキャッシュも Redis。

- **Redis メモリの内訳を可視化**: FTT リスト / BullMQ / クエリキャッシュ / レートリミッタでどれだけ使っているか `redis-cli --bigkeys` + `MEMORY USAGE` サンプリングで定点観測。maxmemory-policy の推奨（FTT は消えても DB フォールバックできるので noeviction 以外も選べるか整理） [効果:判断材料 / コスト:小 / 乖離:低]
- **FTT リスト長の設定指針**: TL 種別ごとの maxlen とユーザー数から Redis メモリ予算を見積もる式を docs 化。非アクティブユーザーの homeTimeline リストの TTL/削除も検討（ログイン時に DB から再構築できる） [効果:中 / コスト:中 / 乖離:中]
- **BullMQ の完了ジョブ保持の最適化**: removeOnComplete / removeOnFail の保持数・期間を見直し（deliver は成功ジョブを長く持つ意味が薄い）。ジョブログ 7 日も短縮候補 [効果:小〜中 / コスト:小 / 乖離:低]
- **用途別 Redis 分離の推奨構成**: config は queue / cache 等の分離に対応しているはず。pub/sub + FTT（レイテンシ重視）と BullMQ（永続性重視）を分ける構成例を docs 化 [効果:中（運用） / コスト:小 / 乖離:低]
- **pub/sub のファンアウトコスト検証**: イベントがホスト単位の太いチャンネルに全部流れ、全 worker が全イベントを受信してフィルタする構成になっていないか確認（要実装確認）。そうなっている場合、worker 数 × イベント数で CPU を食うので、チャンネル分割（per-user prefix 等)を本家動向と合わせて検討 [効果:中〜大（大規模時） / コスト:大 / 乖離:高]
- **レートリミッタのキー設計確認**: TTL 付きで keyspace が無限に育たないこと、アクセスごとの往復回数を確認（§1.1 と同件） [効果:小 / コスト:小 / 乖離:低]

---

## 4. フロントエンド: スマホでのバッテリー持ち

現状の問題点（調査で確認）:

- heartbeat 60 秒の `setTimeout` は非表示中も再スケジュールされ続ける（`stream.ts:41-48`。送信自体は可視時のみ）
- `useInterval` に visibility 連動の停止が無い（`frontend-shared/js/use-interval.ts`）。相対時刻の共有時計も 10 秒間隔で常駐（`use-lowres-time.ts:32-34`）
- reconnecting-websocket は `minReconnectionDelay: 1`・`maxRetries: Infinity` で、非表示タブでも再接続ループが無限継続（`streaming.ts:86-89`）
- `prefersReducedMotion` は起動時 1 回だけの判定で、OS 設定変更に追従しない（`frontend-shared/js/config.ts:23`）
- MFM `rainbow` は `animatedMfm` 有効時に常時 `infinite` アニメーション（`MkMfm.ts:221-230`）
- `WidgetUnixClock` の ms 表示は `setInterval(tick, 10)` = 100Hz（`WidgetUnixClock.vue:88`）
- 一方、`skipNoteRender`（content-visibility, default true）、`dataSaver`、非表示時の TL 更新一時停止（`isPausingUpdate`）、静止画アバター化は実装済み

アイデア:

- **可視性ガバナー（横断的な省電力の中枢）**: `document.visibilityState` + Page Lifecycle API (freeze/resume) を一元管理する composable を作り、(1) `useInterval` に `pauseWhenHidden` オプション追加（デフォルト on）、(2) 共有時計の停止、(3) heartbeat のタイマー自体を停止し可視化時に即 1 回実行、を束ねる。個別対処のもぐら叩きを防ぐ設計 [効果:大 / コスト:中 / 乖離:中（本家 PR 候補）]
- **非表示 N 分で WebSocket を切断し、復帰時に再接続 + ギャップ埋め**: モバイルのバッテリーに最も効く一手（無線モデムのアイドル復帰を止める）。通知は SW push（実装済み, `sw.ts:105-131`）でカバーできるので、切断しても通知は失われない。§5 のギャップ埋めとセットで初めて成立する [効果:大 / コスト:中〜大 / 乖離:中]
- **再接続ループの抑制**: 非表示中は reconnecting-websocket のリトライを止める（`navigator.onLine` / visibility を見て `close()`→可視化時 `reconnect()`）。圏外の電車内でリトライし続けるのを防ぐ [効果:中 / コスト:小〜中 / 乖離:中]
- **省電力モード・プリセット（1 トグル）**: `realtimeMode: off` + `pollingInterval: 低` + `animation/animatedMfm: off` + `dataSaver: on` + 静止画アバターを一括適用する「省電力モード」。Battery Status API や `prefers-reduced-data` での自動提案も検討（対応ブラウザ限定） [効果:中〜大 / コスト:小〜中 / 乖離:低（設定の組み合わせ）]
- **`prefers-reduced-motion` のライブ追従と CSS 化**: `matchMedia` リスナーで動的反映 + 主要アニメーションに `@media (prefers-reduced-motion: reduce)` を直接書く（JS を通さない分確実） [効果:小〜中 / コスト:小 / 乖離:低]
- **画面内の無限アニメーション制御**: MFM rainbow/spin 等は viewport 内でも `IntersectionObserver` + `animation-play-state: paused` で「見えている行だけ動かす」。加えて「同時に動くアニメ絵文字/MFM の上限」設定 [効果:中 / コスト:中 / 乖離:中]
- **アニメーション custom 絵文字の静止画オプション**: アバターの `disableShowingAnimatedImages` と同様に、リアクション・本文の custom 絵文字にも静止画化パスを徹底（未対応箇所の洗い出し） [効果:中 / コスト:小〜中 / 乖離:低]
- **タイマーの統合と整列**: ばらばらの `setInterval` を single scheduler（1s / 10s tick に整列）へ寄せて CPU wakeup を減らす。`useLowresTime` は既にその思想なので、他の常駐タイマーも同じバスに載せる。`WidgetUnixClock` の 10ms は rAF 化 or 最低 100ms に [効果:小〜中 / コスト:中 / 乖離:中]
- **widget の購読管理**: server-metric 等の WS チャンネル購読を widget が非表示（別カラム・折りたたみ）の間は解除する [効果:小 / コスト:小 / 乖離:低]
- **実機電力プロファイルの取得**: Chrome DevTools の Performance トレース（Android 実機）で「TL を 5 分放置」「バックグラウンド 10 分」の wakeup 数・CPU 時間を before/after 比較する簡易手順を docs 化。バッテリー系はこれが無いと効果検証できない [効果:判断材料 / コスト:小 / 乖離:低]
- **OLED 向け真っ黒テーマの用意**（既にあれば周知のみ）: OLED 端末では黒画素は消費電力ほぼゼロ。効果は限定的だが安い [効果:小 / コスト:小 / 乖離:低]

---

## 5. フロントエンド: データ更新耐性

現状の構造的問題（調査で確認、これが「リロードしないと直らない」の正体）:

1. **新着キュー内のノートに更新・削除が反映されない**: `Paginator.removeItem()` / `updateItem()` は `items` しか見ず、`aheadQueue` は対象外。コード上に明示的な TODO が残っている（`paginator.ts:397`「TODO: queueからも消す」、`paginator.ts:407`「TODO: queueのも更新」）。キュー中に削除されたノートはキュー解放時にそのまま出てくる
2. **WS 再接続時のギャップ埋めが無い**: 再接続でチャンネル再購読はされる（`streaming.ts:150-155`）が、切断中に流れたノートを取りに行く処理が TL 側に無い。通知 TL には `notificationFlushed` → `reload()` の経路がある（`MkStreamingNotificationsTimeline.vue:175`）のにノート TL には無い、という非対称
3. **capture は描画されたノートだけ**: `useNoteCapture` はコンポーネント mount 時に `sr` 購読するため、キュー内・画面外のノートはリアクション/削除イベントを拾わない。さらに作成から 5 分超のノートは自動購読されない（`use-note-capture.ts:307-330`）
4. **切断のデフォルト挙動が「静かに何もしない」**: `serverDisconnectedBehavior` default `'quiet'` はバナー表示のみで自動回復しない（`preferences/def.ts:206-208`）
5. **keep-alive 復帰・タブ復帰時の再取得が無い**: `MkStreamingNotesTimeline` は `onMounted` の `init()` 一回きり

アイデア（上から順に効果/コスト比が良い）:

- **paginator の TODO 2 件を実装**: `updateItem` / `removeItem` が `aheadQueue` も走査するようにする。数行の差分で「キューから削除済みノートが出てくる」を根絶できる。本家コードの TODO なので upstream PR の筆頭候補 [効果:中 / コスト:小 / 乖離:低]
- **`releaseQueue` 時の一括リコンサイル**: キューを `items` に流し込む直前に、キュー内ノート id を `notes/show-partial-bulk`（ポーリングモードで既に使っている既存 API, `use-note-capture.ts:65-92`）で一括再取得し、リアクション数・削除状態を最新化してから表示する。per-note の `sr` 購読をキューに広げるより 1 リクエストで済み、サーバ負荷も低い [効果:大 / コスト:小〜中 / 乖離:中（本家 PR 候補）]
- **再接続ギャップ埋め**: `stream.on('_connected_')` で「直前が切断だったら」`paginator.fetchNewer({toQueue: true})` を呼ぶ。切断時刻を記録し、長時間（例: 30 分超）ならキュー継ぎ足しではなく TL リロード + 「ここまで読んだ」線に切り替え。通知 TL の `reload()` 経路と対称にする [効果:大 / コスト:中 / 乖離:中（本家 PR 候補）]
- **タブ復帰・keep-alive 復帰時の鮮度チェック**: visibilitychange / `onActivated` で「最終取得から X 分経過していたら `fetchNewer(toQueue)`」。§4 の「非表示中 WS 切断」とセットで、復帰体験を成立させる部品 [効果:中〜大 / コスト:中 / 乖離:中]
- **可視ノートの低頻度リコンサイル**: リアルタイムモードでも、viewport 内のノートだけを対象に 60〜120 秒間隔で `show-partial-bulk` を叩いて取りこぼしを自己修復する（`IntersectionObserver` で対象を絞る）。イベント欠落があっても最終的に一貫する「self-healing」層 [効果:中 / コスト:中 / 乖離:中]
- **`sr` 購読の viewport 連動**: 現状「描画された全ノート」を購読しているが、逆に viewport 外は購読解除すれば、サーバ側の購読テーブルも小さくなり、可視ノートへのイベント配信の確実性を上げつつ負荷を下げられる [効果:中 / コスト:中 / 乖離:中〜高]
- **`serverDisconnectedBehavior` に「自動回復」を追加してデフォルトに**: `'quiet'` のバナーに加えて、再接続成功時に自動でギャップ埋めまで行うモード。ユーザー操作ゼロで最新化される [効果:中 / コスト:小（上記実装後） / 乖離:中]
- **イベント欠落の検知（プロトコル案・長期）**: チャンネルイベントに連番を振り、クライアントが欠番を検知したら該当範囲だけ再取得。確実だがストリーミングプロトコル拡張になるため、本家提案として温める [効果:大 / コスト:大 / 乖離:高]
- **正規化ノートストア（長期・要検討)**: note id → reactive オブジェクトの単一ストアに正規化すれば「どこに表示されていても 1 回の更新で全部反映」になり、queue 問題も原理的に消える。ただし MkNote 周辺は最高 churn 領域で P2 リスクが最大級。本家が同方向に動くか観測してから [効果:大 / コスト:大 / 乖離:高]

---

## 6. 追加の観点（ユーザー提示 5 観点の外側）

### 6.1 初期ロード・体感速度（フロント）

- ルート単位 code splitting の実態監査（bundle レポート CI があるので「初回表示に本当に必要な chunk」を定義して回帰チェック） [効果:中 / コスト:小〜中 / 乖離:低]
- カスタム絵文字一覧 JSON の ETag / 差分配信（クライアント側キャッシュ + updatedAt 以降だけ取得） [効果:中 / コスト:中 / 乖離:中]
- Service Worker によるアプリシェルの precache（PWA 化の徹底）。再訪時のネットワーク往復ゼロ化はバッテリーにも効く [効果:中 / コスト:中 / 乖離:中]
- フォント・twemoji のサブセット化/遅延ロード [効果:小〜中 / コスト:小 / 乖離:低]

### 6.2 メディア

- メディアプロキシの応答に長期 Cache-Control + immutable、サムネイルの AVIF/WebP 化 [効果:中 / コスト:中 / 乖離:低〜中]
- リモートファイルのキャッシュ方針（cache-remote-files）と定期クリーンアップの推奨設定を docs 化。オブジェクトストレージ利用時の直配信推奨 [効果:中（運用） / コスト:小 / 乖離:低]

### 6.3 可観測性（すべての土台）

- バックエンドに OpenTelemetry（HTTP サーバ + TypeORM + BullMQ の auto-instrumentation）を opt-in で追加し、p50/p99・キュー滞留・DB 時間を常時見える化 [効果:判断材料 / コスト:中 / 乖離:中]
- フロントに web-vitals の opt-in 送信（LCP/INP/CLS）。「体感が悪い」を数字にする [効果:判断材料 / コスト:小 / 乖離:低]
- k6 等での標準負荷シナリオ（TL 読み・投稿・連合受信 mock）を用意し、nightly で回して回帰検知。メモリ CI・bundle CI に続く 3 本目の柱として「レイテンシ CI」を作る [効果:大（回帰防止） / コスト:中〜大 / 乖離:低]

### 6.4 インフラ・構成（コード非改変で効く）

- 推奨リバースプロキシ設定（HTTP/2/3、静的キャッシュ、WebSocket タイムアウト、gzip/brotli）を docs 化 [効果:中 / コスト:小 / 乖離:低]
- リードレプリカ構成（config 対応済み `postgres.ts:278-295`）の動作確認と利用ガイド [効果:中（大規模時） / コスト:中 / 乖離:低]
- Redis / Postgres のサイジング早見表（ユーザー数・連合規模 → 推奨スペック） [効果:中（運用） / コスト:小 / 乖離:低]

---

## 7. 優先度の叩き台

### Quick wins（小さく安全、多くは upstream PR 候補）

1. paginator の TODO 2 件（キュー内 update/remove）— §5
2. releaseQueue 時の show-partial-bulk 一括リコンサイル — §5
3. 再接続ギャップ埋め（`_connected_` → fetchNewer）— §5
4. 可視性ガバナー第一歩: `useInterval` の visibility 停止 + 共有時計停止 + heartbeat タイマー停止 — §4
5. `ApDeliverManagerService.ts:116` の DISTINCT ON TODO — §1.2
6. pg_stat_statements 導入手順の docs 化 — §3.1
7. `prefers-reduced-motion` ライブ追従 — §4
8. EntityService pack の純最適化（populatePoll バッチ化ほか、API 不変）— §1.4 / #103

### 中期（設計が要る・効果大）

- 非表示時 WS 切断 + 復帰時ギャップ埋め（バッテリーと更新耐性の合流点。quick wins 1〜4 の上に成立） — §4/§5
- 省電力モード・プリセット — §4
- inbox 重複 Activity の早期棄却 — §1.3
- メモリキャッシュの LRU 上限 — §2
- 配送ペイロードの重複排除 — §1.2
- レイテンシ計測（OpenTelemetry / k6）の整備 — §6.3

### 大型・要慎重判断（P2 リスク高、本家動向を見る）

- リモートデータのプルーニング — §3.1
- 正規化ノートストア — §5
- ストリーミングのイベント連番 — §5
- pub/sub チャンネル分割 — §3.2
- note テーブルのパーティショニング — §3.1

### 戦略メモ

- **「更新耐性 → バッテリー」の順で攻める**: ギャップ埋め・リコンサイルが先にあると、「非表示時は切断してよい」という省電力の大技が安全に打てるようになる。逆順だと「切断したら取りこぼす」問題が先に出る
- **upstream PR を第一選択に**: 本家コードに TODO として残っている項目（paginator×2、DISTINCT ON）は fork で先行実装 → 本家 PR で還流させると、P2（追従コスト）を増やさずに改善できる
- **効果検証は既存 CI に載せる**: メモリ系はメモリ比較 CI、bundle 系は bundle レポート CI で必ず before/after を取る。無いのはレイテンシと電力なので、そこは §6.3 / §4 の計測手順整備が先行タスク
