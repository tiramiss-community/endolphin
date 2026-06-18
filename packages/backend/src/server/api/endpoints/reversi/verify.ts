/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';

export const meta = {
	errors: {
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			desynced: { type: 'boolean' },
			game: {
				type: 'object',
				optional: true, nullable: true,
				ref: 'ReversiGameDetailed',
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		gameId: { type: 'string', format: 'misskey:id' },
		crc32: { type: 'string' },
	},
	required: ['gameId', 'crc32'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor() {
		// endolphin: Games 機能は削除済み。登録・型は互換のため維持し、常に desynced=false を返す。
		super(meta, paramDef, async () => {
			return {
				desynced: false,
			};
		});
	}
}
