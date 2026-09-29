# 共通の運用メモ

このページは **Endolphin `2026.9.1-endolphin.0`** 向けです。各方式の具体的な構築・更新・復元コマンドは[systemd 手順](./systemd.md)または[Docker 手順](./docker.md)を参照してください。

## 保存対象

復元できるよう、次のデータを同じ時点のセットとして保存してください。

- PostgreSQL のデータベース（必要に応じて DB ロールも別途記録）
- `.config/default.yml` などの設定ファイルと、Docker の場合は `.config/docker.env`
- `files/` に保存されるアップロードファイル

DB だけ、または設定とファイルだけでは、完全な復旧になりません。バックアップ先は本体ホストと分離し、秘密情報を含む設定と DB dump の読み取り権限を制限します。

## 更新の基本

1. 正式リリースの変更内容と移行案内を確認する。
2. DB、設定、アップロードファイルを退避する。
3. systemd は指定タグを checkout して依存更新・再ビルド、Docker は配布イメージのタグ更新・pull を行う。
4. 起動ログで migration と起動完了を確認する。
5. 公開 URL、ログイン、投稿、アップロード済みファイルを確認する。

起動後の DB migration を元に戻す一般的な自動手順はありません。復旧が必要なときは、アプリを停止して対応するバックアップ一式を復元します。バージョンを戻す前に、そのリリースの互換性と migration の扱いを確認してください。

## 関連ガイド

- [リバースプロキシとサイジング (#102)](https://github.com/tiramiss-community/endolphin/issues/102)
- [PgBouncer、autovacuum、Redis 分離 (#95)](https://github.com/tiramiss-community/endolphin/issues/95)
