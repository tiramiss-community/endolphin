# 検証環境

検証日: 2026-10-01（JST）。ガイド開始点: `ea2e1392cab1b64e9003813efd6122f511a81689`。検証中のガイド修正は `BACKUP_SET` による世代指定、既存ディレクトリ確認、復旧用の commit・DB 名・退避先の診断ログ。

| 項目 | 固定値・確認結果 |
| --- | --- |
| OS image | [Ubuntu 公式 release-20260927](https://cloud-images.ubuntu.com/releases/resolute/release-20260927/) の `ubuntu-26.04-server-cloudimg-amd64.img` |
| OS image SHA256 | `8800651811af9a85465ad1d552add729947bb16488dddb4a9b5305a3d97332b2`、同ディレクトリの SHA256SUMS と一致 |
| ゲスト OS | Ubuntu 26.04.1 LTS / amd64 |
| Endolphin | `2026.9.1-endolphin.0` |
| アプリ commit | `f957e07228af16afc3665b3d5fd274d00968a4e6` |
| ホスト・ゲストで照合した配布 image digest | `ghcr.io/tiramiss-community/endolphin@sha256:6e4db5872cee96a9265931848ed360ef840969f7c8677319ed90a0578d94e987`、ホストとゲストで一致 |
| QEMU | 10.2.1（Ubuntu package `1:10.2.1+ds-1ubuntu3.2`） |
| KVM | ホストの `/dev/kvm` を使い捨てコンテナへ渡し、QMP `query-kvm` で `enabled=true, present=true` |
| VM resources | 6 vCPU、8 GiB RAM、50 GiB の qcow2 ディスク |
| Docker Engine / Compose（ゲスト） | 29.8.2 / v5.5.1 |
| systemd Node / pnpm | v26.4.0 / 11.25.0、ガイドの checksum 検査・導入手順を使用 |

各 VM の QEMU user network は `192.168.231.0/24`。SSH と Nginx のホスト転送は loopback 限定。Docker ゲストの bridge は `172.30.0.0/24`、自動割り当て pool は `172.31.0.0/16` として QEMU との重複を避ける。SSH の転送元はゲストから `172.17.0.1` と見えた。Docker 導入時の SSH 切断後にゲストの bridge を変更し、転送元への経路が ens3 経由であることと SSH 復旧を確認して導入を再実行した。この設定は検証環境の経路対策であり、ホストの Docker 設定は変更しない。次回は Docker の apt 導入による自動起動より前にゲスト内で設定する。

公開 DNS と証明書発行は対象外のため、VM 内の Nginx と固定したローカル HTTP URL を使う。管理者作成・ログイン・投稿・アップロードは Nginx 経由の API で実行する。ブラウザー UI の再検証は含めない。

既存のホスト DB/Redis とコンテナは使わない。使い捨て鍵・パスワード・token・バックアップ・探索ログ・ディスクは公開資料に含めない。

2026-10-02 に一時作業ツリーの消失を確認し、セッションの編集記録と実行結果から公開用資料を復元した。VM 検証日は上記のとおりで、復元時に VM 実験を再実行したものではない。公開用 shell の構文検査・文書ビルド・shipping チェックを再実行した。
