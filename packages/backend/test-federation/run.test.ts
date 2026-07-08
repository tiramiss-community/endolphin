/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import {
	buildComposeLogsArgs,
	buildTesterRunArgs,
	createMisskeyConfig,
	normalizeArgs,
	renderHostTemplate,
	resolveNodeVersion,
	shouldUseDockerVolumeCleanup,
} from './run.js';

// Docker/OpenSSL を起動する integration test とは分けて、runner の分岐や生成物の形だけを高速に固定する。
// federation 環境は壊れたときの調査コストが高いため、shell 非依存・引数受け渡し・設定生成の退行を先にここで検出する。
describe('test-federation runner helpers', () => {
	test('renders host templates without shell expansion', () => {
		expect(renderHostTemplate('server_name ${HOST}; proxy_pass http://misskey.${HOST}:3000;', 'a.test'))
			.toBe('server_name a.test; proxy_pass http://misskey.a.test:3000;');
	});

	test('creates the per-host Misskey config from typed data', () => {
		expect(createMisskeyConfig('b.test')).toStrictEqual({
			url: 'https://b.test/',
			port: 3000,
			db: {
				host: 'db.b.test',
				port: 5432,
				db: 'misskey',
				user: 'postgres',
				pass: 'postgres',
			},
			dbReplications: false,
			trustProxy: true,
			redis: {
				host: 'redis.test',
				port: 6379,
			},
			id: 'aidx',
			proxyBypassHosts: [
				'api.deepl.com',
				'api-free.deepl.com',
				'www.recaptcha.net',
				'hcaptcha.com',
				'challenges.cloudflare.com',
			],
			allowedPrivateNetworks: [
				'127.0.0.1/32',
				'10.210.0.0/16',
			],
		});
	});

	test('passes requested test files through to the inner vitest script', () => {
		expect(buildTesterRunArgs(['packages/backend/test-federation/test/user.test.ts'])).toStrictEqual([
			'compose',
			'run',
			'--no-deps',
			'--rm',
			'tester',
			'pnpm',
			'-F',
			'backend',
			'test:fed:vitest',
			'--',
			'packages/backend/test-federation/test/user.test.ts',
		]);
	});

	test('builds compose logs args with optional noisy server suppression', () => {
		expect(buildComposeLogsArgs({}, {
			fullLogs: false,
			suppressServerLogs: false,
		})).toStrictEqual(['compose', 'logs']);

		expect(buildComposeLogsArgs({}, {
			fullLogs: false,
			suppressServerLogs: true,
		})).toStrictEqual([
			'compose',
			'logs',
			'tester',
			'daemon',
			'a.test',
			'b.test',
			'setup',
			'db.a.test',
			'db.b.test',
			'redis.test',
		]);

		expect(buildComposeLogsArgs({}, {
			logServices: 'tester, daemon ,redis.test',
			fullLogs: false,
			suppressServerLogs: true,
		})).toStrictEqual([
			'compose',
			'logs',
			'tester',
			'daemon',
			'redis.test',
		]);

		expect(buildComposeLogsArgs({
			MISSKEY_TEST_FEDERATION_LOG_SERVICES: 'tester',
		}, {
			fullLogs: true,
			suppressServerLogs: false,
		})).toStrictEqual(['compose', 'logs']);
	});

	test('parses runner options separately from inner Vitest args', () => {
		expect(normalizeArgs([
			'--log-services=tester',
			'--',
			'packages/backend/test-federation/test/user.test.ts',
		])).toStrictEqual({
			setupOnly: false,
			testArgs: ['packages/backend/test-federation/test/user.test.ts'],
			composeLogOptions: {
				logServices: 'tester',
				fullLogs: false,
				suppressServerLogs: false,
			},
		});

		expect(normalizeArgs([
			'--full-logs',
			'--setup-only',
		])).toStrictEqual({
			setupOnly: true,
			testArgs: [],
			composeLogOptions: {
				fullLogs: true,
				suppressServerLogs: false,
			},
		});
	});

	test('resolves Docker node version from env, version file, then default', () => {
		expect(resolveNodeVersion({
			env: { NODE_VERSION: '24.10.0' },
			readVersionFile: () => {
				throw new Error('version file should not be read');
			},
		})).toBe('24.10.0');

		expect(resolveNodeVersion({
			env: { MISSKEY_TEST_FEDERATION_NODE_VERSION_FILE: '.github/min.node-version' },
			readVersionFile: (path) => path === '.github/min.node-version' ? '22.22.2\n' : '24.10.0\n',
		})).toBe('22.22.2');

		expect(resolveNodeVersion({
			env: {},
			readVersionFile: (path) => path === '.node-version' ? '24.10.0\n' : '22.22.2\n',
		})).toBe('24.10.0');
	});

	test('falls back to Docker cleanup only for permission failures', () => {
		expect(shouldUseDockerVolumeCleanup(Object.assign(new Error('denied'), { code: 'EACCES' }))).toBe(true);
		expect(shouldUseDockerVolumeCleanup(Object.assign(new Error('denied'), { code: 'EPERM' }))).toBe(true);
		expect(shouldUseDockerVolumeCleanup(Object.assign(new Error('missing'), { code: 'ENOENT' }))).toBe(false);
		expect(shouldUseDockerVolumeCleanup(new Error('plain'))).toBe(false);
	});
});
