## What

systemd の復元で `BACKUP_SET` による世代指定を追加し、世代選定、新規環境の準備、復元後の確認と手動復旧を説明します。Ubuntu 26.04.1 / amd64 の QEMU/KVM VM で、バックアップ・別 VM への復元・失敗注入を検証し、結果と再現方法を記録します。

## Why

#131 の systemd 部分を完了させ、運用者が必要な世代を選び、失敗時にも元の状態へ戻せる手順を公開するためです。

## Additional info (optional)

関連: #131。結果表と `reproduce.md` を参照してください。Docker の変更と共通運用メモは別 PR に分離します。TLS 証明書発行、arm64、電源断実験は対象外です。全必須ケースと出荷チェックの合格を確認してから起票します。

## Checklist

- [ ] Read the [contribution guide](https://github.com/misskey-dev/misskey/blob/develop/CONTRIBUTING.md)
- [ ] Test working in a local environment
- [ ] (If needed) Add story of storybook
- [ ] (If needed) Update CHANGELOG.md
- [ ] (If possible) Add tests
