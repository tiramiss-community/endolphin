/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';

export const meta = {
	requireCredential: true,
	requireAdmin: true,
	kind: 'read:admin:index-stats',

	tags: ['admin'],
	res: {
		type: 'array',
		items: {
			type: 'object',
			properties: {
				tablename: { type: 'string' },
				indexname: { type: 'string' },
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
	constructor() {
		// endolphin: 管理 DB 統計は削除済み。登録・型は互換のため維持し、空配列を返す。
		super(meta, paramDef, async () => {
			return [];
		});
	}
}
