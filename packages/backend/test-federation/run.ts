/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { spawn } from 'node:child_process';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

type Host = 'a.test' | 'b.test';

type RunnerEnv = Partial<Record<string, string>>;

type ComposeLogOptions = {
	logServices?: string;
	fullLogs: boolean;
	suppressServerLogs: boolean;
};

type NormalizedArgs = {
	setupOnly: boolean;
	testArgs: string[];
	composeLogOptions: ComposeLogOptions;
};

type CommandOptions = {
	cwd: string;
	env?: NodeJS.ProcessEnv;
	allowFailure?: boolean;
};

type FederationPaths = {
	repositoryRoot: string;
	backendDir: string;
	federationDir: string;
	configDir: string;
	certificatesDir: string;
	volumesDir: string;
};

type MisskeyConfig = {
	url: string;
	port: number;
	db: {
		host: string;
		port: number;
		db: string;
		user: string;
		pass: string;
	};
	dbReplications: false;
	trustProxy: true;
	redis: {
		host: string;
		port: number;
	};
	id: 'aidx';
	proxyBypassHosts: string[];
	allowedPrivateNetworks: string[];
};

class CommandFailure extends Error {
	constructor(
		command: string,
		args: string[],
		public readonly exitCode: number | null,
		public readonly signal: NodeJS.Signals | null,
	) {
		super(`${command} ${args.join(' ')} failed with ${signal ?? `exit code ${exitCode ?? 'unknown'}`}`);
	}
}

const hosts = ['a.test', 'b.test'] as const satisfies readonly Host[];
const rootCaPassphrase = 'rootCA';
const defaultInternalNetworkSubnet = '10.210.0.0/16';
const composeLogServicesWithoutMisskeyServers = [
	'tester',
	'daemon',
	'a.test',
	'b.test',
	'setup',
	'db.a.test',
	'db.b.test',
	'redis.test',
] as const;

const runnerFile = fileURLToPath(import.meta.url);
const defaultPaths = createFederationPaths(dirname(runnerFile));

// nginx の conf は `${HOST}` だけを差し替える単純なテンプレートにしている。
// sed や shell 展開に頼らないことで、Windows host でも同じ runner を使える。
export function renderHostTemplate(template: string, host: Host): string {
	return template.replaceAll('${HOST}', host);
}

// Misskey 本体の federation 用設定は JSON テンプレートではなく型付き object から生成する。
// 設定項目の追加・削除を TypeScript の型で追えるため、保守時に a.test/b.test の片方だけずれる事故を防げる。
export function createMisskeyConfig(host: Host, internalNetworkSubnet = defaultInternalNetworkSubnet): MisskeyConfig {
	return {
		url: `https://${host}/`,
		port: 3000,
		db: {
			host: `db.${host}`,
			port: 5432,
			db: 'misskey',
			user: 'postgres',
			pass: 'postgres',
		},
		dbReplications: false,
		trustProxy: true,
		redis: {
			host: 'redis.test',
			port: 6379,
		},
		id: 'aidx',
		proxyBypassHosts: [
			'api.deepl.com',
			'api-free.deepl.com',
			'www.recaptcha.net',
			'hcaptcha.com',
			'challenges.cloudflare.com',
		],
		allowedPrivateNetworks: [
			'127.0.0.1/32',
			internalNetworkSubnet,
		],
	};
}

// Docker Compose が起動する tester は、この host 側 runner ではなく内側 Vitest 専用 script を呼ぶ。
// ここを分けないと `test:fed` がコンテナ内で再帰して compose を起動しようとする。
export function buildTesterRunArgs(testArgs: string[]): string[] {
	return [
		'compose',
		'run',
		'--no-deps',
		'--rm',
		'tester',
		'pnpm',
		'-F',
		'backend',
		'test:fed:vitest',
		...(testArgs.length > 0 ? ['--', ...testArgs] : []),
	];
}

function parseComposeLogServices(value: string | undefined): string[] {
	if (value == null) {
		return [];
	}

	return value
		.split(',')
		.map(service => service.trim())
		.filter(service => service.length > 0);
}

// federation test の失敗時ログは Misskey 本体の verbose log が膨大で、tester の失敗理由を埋もれさせやすい。
// デフォルトは従来通り全サービスを出し、普段使いの package script からは CLI option で tester だけに絞る。
// env も残しているため、CI や一時的な調査では script を増やさず上書きできる。
export function buildComposeLogsArgs(env: RunnerEnv, options: ComposeLogOptions): string[] {
	if (options.fullLogs) {
		return ['compose', 'logs'];
	}

	const explicitServices = parseComposeLogServices(options.logServices ?? env.MISSKEY_TEST_FEDERATION_LOG_SERVICES);
	if (explicitServices.length > 0) {
		return ['compose', 'logs', ...explicitServices];
	}

	if (options.suppressServerLogs || env.MISSKEY_TEST_FEDERATION_SUPPRESS_SERVER_LOGS === '1') {
		return ['compose', 'logs', ...composeLogServicesWithoutMisskeyServers];
	}

	return ['compose', 'logs'];
}

// CI では matrix ごとに Node version file を切り替え、ローカルでは NODE_VERSION で直接上書きできる。
// compose.yml 側に分岐を書かず runner で解決することで、Docker image tag の決定箇所を 1 つに寄せている。
export function resolveNodeVersion(options: {
	env: RunnerEnv;
	readVersionFile: (path: string) => string;
}): string {
	if (options.env.NODE_VERSION != null && options.env.NODE_VERSION.trim() !== '') {
		return options.env.NODE_VERSION.trim();
	}

	const versionFile = options.env.MISSKEY_TEST_FEDERATION_NODE_VERSION_FILE ?? '.node-version';
	return options.readVersionFile(versionFile).trim();
}

// DB/Redis の bind volume はコンテナ内プロセスが root 所有のファイルを作ることがある。
// host の fs.rm で消せない権限エラーだけ Docker 経由 cleanup に切り替え、その他の IO エラーは握り潰さない。
export function shouldUseDockerVolumeCleanup(err: unknown): boolean {
	return err instanceof Error
		&& 'code' in err
		&& (err.code === 'EACCES' || err.code === 'EPERM');
}

function createFederationPaths(federationDir: string): FederationPaths {
	const backendDir = resolve(federationDir, '..');
	const repositoryRoot = resolve(backendDir, '../..');

	return {
		repositoryRoot,
		backendDir,
		federationDir,
		configDir: resolve(federationDir, '.config'),
		certificatesDir: resolve(federationDir, 'certificates'),
		volumesDir: resolve(federationDir, 'volumes'),
	};
}

// `pnpm --filter backend test:fed -- <vitest args>` の `--` を外して、runner オプションと Vitest 引数を分離する。
// setup-only は証明書/設定生成だけを行いたい旧 setup.sh 互換用の入口。
// ログ制御は env だけでなく CLI option にもしておく。package.json から普段使いの quiet/full を表現でき、host OS の env 構文差も避けられる。
export function normalizeArgs(args: string[]): NormalizedArgs {
	const separatorIndex = args.indexOf('--');
	const runnerArgs = separatorIndex === -1 ? args : args.slice(0, separatorIndex);
	const testArgs = separatorIndex === -1 ? [] : args.slice(separatorIndex + 1);
	let setupOnly = false;
	const composeLogOptions: ComposeLogOptions = {
		fullLogs: false,
		suppressServerLogs: false,
	};

	for (let index = 0; index < runnerArgs.length; index++) {
		const arg = runnerArgs[index];

		if (arg === '--setup-only') {
			setupOnly = true;
			continue;
		}

		if (arg === '--full-logs') {
			composeLogOptions.fullLogs = true;
			continue;
		}

		if (arg === '--suppress-server-logs') {
			composeLogOptions.suppressServerLogs = true;
			continue;
		}

		if (arg.startsWith('--log-services=')) {
			composeLogOptions.logServices = arg.slice('--log-services='.length);
			continue;
		}

		if (arg === '--log-services') {
			const logServices = runnerArgs[index + 1];
			if (logServices == null) {
				throw new Error('--log-services requires a comma-separated service list');
			}

			composeLogOptions.logServices = logServices;
			index++;
			continue;
		}

		testArgs.push(arg);
	}

	return {
		setupOnly,
		testArgs,
		composeLogOptions,
	};
}

function commandName(command: 'pnpm' | 'docker' | 'openssl'): string {
	if (process.platform === 'win32' && command === 'pnpm') {
		return 'pnpm.cmd';
	}

	return command;
}

// 外側 runner は host 上で動くため、shell 構文・`&&`・`;`・`rm -rf` に依存しない。
// argv 配列で spawn することで、パスや引数の quoting 差分を Node に任せられる。
async function runCommand(command: 'pnpm' | 'docker' | 'openssl', args: string[], options: CommandOptions): Promise<void> {
	const env = options.env ?? process.env;

	await new Promise<void>((resolvePromise, reject) => {
		const child = spawn(commandName(command), args, {
			cwd: options.cwd,
			env,
			stdio: 'inherit',
			shell: false,
		});

		child.on('error', reject);
		child.on('exit', (code, signal) => {
			if (code === 0 || options.allowFailure === true) {
				resolvePromise();
				return;
			}

			reject(new CommandFailure(command, args, code, signal));
		});
	});
}

// docker.env は compose の env_file として必須なので、compose down の前にも生成しておく。
// 毎回 example から上書きすることで、古い生成物が残っても runner の結果を再現しやすくしている。
async function ensureDockerEnv(paths: FederationPaths): Promise<void> {
	await mkdir(paths.configDir, { recursive: true });

	const source = resolve(paths.configDir, 'example.docker.env');
	const destination = resolve(paths.configDir, 'docker.env');
	await writeFile(destination, await readFile(source, 'utf8'), 'utf8');
}

// a.test/b.test の nginx と Misskey 設定を同じ入力から生成する。
// allowedPrivateNetworks は compose の internal subnet と合わせる必要があるため、環境変数で subnet を変えた場合も追従させる。
async function writeHostConfigs(paths: FederationPaths): Promise<void> {
	await mkdir(paths.configDir, { recursive: true });

	const nginxTemplate = await readFile(resolve(paths.configDir, 'example.conf'), 'utf8');
	const internalNetworkSubnet = process.env.MISSKEY_TEST_FEDERATION_INTERNAL_SUBNET ?? defaultInternalNetworkSubnet;
	await Promise.all(hosts.map(async host => {
		await writeFile(resolve(paths.configDir, `${host}.conf`), renderHostTemplate(nginxTemplate, host), 'utf8');
		await writeFile(
			resolve(paths.configDir, `${host}.config.json`),
			`${JSON.stringify(createMisskeyConfig(host, internalNetworkSubnet), null, 2)}\n`,
			'utf8',
		);
	}));
}

// federation test は HTTPS 前提のため、ローカル CA と各 host の証明書を runner が用意する。
// 既存証明書があれば再利用し、setup-only を 2 回連続で実行しても壊れないようにしている。
async function ensureCertificates(paths: FederationPaths): Promise<void> {
	await mkdir(paths.certificatesDir, { recursive: true });

	const rootKeyPath = resolve(paths.certificatesDir, 'rootCA.key');
	const rootCertificatePath = resolve(paths.certificatesDir, 'rootCA.crt');
	if (!existsSync(rootKeyPath) || !existsSync(rootCertificatePath)) {
		await runCommand('openssl', [
			'genrsa',
			'-des3',
			'-passout',
			`pass:${rootCaPassphrase}`,
			'-out',
			rootKeyPath,
			'4096',
		], { cwd: paths.federationDir });
		await runCommand('openssl', [
			'req',
			'-x509',
			'-new',
			'-nodes',
			'-batch',
			'-key',
			rootKeyPath,
			'-sha256',
			'-days',
			'1024',
			'-passin',
			`pass:${rootCaPassphrase}`,
			'-out',
			rootCertificatePath,
		], { cwd: paths.federationDir });
	}

	await Promise.all(hosts.map(async host => {
		const keyPath = resolve(paths.certificatesDir, `${host}.key`);
		const certificatePath = resolve(paths.certificatesDir, `${host}.crt`);
		if (existsSync(keyPath) && existsSync(certificatePath)) {
			return;
		}

		const csrPath = resolve(paths.certificatesDir, `${host}.csr`);
		await runCommand('openssl', [
			'req',
			'-new',
			'-newkey',
			'rsa:2048',
			'-sha256',
			'-nodes',
			'-keyout',
			keyPath,
			'-subj',
			`/CN=${host}/emailAddress=admin@${host}/C=JP/ST=/L=/O=Misskey Tester/OU=Some Unit`,
			'-out',
			csrPath,
		], { cwd: paths.federationDir });
		await runCommand('openssl', [
			'x509',
			'-req',
			'-sha256',
			'-in',
			csrPath,
			'-CA',
			rootCertificatePath,
			'-CAkey',
			rootKeyPath,
			'-CAcreateserial',
			'-passin',
			`pass:${rootCaPassphrase}`,
			'-out',
			certificatePath,
			'-days',
			'500',
		], { cwd: paths.federationDir });
	}));

	// nginx コンテナや CI の後続処理が key を読めるようにする。失敗しても証明書生成自体は成功扱いにする。
	await Promise.all(hosts.map(async host => {
		await chmod(resolve(paths.certificatesDir, `${host}.key`), 0o644).catch(() => undefined);
	}));
}

// setup は compose lifecycle から独立させる。これにより旧 setup.sh 互換と通常 test 実行で同じ生成処理を共有できる。
async function setupFederation(paths: FederationPaths): Promise<void> {
	await ensureDockerEnv(paths);
	await writeHostConfigs(paths);
	await ensureCertificates(paths);
}

// stale な DB/Redis を残すと federation test の結果が前回実行に引きずられる。
// 先に host の fs.rm を試し、root-owned file で失敗したときだけ Docker image 内の Node で同じ削除を実行する。
async function cleanupPersistentVolumes(paths: FederationPaths, nodeVersion: string): Promise<void> {
	try {
		await rm(paths.volumesDir, { recursive: true, force: true });
	} catch (err) {
		if (!shouldUseDockerVolumeCleanup(err)) {
			throw err;
		}

		await runCommand('docker', [
			'run',
			'--rm',
			'--mount',
			`type=bind,source=${paths.federationDir},target=/work`,
			`node:${nodeVersion}`,
			'node',
			'--input-type=module',
			'-e',
			"import { rm } from 'node:fs/promises'; await rm('/work/volumes', { recursive: true, force: true });",
		], { cwd: paths.federationDir });
		await rm(paths.volumesDir, { recursive: true, force: true });
	}
}

// compose の network subnet はローカル Docker 環境と衝突しやすい。
// デフォルトは 10.210-213 系に寄せつつ、衝突した環境では env だけで上書きできるようにしている。
function createComposeEnv(nodeVersion: string): NodeJS.ProcessEnv {
	return {
		...process.env,
		NODE_VERSION: nodeVersion,
		MISSKEY_TEST_FEDERATION_EXTERNAL_SUBNET: process.env.MISSKEY_TEST_FEDERATION_EXTERNAL_SUBNET ?? '10.213.0.0/16',
		MISSKEY_TEST_FEDERATION_EXTERNAL_IP_RANGE: process.env.MISSKEY_TEST_FEDERATION_EXTERNAL_IP_RANGE ?? '10.213.0.0/24',
		MISSKEY_TEST_FEDERATION_INTERNAL_SUBNET: process.env.MISSKEY_TEST_FEDERATION_INTERNAL_SUBNET ?? defaultInternalNetworkSubnet,
		MISSKEY_TEST_FEDERATION_INTERNAL_IP_RANGE: process.env.MISSKEY_TEST_FEDERATION_INTERNAL_IP_RANGE ?? '10.210.0.0/24',
		MISSKEY_TEST_FEDERATION_TESTER_IP: process.env.MISSKEY_TEST_FEDERATION_TESTER_IP ?? '10.210.1.1',
		MISSKEY_TEST_FEDERATION_INTERNAL_A_SUBNET: process.env.MISSKEY_TEST_FEDERATION_INTERNAL_A_SUBNET ?? '10.211.0.0/16',
		MISSKEY_TEST_FEDERATION_INTERNAL_A_IP_RANGE: process.env.MISSKEY_TEST_FEDERATION_INTERNAL_A_IP_RANGE ?? '10.211.0.0/24',
		MISSKEY_TEST_FEDERATION_INTERNAL_B_SUBNET: process.env.MISSKEY_TEST_FEDERATION_INTERNAL_B_SUBNET ?? '10.212.0.0/16',
		MISSKEY_TEST_FEDERATION_INTERNAL_B_IP_RANGE: process.env.MISSKEY_TEST_FEDERATION_INTERNAL_B_IP_RANGE ?? '10.212.0.0/24',
	};
}

// 起動前後に stale service を必ず落とす。失敗しても本命の setup/test を続けられるよう down は allowFailure にする。
async function dockerComposeDown(paths: FederationPaths, env: NodeJS.ProcessEnv): Promise<void> {
	await runCommand('docker', ['compose', 'down', '--remove-orphans'], {
		cwd: paths.federationDir,
		env,
		allowFailure: true,
	});
}

// compose logs は失敗時だけ出す。成功時に常時出すと CI log が膨らみ、失敗箇所が埋もれる。
// 失敗調査では tester の出力を優先したいことがあるため、buildComposeLogsArgs() 経由でログ対象を絞れる。
async function dockerComposeLogs(paths: FederationPaths, env: NodeJS.ProcessEnv, options: ComposeLogOptions): Promise<void> {
	const args = buildComposeLogsArgs(env, options);
	if (args.length > 2) {
		console.error(`[test-federation] Printing compose logs for services: ${args.slice(2).join(', ')}`);
	} else {
		console.error('[test-federation] Printing compose logs for all services.');
	}

	await runCommand('docker', args, {
		cwd: paths.federationDir,
		env,
		allowFailure: true,
	});
}

// tester 以外のサービスを先に healthcheck まで起動し、最後に disposable な tester コンテナだけ run する。
// `--rm` により tester 自身は残さず、DB/Redis の永続化は runner の cleanup で明示的に管理する。
async function runFederationTests(paths: FederationPaths, testArgs: string[], env: NodeJS.ProcessEnv): Promise<void> {
	await runCommand('docker', ['compose', 'up', '-d', '--scale', 'tester=0'], {
		cwd: paths.federationDir,
		env,
	});
	await runCommand('docker', buildTesterRunArgs(testArgs), {
		cwd: paths.federationDir,
		env,
	});
}

// host 側 runner の全体順序:
// 1. compose が読める最低限の生成物を用意する
// 2. stale compose と永続 volume を片付ける
// 3. 必要なら repository 全体を build する
// 4. 証明書/設定を再生成して tester を走らせる
// 5. 成否に関わらず compose down と volume cleanup を行う
async function main(args: string[], paths = defaultPaths): Promise<void> {
	const { setupOnly, testArgs, composeLogOptions } = normalizeArgs(args);
	const nodeVersion = resolveNodeVersion({
		env: process.env,
		readVersionFile: path => readFileSync(resolve(paths.repositoryRoot, path), 'utf8'),
	});
	const composeEnv = createComposeEnv(nodeVersion);

	await setupFederation(paths);

	if (setupOnly) {
		// 旧 setup.sh 互換の入口。compose は触らず、生成物の確認や手動デバッグに使える。
		return;
	}

	await dockerComposeDown(paths, composeEnv);
	await cleanupPersistentVolumes(paths, nodeVersion);

	try {
		if (process.env.MISSKEY_TEST_FEDERATION_SKIP_BUILD !== '1') {
			// tester コンテナは built/ を bind mount して使うため、通常実行では host 側で先に build する。
			// 再実行時は MISSKEY_TEST_FEDERATION_SKIP_BUILD=1 で省略できる。
			await runCommand('pnpm', ['build'], { cwd: paths.repositoryRoot });
		}

		// cleanup 後にもう一度生成する。volume 削除や手動編集の影響を受けず、compose 起動直前の状態を揃えるため。
		await setupFederation(paths);
		await runFederationTests(paths, testArgs, composeEnv);
	} catch (err) {
		if (err instanceof CommandFailure && (err.exitCode === 130 || err.signal === 'SIGINT')) {
			throw err;
		}

		await dockerComposeLogs(paths, composeEnv, composeLogOptions);
		throw err;
	} finally {
		await dockerComposeDown(paths, composeEnv);
		await cleanupPersistentVolumes(paths, nodeVersion);
	}
}

if (process.argv[1] != null && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
	await main(process.argv.slice(2)).catch(err => {
		if (err instanceof CommandFailure && (err.exitCode === 130 || err.signal === 'SIGINT')) {
			console.error(`Federation test was interrupted: ${err.message}`);
			process.exitCode = 130;
			return;
		}

		console.error(err);
		process.exitCode = 1;
	});
}
