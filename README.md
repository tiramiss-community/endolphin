# Endolphin

[English](README.en.md)

Endolphin は、お一人様～少人数規模なコミュニティ向けの、軽量な Misskey fork です。

## Endolphin とは

Endolphin は、かつての [Dolphin](https://github.com/misskey-dev/dolphin) に着想を得た名称です。
Dolphin ほどシンプルすぎず、Misskey ほど多機能でもない、お一人様～少人数規模のコミュニティ向けにちょうどよいバランスを目指しています。
数千人・数万人規模の公開インスタンスではなく、友人・趣味のコミュニティなど、少人数での交流に必要な機能を厳選して残しました。

## 機能の範囲

タイムライン、ノート、ドライブ、ActivityPub 連合、リスト、アンテナ、モデレーション、チャンネル、デッキなどのコア機能は維持します。

一方で、お気に入り、ページ、ギャラリー、実績、Games、埋め込み、チャート、チャット、管理 DB 統計、リテンション分析、広告・プロモーションは削除済みです。
削除対象の完全な分類と各 API・画面の扱いは [feature inventory](docs/endolphin/feature-inventory.md) に記録しています。

API 互換性のため、削除済み機能の endpoint 自体は残しています。read 系 endpoint は空配列・`null`・既定値を返し、write 系 endpoint は `FEATURE_REMOVED`（HTTP 410 Gone）を返します。
entity、テーブル、migration、JSON schema も温存するため、既存のサードパーティアプリやデータベースとの互換性を保てます。

## はじめるには

- Endolphin 固有の方針と運用上の注意は [fork policy](docs/endolphin/fork-policy.md) を確認してください。
- 開発やコントリビュートの手順は [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。

## 開発・追従

Endolphin は misskey-dev/misskey を継続的に取り込みます。
upstream develop のミラー（`origin/upstream/develop`）とリリースタグ（`upstream/*`）は `.endolphin/` の運用スクリプトが自動取得します。詳しいフローは [fork policy の upstream 追従フロー](docs/endolphin/fork-policy.md#upstream-追従フロー) を参照してください。

Endolphin 固有の変更履歴は [CHANGELOG-endolphin.md](CHANGELOG-endolphin.md) に記録しています。misskey-dev/misskey 由来の変更は `CHANGELOG.md` を参照してください。

## ライセンスと謝辞

Endolphin は [AGPL-3.0-only](LICENSE) で提供しています。
本プロジェクトは [Misskey](https://github.com/misskey-dev/misskey) を基にしています。Misskey プロジェクトとすべての貢献者に感謝します。
