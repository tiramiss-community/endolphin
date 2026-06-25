/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// `pnpm -C playwright explore`
//
// 対話的な Playwright MCP（browser_*）/ codegen 探索のために、e2e rig と同じ infra
// （compose.test.yml の pg/redis）と無改変の `pnpm start:test` を起動して :61812 を保持し、
// Ctrl-C で start:test を止めて `docker compose down -v` まで自動で後片付けする。
//
// spec の「実行」は `pnpm -C playwright test` が webServer + globalTeardown で自前に
// 起動/終了するのでこのスクリプトは不要。これは寿命がテスト実行に紐づかない
// 「探索セッション」だけのためのもの（docs/endolphin/playwright-e2e.md の Stage 4）。
//
// 前提: start:test は built/entry.js を使うので事前に `pnpm build` が要る。
// PW_SKIP_COMPOSE=1 で compose をスキップ（外部 pg/redis 利用時、rig と同じ挙動）。

import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLAYWRIGHT_DIR = path.resolve(__dirname, '..'); // playwright/
const ROOT = path.resolve(PLAYWRIGHT_DIR, '..'); // リポジトリルート（start:test はここで動く）
const COMPOSE_FILE = path.join(PLAYWRIGHT_DIR, 'compose.test.yml');
const TARGET_URL = 'http://localhost:61812';
const SKIP_COMPOSE = !!process.env.PW_SKIP_COMPOSE;
const READY_TIMEOUT_MS = 240_000;

function log(msg) {
	process.stdout.write(`\x1b[36m▶\x1b[0m ${msg}\n`);
}

function ping(url) {
	return new Promise((resolve) => {
		const req = http.get(url, (res) => {
			res.resume();
			// 起動途中の Misskey は 5xx を返す。2xx/3xx/4xx になって初めて ready とみなす。
			resolve(typeof res.statusCode === 'number' && res.statusCode < 500);
		});
		req.on('error', () => resolve(false));
		req.setTimeout(2000, () => {
			req.destroy();
			resolve(false);
		});
	});
}

async function waitFor(url, timeoutMs) {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (await ping(url)) return true;
		await new Promise((r) => setTimeout(r, 1000));
	}
	return false;
}

let server = null;
let tearingDown = false;

async function teardown(code) {
	if (tearingDown) return;
	tearingDown = true;
	if (server && server.pid) {
		log('stop start:test');
		try {
			// detached で起動しているのでプロセスグループごと落とす（node 子プロセスの取りこぼし防止）
			process.kill(-server.pid, 'SIGTERM');
		} catch {
			// already gone
		}
	}
	if (!SKIP_COMPOSE) {
		log('docker compose down -v');
		try {
			execFileSync('docker', ['compose', '-f', COMPOSE_FILE, 'down', '-v'], { stdio: 'inherit' });
		} catch {
			// best effort
		}
	}
	process.exit(code);
}

process.on('SIGINT', () => { teardown(0); });
process.on('SIGTERM', () => { teardown(0); });

(async () => {
	// 既に :61812 が上がっていれば再利用する（自分で起動していないものは撤去もしない）。
	if (await ping(TARGET_URL)) {
		log(`${TARGET_URL} は既に起動済み — 再利用します（このスクリプトでは撤去しません）`);
		log('MCP / codegen で探索してください。Ctrl-C で終了（既存サーバはそのまま）。');
		await new Promise(() => {}); // SIGINT まで待機
		return;
	}

	if (!SKIP_COMPOSE) {
		log('docker compose up -d --wait  (pg:54312 / redis:56312)');
		execFileSync('docker', ['compose', '-f', COMPOSE_FILE, 'up', '-d', '--wait'], { stdio: 'inherit' });
	} else {
		log('PW_SKIP_COMPOSE=1 — 外部の pg/redis を利用');
	}

	log('pnpm start:test  (node built/entry.js — 事前に `pnpm build` が必要)');
	server = spawn('pnpm', ['start:test'], { cwd: ROOT, stdio: 'inherit', detached: true });
	server.on('exit', (exitCode) => {
		if (!tearingDown) {
			log(`start:test が終了しました (${exitCode}) — 後片付けします`);
			teardown(exitCode ?? 1);
		}
	});

	if (!(await waitFor(TARGET_URL, READY_TIMEOUT_MS))) {
		log(':61812 が起動しませんでした — `pnpm build` 済みか確認してください');
		await teardown(1);
		return;
	}

	log(`ready → ${TARGET_URL}`);
	process.stdout.write(
		'\n  Playwright MCP (browser_*) または `pnpm -C playwright codegen` で探索してください。\n' +
		'  Ctrl-C で start:test 停止 + docker compose down -v まで自動で後片付けします。\n\n',
	);
	await new Promise(() => {}); // SIGINT まで保持
})().catch(async (e) => {
	process.stderr.write(`${e?.stack ?? e}\n`);
	await teardown(1);
});
