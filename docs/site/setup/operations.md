# 共通の運用メモ

安心して運用を続けられるよう、更新とバックアップの基本をまとめました。各構築ガイドのコマンドは再現性のため、検証済みリリースのタグに固定しています。運用時は[最新の正式リリースと変更内容](https://github.com/tiramiss-community/endolphin/releases/latest)をご確認ください。具体的な構築・更新・復元手順は[systemd ガイド](./systemd.md)または[Docker ガイド](./docker.md)をご覧いただけます。

## 保存対象

復元時に困らないよう、次のデータを同じ時点のセットとして保存しておきましょう。

- PostgreSQL のデータベース（必要に応じて DB ロールも別途記録）
- `.config/default.yml` などの設定ファイルと、Docker の場合は `.config/docker.env`
- `files/` に保存されるアップロードファイル

DB、設定、ファイルをそろえることで、インスタンス全体を復元できます。バックアップは本体ホストと分けて保管し、秘密情報を含む設定と DB dump は読み取り権限を制限してください。

## 更新の基本

1. 正式リリースの変更内容と移行案内を確認する。
2. DB、設定、アップロードファイルを退避する。
3. systemd は指定タグを checkout して依存更新・再ビルド、Docker は配布イメージのタグ更新・pull を行う。
4. 起動ログで migration と起動完了を確認する。
5. 公開 URL、ログイン、投稿、アップロード済みファイルを確認する。

DB migration の後戻しが必要になった場合は、アプリを停止し、同じ時点のバックアップ一式を復元してください。以前のバージョンへ戻す前に、そのリリースの互換性と migration の案内をご確認ください。

## 関連ガイド

- [リバースプロキシとサイジング (#102)](https://github.com/tiramiss-community/endolphin/issues/102)
- [PgBouncer、autovacuum、Redis 分離 (#95)](https://github.com/tiramiss-community/endolphin/issues/95)
