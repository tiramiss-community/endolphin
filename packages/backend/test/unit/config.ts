/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, expect } from 'vitest';
import { convertRedisOptions, getRedisPubsubChannel, loadConfig } from '@/config.js';
import type { Config } from '@/config.js';

describe('convertRedisOptions', () => {
	test('prefix 未設定時は host にフォールバックする', () => {
		const options = { host: 'redis.internal', port: 6379, pass: '' };
		const result = convertRedisOptions(options, 'misskey.example.com');

		expect(result.prefix).toBe('misskey.example.com');
		expect(result.keyPrefix).toBe('misskey.example.com:');
	});

	test('prefix 明示設定時はその値を使い、host にはフォールバックしない', () => {
		const options = { host: 'redis.internal', port: 6379, pass: '', prefix: 'shared-redis-namespace' };
		const result = convertRedisOptions(options, 'misskey.example.com');

		expect(result.prefix).toBe('shared-redis-namespace');
		expect(result.keyPrefix).toBe('shared-redis-namespace:');
	});

	test('prefix override は明示的に渡したときだけ優先する', () => {
		const options = { host: 'redis.internal', port: 6379, pass: '', prefix: 'shared-redis-namespace' };
		const result = convertRedisOptions(options, 'misskey.example.com', 'test-parallel-namespace');

		expect(result.prefix).toBe('test-parallel-namespace');
		expect(result.keyPrefix).toBe('test-parallel-namespace:');
	});
});

describe('loadConfig', () => {
	test('並列 unit test 用の Redis prefix override を Redis 設定へ注入する', () => {
		const prefix = process.env.TEST_PARALLEL_REDIS_PREFIX;
		expect(prefix).toBeDefined();

		const config = loadConfig();
		expect(config.redis.prefix).toBe(prefix);
	});
});

describe('getRedisPubsubChannel', () => {
	test('config.redisForPubsub.prefix をそのまま返す (config.host は参照しない)', () => {
		const config = {
			host: 'misskey.example.com',
			redisForPubsub: { prefix: 'shared-redis-namespace' },
		} as unknown as Config;

		expect(getRedisPubsubChannel(config)).toBe('shared-redis-namespace');
		expect(getRedisPubsubChannel(config)).not.toBe(config.host);
	});
});
