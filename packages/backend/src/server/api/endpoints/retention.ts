/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';

export const meta = {
	tags: ['users'],

	requireCredential: false,

	res: {
		type: 'array',
		items: {
			type: 'object',
			properties: {
				createdAt: {
					type: 'string',
					format: 'date-time',
				},
				users: {
					type: 'number',
				},
				data: {
					type: 'object',
					additionalProperties: {
						anyOf: [{
							type: 'number',
						}],
					},
				},
			},
			required: [
				'createdAt',
				'users',
				'data',
			],
		},
	},

	allowGet: true,
	cacheSec: 60 * 60,
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor() {
		// endolphin: リテンション分析は削除済み。登録・型は互換のため維持し、空配列を返す。
		super(meta, paramDef, async () => {
			return [];
		});
	}
}
