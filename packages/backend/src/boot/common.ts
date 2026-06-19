/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { NestFactory } from '@nestjs/core';
import { init } from 'slacc';
import { NestLogger } from '@/NestLogger.js';
import type { Config } from '@/config.js';

let slaccInitialized = false;

export function initExtraThreadPool(config: Config) {
	if (slaccInitialized) return;

	const threadPoolSize = Math.max(config.threadPoolSize ?? 1, 1);

	init(threadPoolSize);

	slaccInitialized = true;
}

export async function server() {
	const { MainModule } = await import('../MainModule.js');
	const { ServerService } = await import('../server/ServerService.js');

	const app = await NestFactory.createApplicationContext(MainModule, {
		logger: new NestLogger(),
	});

	const serverService = app.get(ServerService);
	await serverService.launch();

	if (process.env.NODE_ENV !== 'test') {
		// endolphin: チャート機能は削除済み。ChartManagementService の起動を撤去。
		const { QueueStatsService } = await import('../daemons/QueueStatsService.js');
		const { ServerStatsService } = await import('../daemons/ServerStatsService.js');

		app.get(QueueStatsService).start();
		app.get(ServerStatsService).start();
	}

	return app;
}

export async function jobQueue() {
	const { QueueProcessorModule } = await import('../queue/QueueProcessorModule.js');
	const { QueueProcessorService } = await import('../queue/QueueProcessorService.js');
	// endolphin: チャート機能は削除済み。ChartManagementService の起動を撤去。

	const jobQueue = await NestFactory.createApplicationContext(QueueProcessorModule, {
		logger: new NestLogger(),
	});

	jobQueue.get(QueueProcessorService).start();

	return jobQueue;
}
