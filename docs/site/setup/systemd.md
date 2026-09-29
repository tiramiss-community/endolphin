# Ubuntu 26.04 LTS で systemd を使う

Endolphin をご自身のサーバーで運営する方向けに、Ubuntu 26.04 LTS での構築手順をご案内します。このページは **Endolphin `2026.9.1-endolphin.0`** をソースからビルドする内容です。手順を再現しやすいようリリースを固定しています。最新の正式リリースは[GitHub Releases](https://github.com/tiramiss-community/endolphin/releases/latest)でご確認ください。別の版を使う場合は、タグとその版が必要とする Node.js の要件をあわせて切り替えてください。配布 tarball を使う手順は前提にしていません。

まずはこのページに沿って基本構成を整え、公開後のチューニングは[インフラガイド (#102)](https://github.com/tiramiss-community/endolphin/issues/102)と[DB/Redis 運用ガイド (#95)](https://github.com/tiramiss-community/endolphin/issues/95)でご確認いただけます。

## 構成

この手順では PostgreSQL と Redis を同じホストで動かし、Endolphin を専用の `endolphin` ユーザーで systemd 管理します。Nginx との接続には Unix socket を使い、アプリのポートをネットワークへ公開しません。

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

`ExecStartPre` は設定をコンパイルして保留中の DB migration を適用します。起動すると systemd が `/run/endolphin` を専用ユーザーとグループ所有で作成し、後から追加する Nginx が socket を使えるようにします。

## 5. Nginx と HTTPS を設定する

公開ドメインの DNS A / AAAA レコードをこのサーバーへ向け（AAAA を登録する場合は IPv6 でも到達できることを確認し）、ファイアウォールとホスティング側の設定で TCP 80 番と 443 番への接続を許可してください。Certbot が Let’s Encrypt から HTTP-01 認証で証明書を取得し、Nginx を HTTPS 用に設定します。Ubuntu 26.04 LTS の Nginx と apt 版 Certbot を使う例です（[NGINX の WebSocket proxy](https://nginx.org/en/docs/http/websocket.html)、[Unix socket に対応する proxy_pass](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass)、[Ubuntu 26.04 の Certbot Nginx plugin](https://packages.ubuntu.com/resolute/python3-certbot-nginx)、[Certbot の Nginx 利用方法](https://eff-certbot.readthedocs.io/en/stable/using.html#nginx)）。

```sh
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
sudo systemctl enable --now nginx certbot.timer
```

Nginx の `http` コンテキストに WebSocket 用の map を追加します。Ubuntu の標準設定は `/etc/nginx/conf.d/*.conf` を `http` 内で読み込みます。

```sh
sudo tee /etc/nginx/conf.d/endolphin-websocket-map.conf > /dev/null <<'NGINX_MAP'
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}
NGINX_MAP
```

`example.tld` は `.config/default.yml` の `url` と同じホスト名へ置き換え、サイト設定を作成します。デフォルトのアップロード上限 `maxFileSize: 262144000` に余裕を持たせて `300m` としています。アプリ側の値を変更する場合は Nginx 側も合わせてください。

```sh
sudo tee /etc/nginx/sites-available/endolphin > /dev/null <<'NGINX_SITE'
server {
    listen 80;
    listen [::]:80;
    server_name example.tld;
    client_max_body_size 300m;

    location / {
        proxy_pass http://unix:/run/endolphin/endolphin.sock:/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
    }
}
NGINX_SITE
sudo ln -s /etc/nginx/sites-available/endolphin /etc/nginx/sites-enabled/endolphin
sudo nginx -t
sudo systemctl reload nginx
```

Nginx の実行ユーザー `www-data` が Unix socket を開けるよう、`endolphin` グループへ追加して Nginx を再起動します。`/run/endolphin` は unit の `RuntimeDirectoryMode=0750`、socket は `chmodSocket: '660'` で保護されます。

```sh
sudo usermod -aG endolphin www-data
sudo systemctl restart nginx
```

HTTP でサイトが応答することを確認したら、Certbot に証明書取得と HTTPS 設定を任せます。メールアドレスとドメインを実際の値に置き換えてください。

```sh
sudo certbot --nginx --redirect --agree-tos --no-eff-email \
  --email admin@example.tld -d example.tld
sudo nginx -t
sudo systemctl reload nginx
sudo certbot renew --dry-run
```

Certbot は Nginx の設定を更新し、更新用の systemd timer も設定します。公開 URL から接続できたら、初回セットアップ画面で `setupPassword` を使って管理者アカウントを作成し、管理画面の「サーバー設定」で Repository URL に `https://github.com/tiramiss-community/endolphin` を設定します。作成後は `.config/default.yml` の `setupPassword` を削除または変更し、`sudo systemctl restart endolphin` で反映してください。

Unix socket 経由の health check は次のとおりです。

```sh
sudo -u endolphin curl --unix-socket /run/endolphin/endolphin.sock http://localhost/healthz
```

細かな proxy header やサイジングは[インフラガイド (#102)](https://github.com/tiramiss-community/endolphin/issues/102)をご覧ください。

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

`/healthz` が応答しない場合は `journalctl` で DB 接続、設定コンパイル、migration のエラーを確認します。Nginx が接続できない場合は、socket が存在すること、所有者が `endolphin:endolphin` であること、mode が `660` であること、`www-data` が `endolphin` グループに属することを確認してください。
