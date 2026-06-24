/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';

// 案2（infra をコンテナで別管理・ライフサイクル共有）: postgres/redis を固定ポートで起動。
// 固定ポート（54312/56312）で公開するため start:test が読む test.yml と一致し、改変不要。
const COMPOSE_FILE = path.join(__dirname, 'compose.test.yml');

export default async function globalSetup(): Promise<void> {
	// CI 等で外部の pg/redis を使う場合は PW_SKIP_COMPOSE=1 で compose 起動をスキップできる。
	if (process.env.PW_SKIP_COMPOSE) return;

	execFileSync('docker', ['compose', '-f', COMPOSE_FILE, 'up', '-d', '--wait'], {
		stdio: 'inherit',
	});
}
