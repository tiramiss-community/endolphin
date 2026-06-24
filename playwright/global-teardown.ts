/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';

const COMPOSE_FILE = path.join(__dirname, 'compose.test.yml');

export default async function globalTeardown(): Promise<void> {
	if (process.env.PW_SKIP_COMPOSE) return;

	execFileSync('docker', ['compose', '-f', COMPOSE_FILE, 'down', '-v'], {
		stdio: 'inherit',
	});
}
