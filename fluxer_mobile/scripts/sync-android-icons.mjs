import {access, cp} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const androidIconRoot = path.join(projectRoot, 'src-tauri', 'icons', 'android');
const generatedResRoot = path.join(projectRoot, 'src-tauri', 'gen', 'android', 'app', 'src', 'main', 'res');

const androidIconDirs = [
	'mipmap-anydpi-v26',
	'mipmap-hdpi',
	'mipmap-mdpi',
	'mipmap-xhdpi',
	'mipmap-xxhdpi',
	'mipmap-xxxhdpi',
	'values',
];

async function pathExists(targetPath) {
	try {
		await access(targetPath);
		return true;
	} catch {
		return false;
	}
}

if (!(await pathExists(androidIconRoot))) {
	throw new Error(`Missing Android icon source directory: ${androidIconRoot}`);
}

if (!(await pathExists(generatedResRoot))) {
	throw new Error(`Missing generated Android resources directory: ${generatedResRoot}`);
}

for (const dirName of androidIconDirs) {
	const sourceDir = path.join(androidIconRoot, dirName);
	if (!(await pathExists(sourceDir))) {
		continue;
	}

	const targetDir = path.join(generatedResRoot, dirName);
	await cp(sourceDir, targetDir, {
		force: true,
		recursive: true,
	});
}

console.log('Synced branded Android launcher icons into generated project resources.');
