import { defineConfig, mergeConfig } from 'vitest/config';
import { baseConfig } from './vitest.config.js';

// pglite (WASM Postgres) 上で実行すると失敗するテスト。pglite プロジェクトからは除外し、
// unit:shared-pg で従来通り実 Postgres に接続して直列実行する。
// - chart.ts / RoleService.ts / CheckModeratorsActivityProcessorService.ts:
//   @sinonjs/fake-timers の shouldClearNativeTimers:true でネイティブタイマーを潰すため、
//   内部でネイティブタイマーに依存する pglite のクエリ実行がフェイクタイマー適用中に
//   永久にハングする。
// - activitypub.ts: fake-timers を使わないが、実 Postgres では常に成功する一方 pglite では
//   単体実行でも非決定的に失敗する (実測: 5 回中 5 回失敗、失敗箇所は毎回異なる)。
//   複数エンティティ/JSONB を含む複雑な INSERT 経路で pglite 側に未特定の不具合がある。
const SHARED_PG_ONLY_TESTS = [
	'test/unit/chart.ts',
	'test/unit/RoleService.ts',
	'test/unit/queue/processors/CheckModeratorsActivityProcessorService.ts',
	'test/unit/activitypub.ts',
];

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
						name: 'unit:pglite',
						include: ['test/unit/**/*.ts', 'src/**/*.test.ts'],
						exclude: [
							'node_modules', 'dist', 'test/unit/pure/**/*.ts',
							...SHARED_PG_ONLY_TESTS,
						],
						// ファイルごとに独立した pglite インスタンス (test/setup.unit.pglite.ts) を
						// 接続先として注入するため、共有DBのスキーマ競合を気にせず並列実行できる。
						setupFiles: ['./test/setup.unit.pglite.ts'],
						maxWorkers: '100%',
					},
				},
				{
					extends: true,
					test: {
						// pglite では安定して動かないテスト (理由は SHARED_PG_ONLY_TESTS の定義を参照) を
						// 従来通り共有の実 Postgres に接続し直列実行する。
						name: 'unit:shared-pg',
						include: SHARED_PG_ONLY_TESTS,
						exclude: ['node_modules', 'dist'],
						maxWorkers: 1,
					},
				},
				{
					extends: true,
					test: {
						name: 'unit:pure',
						include: ['test/unit/pure/**/*.ts'],
						exclude: ['node_modules', 'dist'],
						// extends: true で maxWorkers を省略するとルート設定の
						// maxWorkers: 1 をそのまま継承してしまうため、Vitestの
						// コア数ベースの並列実行に相当する値を明示する必要がある。
						maxWorkers: '100%',
					},
				},
			],
		},
	}),
);
