/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'fs/promises';
import * as path from 'node:path';
import MagicString from 'magic-string';
import { collectModifications } from './locale-inliner/collect-modifications.js';
import { applyWithLocale } from './locale-inliner/apply-with-locale.js';
import { blankLogger } from './logger.js';
import { detectI18nFacadeChunk } from './locale-inliner/facade-chunk-detection.js';
import type { Logger } from './logger.js';
import type { Locale } from 'i18n';
import type { Manifest as ViteManifest } from 'vite';

export class LocaleInliner {
	outputDir: string;
	scriptsDir: string;
	i18nFile: string;
	i18nFileName: string;
	i18nSymbol: string;
	logger: Logger;
	chunks: ScriptChunk[];
	sharedFileNames?: Set<string>;

	static async create(options: {
		outputDir: string,
		scriptsDir: string,
		i18nFile: string,
		logger: Logger,
	}): Promise<LocaleInliner> {
		const manifest: ViteManifest = JSON.parse(await fs.readFile(`${options.outputDir}/manifest.json`, 'utf-8'));
		return new LocaleInliner({ ...options, manifest });
	}

	constructor(options: {
		outputDir: string,
		scriptsDir: string,
		i18nFile: string,
		manifest: ViteManifest,
		logger: Logger,
	}) {
		this.outputDir = options.outputDir;
		this.scriptsDir = options.scriptsDir;
		this.i18nFile = options.i18nFile;
		this.i18nFileName = this.stripScriptDir(options.manifest[this.i18nFile].file);
		this.logger = options.logger;
		this.i18nSymbol = 'i18n';
		this.chunks = Object.values(options.manifest).filter(chunk => this.isScriptFile(chunk.file)).map(chunk => ({
			fileName: this.stripScriptDir(chunk.file),
			src: chunk.src,
			chunkName: chunk.name,
			isEntry: chunk.isEntry === true,
		}));
	}

	async loadFiles() {
		await Promise.all(this.chunks.map(async chunk => {
			const filePath = path.join(this.outputDir, this.scriptsDir, chunk.fileName);
			chunk.sourceCode = await fs.readFile(filePath, 'utf-8');
		}));
	}

	collectsModifications() {
		this.#detectI18nFacadeChunk();

		for (const chunk of this.chunks) {
			if (chunk.sourceCode == null) {
				throw new Error(`Source code for ${chunk.fileName} is not loaded.`);
			}
			if (chunk.isFacadeOfI18n) {
				chunk.modifications = [];
				continue;
			}
			const fileLogger = this.logger.prefixed(`${chunk.fileName} (${chunk.chunkName}): `);
			chunk.modifications = collectModifications(chunk.sourceCode, chunk.fileName, fileLogger, this);
		}

		if (!this.chunks.flatMap(x => x.modifications ?? []).some(x => x.type === 'localized')) {
			throw new Error('No localizations are inlined! this should mean locale inliner is not working well!');
		}
	}

	#detectI18nFacadeChunk() {
		// For some reason, even with `preserveEntrySignatures: 'allow-extension'`, rolldown may generate facade chunk
		// This method detects facade chunk and replace i18nFile / i18nFileName with correct file name
		const chunk = this.chunks.find(x => x.fileName === this.i18nFileName);
		if (chunk == null) throw new Error(`i18n script file '${this.i18nFile}' not found`);
		if (chunk.sourceCode == null) throw new Error(`Source code for '${this.i18nFile}' not loaded`);
		const fileLogger = this.logger.prefixed(`${chunk.fileName} (${chunk.chunkName}): `);
		const facadeInfo = detectI18nFacadeChunk(chunk.sourceCode, chunk.fileName, fileLogger);
		if (facadeInfo != null) {
			const i18nSymbol = facadeInfo.nameMap[this.i18nSymbol];
			if (i18nSymbol == null) throw new Error(`Facade module for i18n file does not map ${this.i18nSymbol}. mapping: ${JSON.stringify(facadeInfo.nameMap)}`);
			this.logger.info(`We detected ${this.i18nFileName} is facade chunk maps ${facadeInfo.fileName} with ${i18nSymbol} as ${this.i18nSymbol}`);
			chunk.isFacadeOfI18n = true;
			this.i18nFileName = facadeInfo.fileName;
			this.i18nSymbol = i18nSymbol;
		}
	}

	/**
	 * Determine which chunks are locale-independent ("shared") and may be written once to `scripts/`
	 * instead of being copied into every `<locale>/` directory.
	 *
	 * A chunk is a *candidate* when it carries no locale-specific (translation) modification and is not the
	 * i18n facade. But a candidate is only *safe* to relocate when its entire transitive dependency closure
	 * is also made of candidates: a shared chunk physically lives only in `scripts/`, so any reference it
	 * makes (`./X.js` / `scripts/X.js`) resolves under `scripts/`. If it (transitively) reached a
	 * locale-specific chunk, that reference would resolve to the untranslated placeholder in `scripts/` and
	 * silently serve the wrong language. So we keep only the closure-safe subset.
	 */
	computeSharedSet() {
		const SPECIFIC_TYPES = new Set<TextModification['type']>(['localized', 'parameterized-function', 'locale-name', 'locale-json']);

		const fileNames = new Set(this.chunks.map(c => c.fileName));

		// candidate = no translation modification, and never an entry chunk or the i18n facade. Entry chunks
		// are always force-specific: the bootloader imports `/vite/<lang>/<entryHash>.js`, so they must exist
		// under every `<locale>/`. (They normally carry locale-json/locale-name mods anyway, but pin them
		// explicitly so a future entry chunk without locale-sensitive content can't be relocated by mistake.)
		const candidates = new Set<string>();
		for (const chunk of this.chunks) {
			if (chunk.modifications == null) throw new Error(`Modifications for ${chunk.fileName} are not collected.`);
			if (chunk.isFacadeOfI18n || chunk.isEntry) continue;
			const hasSpecific = chunk.modifications.some(m => m.localizedOnly && SPECIFIC_TYPES.has(m.type));
			if (!hasSpecific) candidates.add(chunk.fileName);
		}

		// Inter-chunk references derived from the already-collected modifications (no re-parse).
		const referencesOf = (chunk: ScriptChunk): string[] => {
			const refs = new Set<string>();
			for (const m of chunk.modifications ?? []) {
				if (m.type === 'relative-import-prefix') refs.add(m.targetFileName);
				else if (m.type === 'locale-name' && !m.literal && m.targetFileName != null) refs.add(m.targetFileName);
			}
			return [...refs].filter(r => fileNames.has(r));
		};
		const graph = new Map<string, string[]>(this.chunks.map(c => [c.fileName, referencesOf(c)]));

		// A candidate is unsafe if any chunk reachable through its references is not a candidate.
		const reachesSpecific = (start: string): boolean => {
			const seen = new Set([start]);
			const stack = [...(graph.get(start) ?? [])];
			let next: string | undefined;
			while ((next = stack.pop()) != null) {
				if (seen.has(next)) continue;
				seen.add(next);
				if (!candidates.has(next)) return true; // reached a locale-specific chunk
				for (const r of graph.get(next) ?? []) {
					if (!seen.has(r)) stack.push(r);
				}
			}
			return false;
		};

		const shared = new Set<string>();
		for (const fileName of candidates) {
			if (!reachesSpecific(fileName)) shared.add(fileName);
		}

		this.sharedFileNames = shared;
		this.logger.info(`Shared (locale-independent) chunks: ${shared.size} / candidate ${candidates.size} / total ${this.chunks.length}`);

		// Regression guard: a chunking change that wildly moves this count likely means the optimization
		// collapsed or that we are about to share something we should not. Force a human to re-confirm.
		if (shared.size < 1) {
			throw new Error('No shared chunks detected; locale deduplication is not working.');
		}
		if (shared.size < 80 || shared.size > 170) {
			throw new Error(`Shared chunk count ${shared.size} is outside the expected band [80, 170]; chunking may have changed. Re-verify locale deduplication.`);
		}
	}

	async saveAllLocales(locales: Record<string, Locale>) {
		if (this.sharedFileNames == null) {
			throw new Error('computeSharedSet() must be called before saveAllLocales().');
		}
		await this.saveShared();
		const localeNames = Object.keys(locales);
		for (const localeName of localeNames) {
			this.logger.info(`Creating bundle for ${localeName}`);
			await this.saveLocale(localeName, locales[localeName]);
		}
		this.logger.info('Done');
	}

	/**
	 * Write each shared chunk once into `scripts/`, applying only structural (non-translation) modifications.
	 * Overwrites the raw vite output in place — after dedup, `scripts/` is the canonical home of shared chunks
	 * and is the resolution target of suppressed mapDeps literals (`scripts/X.js`) and `../scripts/X.js`
	 * relative imports emitted in the locale directories.
	 */
	async saveShared() {
		const sharedFileNames = this.sharedFileNames;
		if (sharedFileNames == null) throw new Error('computeSharedSet() must be called before saveShared().');
		for (const chunk of this.chunks) {
			if (!sharedFileNames.has(chunk.fileName)) continue;
			if (chunk.sourceCode == null || !chunk.modifications) {
				throw new Error(`Source code or modifications for ${chunk.fileName} is not available.`);
			}
			const fileLogger = this.logger.prefixed(`${chunk.fileName} (${chunk.chunkName}): `);
			const magicString = new MagicString(chunk.sourceCode);
			applyWithLocale(magicString, chunk.modifications, 'scripts', {} as Locale, fileLogger, { mode: 'shared', sharedSet: sharedFileNames });
			await fs.writeFile(path.join(this.outputDir, this.scriptsDir, chunk.fileName), magicString.toString());
		}
	}

	async saveLocale(localeName: string, localeJson: Locale) {
		const sharedFileNames = this.sharedFileNames;
		if (sharedFileNames == null) throw new Error('computeSharedSet() must be called before saveLocale().');
		// create directory
		await fs.mkdir(path.join(this.outputDir, localeName), { recursive: true });
		const localeLogger = localeName === 'ja-JP' ? this.logger : blankLogger; // we want to log for single locale only
		for (const chunk of this.chunks) {
			if (sharedFileNames.has(chunk.fileName)) continue; // shared chunks live only in scripts/
			if (chunk.sourceCode == null || !chunk.modifications) {
				throw new Error(`Source code or modifications for ${chunk.fileName} is not available.`);
			}
			const fileLogger = localeLogger.prefixed(`${chunk.fileName} (${chunk.chunkName}): `);
			const magicString = new MagicString(chunk.sourceCode);
			applyWithLocale(magicString, chunk.modifications, localeName, localeJson, fileLogger, { mode: 'locale', sharedSet: sharedFileNames });

			await fs.writeFile(path.join(this.outputDir, localeName, chunk.fileName), magicString.toString());
		}
	}

	isScriptFile(fileName: string) {
		return fileName.startsWith(this.scriptsDir + '/') && fileName.endsWith('.js');
	}

	stripScriptDir(fileName: string) {
		if (!fileName.startsWith(this.scriptsDir + '/')) {
			throw new Error(`${fileName} does not start with ${this.scriptsDir}/`);
		}
		return fileName.slice(this.scriptsDir.length + 1);
	}
}

interface ScriptChunk {
	fileName: string;
	chunkName?: string;
	src?: string;
	isEntry?: boolean;
	sourceCode?: string;
	isFacadeOfI18n?: true;
	modifications?: TextModification[];
}

export type TextModification = {
	type: 'delete';
	begin: number;
	end: number;
	localizedOnly: boolean;
} | {
	// can be used later to insert '../scripts' for common files
	type: 'insert';
	begin: number;
	text: string;
	localizedOnly: boolean;
} | {
	type: 'replace';
	begin: number;
	end: number;
	text: string;
	localizedOnly: boolean;
} | {
	type: 'localized';
	begin: number;
	end: number;
	localizationKey: string[];
	localizedOnly: true;
} | {
	type: 'parameterized-function';
	begin: number;
	end: number;
	localizationKey: string[];
	localizedOnly: true;
} | {
	type: 'locale-name';
	begin: number;
	end: number;
	literal: boolean;
	localizedOnly: true;
	// For the `__vite__mapDeps` path literal form (literal: false), this records the basename of the
	// referenced chunk (e.g. "X.js" out of "scripts/X.js"). When that target is a shared (locale-independent)
	// chunk, the `scripts` -> `<locale>` rewrite is suppressed so the literal keeps pointing at `scripts/`.
	// Undefined for the `localStorage.getItem("lang")` form (literal: true).
	targetFileName?: string;
} | {
	type: 'locale-json';
	begin: number;
	end: number;
	localizedOnly: true;
} | {
	// Marks the `./` prefix of an inter-chunk relative import (static `from "./X.js"` or dynamic
	// `import(`./X.js`)`). When the containing chunk is written into a `<locale>/` directory and the target
	// is a shared chunk that lives only in `scripts/`, this prefix is rewritten to `../scripts/`.
	// Otherwise it is left untouched (`./` resolves within the same directory).
	type: 'relative-import-prefix';
	begin: number;
	end: number;
	targetFileName: string;
	localizedOnly: false;
};
