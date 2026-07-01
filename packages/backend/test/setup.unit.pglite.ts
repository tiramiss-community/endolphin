/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { afterAll } from 'vitest';

// テストファイルごと (vitest の isolate によりこのファイル自体もファイル単位で再実行される) に
// 完全に独立した in-memory Postgres を用意する。GlobalModule 経由の DataSource も
// initTestDb() も config.db.host/port を読むだけなので、ここで環境変数を上書きしておけば
// テスト側のコード変更は不要 (`createPostgresDataSource` の synchronize:true が起動時に
// スキーマを自動構築する)。
const db = await PGlite.create();
const server = new PGLiteSocketServer({
	db,
	port: 0,
	host: '127.0.0.1',
	// TypeORM の pg プールと initTestDb() が同時に複数接続を張るため、直列キューで捌ける範囲で多めに確保する。
	maxConnections: 20,
});
await server.start();

const [host, port] = server.getServerConn().split(':');
process.env.TEST_PGLITE_DB_HOST = host;
process.env.TEST_PGLITE_DB_PORT = port;

// Redis はファイル間で共有 (実 Redis) のままなので、pub/sub チャンネルや ioredis の keyPrefix が
// 衝突すると他ファイルのキャッシュ無効化イベント等を拾ってしまう。DB と同じくファイル固有の値で
// prefix を分離し、並列実行時のクロストークを防ぐ (port だけだと OS のポート再利用で別実行の
// 残留キーと衝突しうるため randomUUID も混ぜる)。
process.env.TEST_PGLITE_REDIS_PREFIX = `test-pglite-${port}-${randomUUID()}`;

afterAll(async () => {
	await server.stop();
	await db.close();
	// 同一ワーカープロセスがこの後 unit:shared-pg 等の別プロジェクトのテストを実行する場合に、
	// 停止済みの pglite / 使い終えた Redis prefix を参照し続けないよう明示的に元へ戻す。
	delete process.env.TEST_PGLITE_DB_HOST;
	delete process.env.TEST_PGLITE_DB_PORT;
	delete process.env.TEST_PGLITE_REDIS_PREFIX;
});
