/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const configDir = '/misskey/.config';
const configName = process.env.MISSKEY_CONFIG_YML ?? (process.env.NODE_ENV === 'test' ? 'test.yml' : 'default.yml');
const configPath = path.resolve(configDir, configName);

function readPort() {
	const config = fs.readFileSync(configPath, 'utf8');
	const match = /^port:\s*([0-9]+)\s*$/m.exec(config);
	if (!match) {
		throw new Error(`port is not configured in ${configPath}`);
	}
	return Number(match[1]);
}

const req = http.get({
	hostname: '127.0.0.1',
	port: readPort(),
	path: '/healthz',
	timeout: 4000,
}, res => {
	res.resume();
	process.exitCode = res.statusCode != null && res.statusCode >= 200 && res.statusCode < 400 ? 0 : 1;
});

req.on('timeout', () => {
	req.destroy(new Error('healthcheck timed out'));
});

req.on('error', err => {
	console.error(err.message);
	process.exitCode = 1;
});
