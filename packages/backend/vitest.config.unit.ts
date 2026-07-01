import { defineConfig, mergeConfig } from 'vitest/config';
import { baseConfig } from './vitest.config.js';

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
						exclude: ['node_modules', 'dist', 'test/unit/pure/**/*.ts'],
						// ファイルごとに使い捨ての Postgres データベース (test/setup.unit.parallel-db.ts) を
						// 接続先として注入するため、共有DBのスキーマ競合を気にせず並列実行できる。
						setupFiles: ['./test/setup.unit.parallel-db.ts'],
						// Postgres のロックテーブルはデータベースをまたいでクラスタ全体で共有される固定サイズの
						// 共有メモリ (max_locks_per_transaction * max_connections) であり、DBを分けても
						// スキーマ同期 (dropSchema + synchronize、100超のテーブルに対する重い DDL) を
						// 同時に捌ける本数には上限がある。実測では 24 本以上の同時実行で "out of shared memory"
						// が散発したため、確実に安全な本数に固定している (Vitest の maxWorkers: '100%' は
						// 開発機のコア数に応じて実測より大きくなりうるため使わない)。
						maxWorkers: 8,
					},
				},
				{
					extends: true,
					test: {
						name: 'unit:pure',
						include: ['test/unit/pure/**/*.ts'],
						exclude: ['node_modules', 'dist'],
						// DB接続を伴わないため本来は 'unit' より並列度を上げられるが、Vitest は
						// 同じ sequence.groupOrder (未指定時は共通) のプロジェクト間で maxWorkers が
						// 異なることを許容しない ("Provide unique 'sequence.groupOrder'" エラー)。
						// groupOrder を分けると 'unit' と直列実行になり合計時間が伸びるため、
						// 'unit' と同じ値に揃えて並行実行を優先する。
						maxWorkers: 8,
					},
				},
			],
		},
	}),
);
