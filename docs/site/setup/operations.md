# 共通の運用メモ

安心して運用を続けられるよう、更新とバックアップの基本をまとめました。各構築ガイドのコマンドは再現性のため、検証済みリリースのタグに固定しています。運用時は[最新の正式リリースと変更内容](https://github.com/tiramiss-community/endolphin/releases/latest)をご確認ください。具体的な構築・更新手順は[systemd ガイド](./systemd.md)または[Docker ガイド](./docker.md)をご覧いただけます。

バックアップ・復旧の具体的な手順は現在準備中です。掲載されるまでは、更新前にご自身でバックアップと復旧を用意し、実際に復旧できることを別途検証してください。整備状況は[関連 Issue #131](https://github.com/tiramiss-community/endolphin/issues/131)で確認できます。

## 保存対象

復旧時に困らないよう、次のデータを同じ時点のセットとして保存します。

- PostgreSQL のデータベース（必要に応じて DB ロールも別途記録）
- 実行中のアプリ版（systemd は Git タグ、Docker は `compose.yml` のイメージタグ）
- `.config/default.yml` などの設定ファイルと、Docker の場合は `.config/docker.env`
- `files/` に保存されるアップロードファイル

DB、設定、ファイルと対応するアプリ版をそろえてください。バックアップは本体ホストと分けて保管し、秘密情報を含む設定と DB dump は読み取り権限を制限してください。この一覧は保存対象の目安であり、実行手順や復旧方法は示していません。

## 更新の基本

1. 正式リリースの変更内容と移行案内を確認する。
2. DB、設定、アップロードファイルと、その時点のアプリ版を含むバックアップ・復旧を事前に検証する。
3. systemd は指定タグを checkout して依存更新・再ビルド、Docker は配布イメージのタグ更新・pull を行う。
4. 起動ログで migration と起動完了を確認する。
5. 公開 URL、ログイン、投稿、アップロード済みファイルを確認する。

更新後に問題が起きた場合は、事前に検証した復旧手順を使ってください。このサイトには現時点で復旧手順を掲載していません。

## 関連ガイド

- [リバースプロキシとサイジング (#102)](https://github.com/tiramiss-community/endolphin/issues/102)
- [PgBouncer、autovacuum、Redis 分離 (#95)](https://github.com/tiramiss-community/endolphin/issues/95)
