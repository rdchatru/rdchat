import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const appRoot = path.resolve(projectRoot, '../fluxer_app');
const extraArgs = process.argv.slice(2);

function run(command, args, options = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: projectRoot,
			stdio: 'inherit',
			env: process.env,
			...options,
		});

		child.once('error', reject);
		child.once('exit', (code, signal) => {
			if (signal) {
				reject(new Error(`${command} ${args.join(' ')} terminated by signal ${signal}`));
				return;
			}
			if (code && code !== 0) {
				reject(new Error(`${command} ${args.join(' ')} exited with status ${code}`));
				return;
			}
			resolve();
		});
	});
}

await run('pnpm', ['build'], {cwd: appRoot});
await run('pnpm', ['exec', 'tauri', 'android', 'build', ...extraArgs]);
