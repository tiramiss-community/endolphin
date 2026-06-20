/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';

export const meta = {
	requireCredential: true,
	requireAdmin: true,
	kind: 'read:admin:table-stats',

	tags: ['admin'],

	res: {
		type: 'object',
		optional: false, nullable: false,
		additionalProperties: {
			type: 'object',
			properties: {
				count: {
					type: 'number',
				},
				size: {
					type: 'number',
				},
			},
			required: ['count', 'size'],
		},
		example: {
			migrations: {
				count: 66,
				size: 32768,
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
		// endolphin: 管理 DB 統計は削除済み。登録・型は互換のため維持し、空オブジェクトを返す。
		super(meta, paramDef, async () => {
			return {};
		});
	}
}
