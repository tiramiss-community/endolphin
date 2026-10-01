---
name: validating-release-deployment
description: Use when checking endolphin installation or operations guides on an Ubuntu release, especially systemd or official Docker image setup, upgrades, backup, or restore on a test host.
---

# validating-release-deployment

公開する配備・運用手順が、指定された OS と endolphin のリリースで実際に動くかを確認する。対象と検証範囲は依頼に合わせる。導入・更新・バックアップ・復元の**操作コマンドは** [systemd ガイド](../../../docs/site/setup/systemd.md)、[Docker ガイド](../../../docs/site/setup/docker.md)、[運用ガイド](../../../docs/site/setup/operations.md) を正本とし、スキルへ複写しない。

## 検証の組み立て

1. 指定 OS の公式イメージ、対象の正式リリースタグ、Docker image の digest / 対応 architecture を確認し、取得物の checksum を検証する。更新を試す場合は、比較対象となる直前の正式リリースを決める。`latest` の意味やタグを推測しない。
2. 実機や既存サービスから隔離した使い捨て環境を使う。VM、クラウドの検証用インスタンスなど、対象 OS が実際に起動する環境を選ぶ。QEMU/WSL2 を使う場合だけ [QEMU 検証メモ](references/tasks/qemu-wsl2.md) を読む。
3. 対象ガイドを初回利用者の順序で実行する。systemd と Docker の両方が対象なら、それぞれクリーンな OS から構築する。検証のためにガイド外の修正が必要になったら、元の手順は失敗と記録し、原因を切り分ける。
4. 各方式で起動状態に加え、Web 経由の初期管理者作成・ログイン、投稿、アップロードなど永続データを伴う代表操作を確認する。ヘルスチェックだけで成功としない。Nginx / reverse proxy、外部に公開されるポート、再起動後の自動起動も依頼範囲に応じて確認する。
5. 更新は旧版から始め、更新前に作ったデータが新版でも読めることを確認する。バックアップは元の環境で取得し、**別のクリーンな環境へ復元**してデータとログインを確認する。同一環境だけの復元では、未保存の状態への依存を見逃す。
6. 方式・操作ごとに `PASS / FAIL / SKIPPED` と根拠を残す。TLS 証明書発行、別 architecture、外部 DNS など未検証の項目は明示する。失敗を直した場合は修正後の再検証結果も記録する。

## 取り扱い

- 一時的な鍵、認証情報、VM ディスク、バックアップ、探索ログをリポジトリへ入れない。既存の稼働環境やホストのネットワーク設定を変更する前に、依頼範囲と影響を確認する。
- 配備ガイドの修正は確認した現行リリースで成立する方法を選ぶ。将来リリースにしか存在しない設定やコード変更で、現行ガイドの失敗を隠さない。
- 後片付けは検証用に作った資源だけを対象にする。失敗時に必要な証拠を採取してから停止・削除し、残った資源を報告する。
- リポジトリを変更したら、ユーザーに返す前に [shipping-misskey-change](../shipping-misskey-change/SKILL.md) に従う。外部サービスへの書き込み、commit、PR は別途その権限がある場合に限る。
