/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll } from 'vitest';
import { loadConfig } from '@/config.js';

// テストファイルごと (vitest の isolate によりこのファイル自体もファイル単位で再実行される) に、
// 共有の実 Postgres 上へ使い捨てのデータベースを作成する。GlobalModule 経由の DataSource も
// initTestDb() も config.db.db を読むだけなので、ここで環境変数を上書きしておけばテスト側の
// コード変更は不要 (`createPostgresDataSource` の synchronize:true が起動時にスキーマを自動構築する)。
const config = loadConfig();
const dbName = `test_unit_${randomUUID().replaceAll('-', '_')}`;

const admin = new pg.Client({
	host: config.db.host,
	port: config.db.port,
	user: config.db.user,
	password: config.db.pass,
	database: config.db.db,
});
await admin.connect();
await admin.query(`CREATE DATABASE "${dbName}"`);

// CREATE DATABASE 成功直後に登録する。この後の環境変数設定などで例外が起きても
// 使い捨てDBが削除されずに残り続けることを防ぐため。
afterAll(async () => {
	try {
		// テスト対象がコネクションを張ったまま DataSource を破棄しないことがあるため、
		// DROP DATABASE の前に当該DBへの接続を強制切断しておく。
		await admin.query(
			'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
			[dbName],
		);
		await admin.query(`DROP DATABASE IF EXISTS "${dbName}"`);
	} finally {
		try {
			await admin.end();
		} finally {
			// 同一ワーカープロセスがこの後 unit:pure 等の別プロジェクトのテストを実行する場合に、
			// 削除済みDB名や使い終えた Redis prefix を参照し続けないよう明示的に元へ戻す。
			// admin.end() が失敗しても環境変数のクリーンアップだけは必ず行う。
			delete process.env.TEST_PARALLEL_DB_NAME;
			delete process.env.TEST_PARALLEL_REDIS_PREFIX;
		}
	}
});

process.env.TEST_PARALLEL_DB_NAME = dbName;

// Redis はファイル間で共有 (実 Redis) のままなので、pub/sub チャンネルや ioredis の keyPrefix が
// 衝突すると他ファイルのキャッシュ無効化イベント等を拾ってしまう。DB と同じくファイル固有の値で
// prefix を分離し、並列実行時のクロストークを防ぐ。
process.env.TEST_PARALLEL_REDIS_PREFIX = `test-parallel-${randomUUID()}`;
