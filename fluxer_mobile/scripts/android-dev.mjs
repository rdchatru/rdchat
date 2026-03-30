import {spawn} from 'node:child_process';
import {mkdir, writeFile} from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const appRoot = path.resolve(projectRoot, '../fluxer_app');
const configPath = path.join(projectRoot, 'src-tauri', 'tauri.dev.conf.json');
const devPort = Number(process.env.FLUXER_APP_DEV_PORT) || 49427;
const devUrl = process.env.FLUXER_MOBILE_DEV_URL || `http://10.0.2.2:${devPort}`;
const appDevHost = process.env.FLUXER_APP_DEV_HOST || '0.0.0.0';

let shuttingDown = false;
let appServer = null;
let tauriProcess = null;

function stopChild(child) {
	if (!child || child.killed) {
		return;
	}
	child.kill('SIGTERM');
}

function shutdown(code = 0) {
	if (shuttingDown) {
		return;
	}
	shuttingDown = true;
	stopChild(tauriProcess);
	stopChild(appServer);
	setTimeout(() => process.exit(code), 50);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function writeDevConfig() {
	const baseConfig = {
		$schema: './gen/schemas/mobile-schema.json',
		productName: 'RdChat Mobile',
		version: '0.0.0',
		identifier: 'android.rdchat.ru',
		build: {
			devUrl,
			frontendDist: '../../fluxer_app/dist',
		},
		app: {
			withGlobalTauri: true,
			windows: [
				{
					label: 'main',
					title: 'RdChat',
					fullscreen: false,
					resizable: true,
					initialization_script:
						"window.__FLUXER_NATIVE_PLATFORM__ = navigator.userAgent.includes('Android') ? 'tauri-android' : 'tauri-ios';",
				},
			],
			security: {
				csp: null,
			},
		},
		bundle: {
			active: true,
			android: {
				minSdkVersion: 24,
			},
			icon: [
				'../../fluxer_desktop/build_resources/icons-stable/32x32.png',
				'../../fluxer_desktop/build_resources/icons-stable/128x128.png',
				'../../fluxer_desktop/build_resources/icons-stable/512x512.png',
				'../../fluxer_desktop/build_resources/icons-stable/icon.png',
			],
		},
	};

	await mkdir(path.dirname(configPath), {recursive: true});
	await writeFile(configPath, `${JSON.stringify(baseConfig, null, 2)}\n`, 'utf8');
}

function waitForPort(host, port, timeoutMs = 120000) {
	const startedAt = Date.now();

	return new Promise((resolve, reject) => {
		const attempt = () => {
			if (shuttingDown) {
				resolve();
				return;
			}

			const socket = net.createConnection({host, port});

			socket.once('connect', () => {
				socket.end();
				resolve();
			});

			socket.once('error', () => {
				socket.destroy();
				if (Date.now() - startedAt >= timeoutMs) {
					reject(new Error(`Timed out waiting for fluxer_app dev server at ${host}:${port}`));
					return;
				}
				setTimeout(attempt, 500);
			});
		};

		attempt();
	});
}

async function main() {
	await writeDevConfig();

	appServer = spawn('pnpm', ['dev'], {
		cwd: appRoot,
		stdio: 'inherit',
		env: {
			...process.env,
			FLUXER_APP_DEV_HOST: appDevHost,
			FLUXER_APP_DEV_PORT: String(devPort),
		},
	});

	appServer.once('error', (error) => {
		console.error(error);
		shutdown(1);
	});

	appServer.once('exit', (code, signal) => {
		if (shuttingDown) {
			return;
		}
		if (signal) {
			console.error(`fluxer_app dev server terminated by signal ${signal}`);
		} else if (code && code !== 0) {
			console.error(`fluxer_app dev server exited with status ${code}`);
		}
		shutdown(code ?? 1);
	});

	await waitForPort('127.0.0.1', devPort);

	tauriProcess = spawn('pnpm', ['exec', 'tauri', 'android', 'dev', '--config', 'src-tauri/tauri.dev.conf.json'], {
		cwd: projectRoot,
		stdio: 'inherit',
		env: process.env,
	});

	tauriProcess.once('error', (error) => {
		console.error(error);
		shutdown(1);
	});

	tauriProcess.once('exit', (code, signal) => {
		if (shuttingDown) {
			return;
		}
		if (signal) {
			console.error(`tauri android dev terminated by signal ${signal}`);
		}
		shutdown(code ?? 0);
	});
}

await main();
