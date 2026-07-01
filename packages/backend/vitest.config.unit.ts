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
