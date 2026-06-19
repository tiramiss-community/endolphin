/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { IsNull } from 'typeorm';
import type { InstancesRepository, NoteReactionsRepository, NotesRepository, UsersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	requireCredential: false,

	tags: ['meta'],

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			notesCount: {
				type: 'number',
				optional: false, nullable: false,
			},
			originalNotesCount: {
				type: 'number',
				optional: false, nullable: false,
			},
			usersCount: {
				type: 'number',
				optional: false, nullable: false,
			},
			originalUsersCount: {
				type: 'number',
				optional: false, nullable: false,
			},
			instances: {
				type: 'number',
				optional: false, nullable: false,
			},
			driveUsageLocal: {
				type: 'number',
				optional: false, nullable: false,
			},
			driveUsageRemote: {
				type: 'number',
				optional: false, nullable: false,
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.instancesRepository)
		private instancesRepository: InstancesRepository,

		@Inject(DI.noteReactionsRepository)
		private noteReactionsRepository: NoteReactionsRepository,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,
	) {
		super(meta, paramDef, async () => {
			// endolphin: チャート機能は削除済み。チャート由来の集計を DB の直接カウントに置換（キャッシュ付き）。
			const [
				notesCount,
				originalNotesCount,
				usersCount,
				originalUsersCount,
				reactionsCount,
				instances,
			] = await Promise.all([
				this.notesRepository.count({ cache: 3600000 }), // 1 hour
				this.notesRepository.count({ where: { userHost: IsNull() }, cache: 3600000 }),
				this.usersRepository.count({ cache: 3600000 }),
				this.usersRepository.count({ where: { host: IsNull() }, cache: 3600000 }),
				this.noteReactionsRepository.count({ cache: 3600000 }),
				this.instancesRepository.count({ cache: 3600000 }),
			]);

			return {
				notesCount,
				originalNotesCount,
				usersCount,
				originalUsersCount,
				reactionsCount,
				instances,
				driveUsageLocal: 0,
				driveUsageRemote: 0,
			};
		});
	}
}
