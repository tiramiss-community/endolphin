/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, expect, vi } from 'vitest';
import type { Config } from '@/config.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import type * as Redis from 'ioredis';

// redis.prefix (config.redisForPubsub.prefix) は複数インスタンスで Redis を共有する際の
// 名前空間分離設定。pub/sub チャンネル名も config.host 直参照ではなくこの値を使う必要がある。
// https://github.com/tiramiss-community/endolphin/issues/33
function makeConfig(overrides: { host: string; redisPrefix: string }): Config {
	return {
		host: overrides.host,
		redisForPubsub: {
			prefix: overrides.redisPrefix,
		},
	} as unknown as Config;
}

describe('GlobalEventService', () => {
	test('publish: config.redisForPubsub.prefix をチャンネル名に使う (config.host とは異なる値でも)', () => {
		const publishMock = vi.fn();
		const redisForPub = { publish: publishMock } as unknown as Redis.Redis;
		const config = makeConfig({ host: 'misskey.example.com', redisPrefix: 'shared-redis-namespace' });

		const service = new GlobalEventService(config, redisForPub);
		service.publishInternalEvent('metaUpdated', { before: null, after: null } as any);

		expect(publishMock).toHaveBeenCalledTimes(1);
		expect(publishMock.mock.calls[0][0]).toBe('shared-redis-namespace');
		expect(publishMock.mock.calls[0][0]).not.toBe(config.host);
	});

	test('publish: prefix が host にフォールバックする設定では従来通り host と一致する', () => {
		const publishMock = vi.fn();
		const redisForPub = { publish: publishMock } as unknown as Redis.Redis;
		const config = makeConfig({ host: 'misskey.example.com', redisPrefix: 'misskey.example.com' });

		const service = new GlobalEventService(config, redisForPub);
		service.publishBroadcastStream('emojiAdded' as any, undefined as any);

		expect(publishMock.mock.calls[0][0]).toBe('misskey.example.com');
	});
});
