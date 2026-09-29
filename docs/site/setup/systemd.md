# Ubuntu 26.04 LTS で systemd を使う

このページは **Endolphin `2026.9.1-endolphin.0`** を Ubuntu 26.04 LTS にソースからビルドして常駐させる手順です。別のリリースでは、タグ名と必要な Node.js の版を読み替えてください。配布 tarball を使う手順は前提にしていません。

リバースプロキシの設定や推奨スペックは[インフラガイド (#102)](https://github.com/tiramiss-community/endolphin/issues/102)、PgBouncer・autovacuum・Redis 分離は[DB/Redis 運用ガイド (#95)](https://github.com/tiramiss-community/endolphin/issues/95)を参照してください。

## 構成

この手順では PostgreSQL と Redis を同じホストで動かし、Endolphin は専用の `endolphin` ユーザーで systemd 管理します。Endolphin は Unix socket で待ち受け、Caddy がその socket 経由で接続します。

## 1. OS と依存サービス

Ubuntu 26.04 LTS の amd64 / arm64 を想定しています。Node.js はプロジェクト要件を満たす **26.4.0** を使います（backend の `engines` は `^22.22.2 || ^24.17.0 || ^26.4.0`）。ビルドには Git、C/C++ ビルドツールも必要です。

```sh
sudo apt update
sudo apt install -y ca-certificates curl xz-utils git build-essential ffmpeg libatomic1 postgresql redis-server
```

Node.js 公式配布物を検証して `/usr/local` に展開します。

```sh
case "$(dpkg --print-architecture)" in
  amd64) NODE_ARCH=x64 ;;
  arm64) NODE_ARCH=arm64 ;;
  *) echo "この手順は amd64 / arm64 向けです" >&2; exit 1 ;;
esac
NODE_VERSION=26.4.0
cd /tmp
curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz"
curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt"
grep " node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz$" SHASUMS256.txt | sha256sum -c -
sudo tar -xJf "node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" -C /usr/local --strip-components=1 --no-same-owner
sudo npm install --global pnpm@11.25.0
node --version
pnpm --version
```

最後の2行がそれぞれ `v26.4.0` と `11.25.0` になることを確認します。PostgreSQL と Redis が起動していることも確認してください。

```sh
sudo systemctl enable --now postgresql redis-server
sudo systemctl status postgresql redis-server --no-pager
```

## 2. DB と実行ユーザー

PostgreSQL に専用ロールとデータベースを作ります。ここでは DB 名とロール名を `endolphin` とします。パスワードは任意の強い値に置き換え、コマンド履歴に残る点に注意してください。

```sh
sudo -u postgres createuser --pwprompt endolphin
sudo -u postgres createdb --owner=endolphin endolphin
sudo adduser --system --group --home /var/lib/endolphin endolphin
```

## 3. リリースのビルド

```sh
sudo install -d -o endolphin -g endolphin /opt/endolphin
sudo -u endolphin git clone --branch 2026.9.1-endolphin.0 --depth 1 \
  https://github.com/tiramiss-community/endolphin.git /opt/endolphin
sudo -u endolphin mkdir -p /var/lib/endolphin/files
sudo -u endolphin ln -s /var/lib/endolphin/files /opt/endolphin/files
cd /opt/endolphin
sudo -u endolphin /usr/local/bin/pnpm install --frozen-lockfile
sudo -u endolphin /usr/local/bin/pnpm build
```

ビルドが完了したら、設定ファイルとアップロードファイル用ディレクトリを用意します。

```sh
sudo -u endolphin install -d /opt/endolphin/.config
sudo -u endolphin cp /opt/endolphin/.config/example.yml /opt/endolphin/.config/default.yml
sudo chmod 600 /opt/endolphin/.config/default.yml
```

`.config/default.yml` を編集します。次のキーを設定し、`<DB_PASSWORD>` と `<SETUP_PASSWORD>` を強い値へ置き換えてください。その他の設定は例のままにします。

```yaml
url: https://example.tld/
socket: /run/endolphin/endolphin.sock
chmodSocket: '660'
setupPassword: <SETUP_PASSWORD>
db:
  host: 127.0.0.1
  port: 5432
  db: endolphin
  user: endolphin
  pass: <DB_PASSWORD>
redis:
  host: 127.0.0.1
  port: 6379
```

初回セットアップ完了後は `setupPassword` を削除または変更します。

`url` はインスタンスの公開 URL です。起動後に変更しないでください。`socket` を設定すると TCP port 設定は使われず、Endolphin は `/run/endolphin/endolphin.sock` のみで待ち受けます。

初回の設定コンパイルと DB migration は、次の systemd ユニット起動時に行われます。

## 4. systemd ユニット

`/etc/systemd/system/endolphin.service` を作成します。

```ini
[Unit]
Description=Endolphin server
After=network-online.target postgresql.service redis-server.service
Wants=network-online.target

[Service]
Type=simple
User=endolphin
Group=endolphin
WorkingDirectory=/opt/endolphin
Environment=NODE_ENV=production
RuntimeDirectory=endolphin
RuntimeDirectoryMode=0750
ExecStartPre=/usr/local/bin/pnpm migrate
ExecStart=/usr/local/bin/node packages/backend/built/entry.js
Restart=on-failure
RestartSec=5
UMask=0027

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now endolphin
sudo systemctl status endolphin --no-pager
sudo journalctl -u endolphin -n 100 --no-pager
```

`ExecStartPre` は設定をコンパイルして保留中の DB migration を適用します。起動すると systemd が `/run/endolphin` を専用ユーザーとグループ所有で作成し、Caddy が socket を使えるようにします。

## 5. HTTPS リバースプロキシ

例では Caddy を使います。Caddy の公式 Debian / Ubuntu パッケージを導入します（[公式インストール手順](https://caddyserver.com/docs/install)）。DNS の A / AAAA レコードをこのサーバーへ向け、外部から TCP 80 / 443 番へ到達できるようにしてください。Caddy は HTTPS 証明書を自動取得し、WebSocket 接続も中継します。

```sh
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

`/etc/caddy/Caddyfile` にドメインを設定します。

```text
example.tld {
    reverse_proxy unix//run/endolphin/endolphin.sock {
        header_up Host {host}
    }
}
```

`example.tld` を `.config/default.yml` の `url` と同じホスト名に置き換えます。

```sh
sudo usermod -aG endolphin caddy
sudo systemctl restart caddy
sudo systemctl status caddy --no-pager
```

`caddy` ユーザーに `endolphin` グループを追加すると、Caddy は `/run/endolphin` を通って mode `660` の socket に接続できます。`RuntimeDirectoryMode=0750` のため、グループ参加がないプロセスにはディレクトリ内を公開しません。Caddy の Unix socket upstream 構文は `unix//run/...` です。Host header を公開ドメインのまま渡すため `header_up Host {host}` も指定しています。WebSocket は Caddy の `reverse_proxy` が中継します。詳細な proxy 設定やサイジングは #102 を参照してください。

起動ログにエラーがないことを確認し、ブラウザーで公開 URL を開きます。初回セットアップ画面で `setupPassword` を使って管理者アカウントを作成し、管理画面の「サーバー設定」で Repository URL に `https://github.com/tiramiss-community/endolphin` を設定します。作成後は `.config/default.yml` の `setupPassword` を削除または変更し、`sudo systemctl restart endolphin` で反映してください。socket 経由の起動確認は次のとおりです。

```sh
sudo -u endolphin curl --unix-socket /run/endolphin/endolphin.sock http://localhost/healthz
```

Caddy の設定または補助グループを変更した後は、Caddy を reload ではなく restart して新しい group membership を反映してください。

## 6. 更新

更新前に「バックアップと復元」の手順で DB、設定、`files/` を退避します。新しい正式リリースのタグに置き換えてビルドし、サービスを再開します。ユニットの `ExecStartPre` が `pnpm migrate` を実行してから本体を起動します。

```sh
sudo systemctl stop endolphin
cd /opt/endolphin
sudo -u endolphin git fetch --tags origin
sudo -u endolphin git checkout --detach <新しいリリースタグ>
sudo -u endolphin /usr/local/bin/pnpm install --frozen-lockfile
sudo -u endolphin /usr/local/bin/pnpm build
sudo systemctl start endolphin
sudo systemctl status endolphin --no-pager
sudo journalctl -u endolphin -n 100 --no-pager
```

起動時の migration が完了し、ログにエラーがなく、ブラウザーと `/healthz` で動作することを確認します。失敗した場合はサービスを停止し、バックアップから DB、設定、ファイルを同じ時点の組み合わせで復元します。

## 7. バックアップと復元

この例ではサービス停止中にバックアップし、DB の一貫性を保ちます。バックアップ先はアクセスを制限した別ディスクまたは別ホストにしてください。DB dump に加えて、設定とアップロードファイルを必ず同じ時点で保存します。

```sh
sudo systemctl stop endolphin
sudo install -d -o "$USER" -g "$(id -gn)" -m 700 /var/backups/endolphin
sudo -u postgres pg_dump -Fc endolphin > /var/backups/endolphin/db.dump
sudo tar -C /opt/endolphin -czf - .config/default.yml > /var/backups/endolphin/config.tgz
sudo tar -C /var/lib/endolphin -czf - files > /var/backups/endolphin/files.tgz
sudo systemctl start endolphin
chmod 600 /var/backups/endolphin/*
```

復元は、対象インスタンスを停止し、復元先の DB を作り直せることを確認してから行います。次の例は既存 DB を削除します。DB 名は `endolphin` を想定しています。

```sh
sudo systemctl stop endolphin
sudo -u postgres dropdb --if-exists endolphin
sudo -u postgres createdb --owner=endolphin endolphin
sudo -u postgres pg_restore --no-owner --role=endolphin --dbname=endolphin - < /var/backups/endolphin/db.dump
sudo tar --no-same-owner -C /opt/endolphin -xzf /var/backups/endolphin/config.tgz
sudo tar --no-same-owner -C /var/lib/endolphin -xzf /var/backups/endolphin/files.tgz
sudo chown -R endolphin:endolphin /var/lib/endolphin/files /opt/endolphin/.config
sudo systemctl start endolphin
```

ロール `endolphin` がまだない新しい PostgreSQL へ復元する場合は、先に「DB と実行ユーザー」の手順で作成してください。復元後はログ、トップページ、ログイン、過去のアップロード画像を確認します。復元訓練を定期的に行い、バックアップが読めることを確かめてください。

## 8. ログと確認

```sh
sudo systemctl status endolphin --no-pager
sudo journalctl -u endolphin -f
sudo systemctl status postgresql redis-server --no-pager
sudo -u endolphin curl --unix-socket /run/endolphin/endolphin.sock http://localhost/healthz
```

`/healthz` が応答しない場合は `journalctl` で DB 接続、設定コンパイル、migration のエラーを確認します。Caddy が接続できない場合は、socket が存在すること、所有者が `endolphin:endolphin` であること、mode が `660` であること、`caddy` が `endolphin` グループに属することを確認してください。
