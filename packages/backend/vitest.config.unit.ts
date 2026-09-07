import { availableParallelism } from 'node:os';
import { defineConfig, mergeConfig } from 'vitest/config';
import { baseConfig } from './vitest.config.js';

// Postgres のロックテーブルはデータベースをまたいでクラスタ全体で共有される固定サイズの
// 共有メモリ (max_locks_per_transaction * max_connections) であり、DBを分けても
// スキーマ同期 (dropSchema + synchronize、100超のテーブルに対する重い DDL) を
// 同時に捌ける本数には上限がある。実測では 24 本以上の同時実行で "out of shared memory"
// が散発したため 8 を上限とする一方、GitHub Actions 等のコア数が少ないマシンでは
// 8 に固定してしまうとCPUを食い潰すため、利用可能な並列度も超えないようにする。
// cpus().length はコンテナのcgroup CPU制限を考慮しないため availableParallelism() を使う。
const maxWorkers = Math.max(1, Math.min(availableParallelism(), 8));

export default mergeConfig(
	baseConfig,
	defineConfig({
		test: {
			globalSetup: './test/setup.unit.ts',
			environment: './test/environment.unit.ts',
			projects: [
				{
					extends: true,
					test: {
						name: 'unit',
						include: ['test/unit/**/*.ts', 'src/**/*.test.ts'],
						exclude: ['node_modules', 'dist'],
						// ファイルごとに使い捨ての Postgres データベース (test/setup.unit.parallel-db.ts) を
						// 接続先として注入するため、共有DBのスキーマ競合を気にせず並列実行できる。
						setupFiles: ['./test/setup.unit.parallel-db.ts'],
						maxWorkers,
					},
				},
			],
		},
	}),
);
