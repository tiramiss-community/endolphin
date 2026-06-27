import * as fs from 'fs/promises';
import url from 'node:url';
import path from 'node:path';
import * as os from 'node:os';
import * as zlib from 'node:zlib';
import { promisify } from 'node:util';
import { execa } from 'execa';
import locales from 'i18n';
import { LocaleInliner } from '../frontend-builder/locale-inliner.js'
import { createLogger } from '../frontend-builder/logger';

// requires node 21 or later
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const outputDir = __dirname + '/../../built/_frontend_vite_';

/**
 * @return {Promise<void>}
 */
async function viteBuild() {
	await execa('vite', ['build'], {
		cwd: __dirname,
		stdout: process.stdout,
		stderr: process.stderr,
	});
}


async function buildAllLocale() {
	const logger = createLogger()
	const inliner = await LocaleInliner.create({
		outputDir,
		logger,
		scriptsDir: 'scripts',
		i18nFile: 'src/i18n.ts',
	})

	await inliner.loadFiles();

	inliner.collectsModifications();

	inliner.computeSharedSet();

	await inliner.saveAllLocales(locales);

	if (logger.errorCount > 0) {
		throw new Error(`Build failed with ${logger.errorCount} errors and ${logger.warningCount} warnings.`);
	}
}

// Raw `.js` files under the vite output that must be kept uncompressed (NOT replaced by `.js.br`):
// - `loader/boot.js` is inlined into the HTML by the backend, never served as a static `.js`.
// - `mockServiceWorker.js` is MSW's worker script (test-only, copied verbatim from `public/`); Service
//   Worker registration has historically inconsistent `Accept-Encoding` handling, so leave it untouched.
const COMPRESS_EXCLUDE = new Set([
	path.join('loader', 'boot.js'),
	'mockServiceWorker.js',
]);

/**
 * Whether to keep the raw `.js` alongside the generated `.js.br`.
 *
 * Default (false) deletes the raw `.js` to shrink the bundle (the primary goal of issue #18): every client
 * that runs the app supports Brotli (build target safari18.2 / chrome130 / firefox132, and ESM dynamic
 * import is required to boot at all), and JS chunks are only ever fetched by the browser with
 * `Accept-Encoding: br`. Set `FRONTEND_KEEP_RAW_JS=true` to keep the raw `.js` as a fallback for clients
 * that do not advertise Brotli support (e.g. when serving without HTTPS or to non-browser clients);
 * `@fastify/static`'s `preCompressed` then falls back to the raw `.js` instead of returning 404.
 */
const keepRawJs = process.env.FRONTEND_KEEP_RAW_JS === 'true';

/**
 * Pre-compress JS chunks with Brotli into `<file>.js.br`, which the backend (`@fastify/static`
 * `preCompressed: true`) serves with `Content-Encoding: br`. By default the raw `.js` is then deleted
 * (see {@link keepRawJs}). Files in {@link COMPRESS_EXCLUDE} always keep their raw `.js`.
 */
async function compressArtifacts() {
	const logger = createLogger();
	const entries = await fs.readdir(outputDir, { recursive: true, withFileTypes: true });
	const targets = entries
		.filter(e => e.isFile() && e.name.endsWith('.js'))
		.map(e => path.join(e.parentPath, e.name))
		.filter(p => !COMPRESS_EXCLUDE.has(path.relative(outputDir, p)));

	logger.info(`Brotli-compressing ${targets.length} JS chunk(s)${keepRawJs ? ' (keeping raw .js)' : ''}...`);

	// Async brotli offloads to libuv's thread pool, so bounded concurrency genuinely parallelizes the
	// expensive (quality 11) pass instead of just interleaving on the main thread.
	const brotliCompress = promisify(zlib.brotliCompress);
	const compressOne = async (file: string) => {
		const source = await fs.readFile(file);
		if (source.length === 0) return false;
		const br = await brotliCompress(source, {
			params: {
				[zlib.constants.BROTLI_PARAM_QUALITY]: 11,
				[zlib.constants.BROTLI_PARAM_SIZE_HINT]: source.length,
			},
		});
		await fs.writeFile(`${file}.br`, br);
		// Drop the raw `.js` unless asked to keep it as a fallback; only the `.js.br` is served otherwise.
		if (!keepRawJs) await fs.rm(file);
		return true;
	};

	// Compress with bounded concurrency so the long pass uses the available cores without spawning thousands
	// of simultaneous tasks, and report progress periodically so the build does not look stalled while the
	// ~9k chunks are processed.
	const concurrency = Math.max(1, os.availableParallelism());
	let processed = 0;
	let compressed = 0;
	let nextProgressAt = 0;
	const reportEvery = Math.max(1, Math.ceil(targets.length / 10)); // ~10 progress lines
	const worker = async (queue: string[]) => {
		for (const file of queue) {
			if (await compressOne(file)) compressed++;
			processed++;
			if (processed >= nextProgressAt) {
				logger.info(`Brotli progress: ${processed} / ${targets.length}`);
				nextProgressAt += reportEvery;
			}
		}
	};
	const workers = Array.from({ length: Math.min(concurrency, targets.length) }, (_, i) =>
		worker(targets.filter((_, idx) => idx % concurrency === i)));
	await Promise.all(workers);

	logger.info(`Brotli-compressed ${compressed} JS chunk(s).`);
}

async function build() {
	await fs.rm(outputDir, { recursive: true, force: true });
	await viteBuild();
	await buildAllLocale();
	await compressArtifacts();
}

await build();
