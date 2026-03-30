import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const androidProjectRoot = path.join(projectRoot, 'src-tauri', 'gen', 'android');
const appGradlePath = path.join(androidProjectRoot, 'app', 'build.gradle.kts');
const keystorePropertiesPath = path.join(androidProjectRoot, 'keystore.properties');

const keystoreFile = process.env.ANDROID_KEYSTORE_FILE;
const keyAlias = process.env.ANDROID_KEY_ALIAS;
const keyPassword = process.env.ANDROID_KEY_PASSWORD;
const storePassword = process.env.ANDROID_STORE_PASSWORD || keyPassword;

if (!keystoreFile || !keyAlias || !keyPassword || !storePassword) {
	throw new Error(
		'ANDROID_KEYSTORE_FILE, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD, and ANDROID_STORE_PASSWORD/ANDROID_KEY_PASSWORD must be set.',
	);
}

const keystoreFileName = path.basename(keystoreFile);

const keystoreProperties = [
	`storeFile=${keystoreFileName}`,
	`storePassword=${storePassword}`,
	`keyAlias=${keyAlias}`,
	`keyPassword=${keyPassword}`,
].join('\n');

await writeFile(keystorePropertiesPath, `${keystoreProperties}\n`, 'utf8');

let gradleScript = await readFile(appGradlePath, 'utf8');

const requiredImports = ['import java.io.FileInputStream', 'import java.util.Properties'];
for (const requiredImport of requiredImports) {
	if (!gradleScript.includes(requiredImport)) {
		gradleScript = `${requiredImport}\n${gradleScript}`;
	}
}

const keystoreLoaderSnippet = `val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties().apply {
	if (keystorePropertiesFile.exists()) {
		load(FileInputStream(keystorePropertiesFile))
	}
}

`;

if (!gradleScript.includes('val keystorePropertiesFile = rootProject.file("keystore.properties")')) {
	const androidIndex = gradleScript.indexOf('android {');
	if (androidIndex === -1) {
		throw new Error('Could not find android block in generated build.gradle.kts');
	}
	gradleScript = `${gradleScript.slice(0, androidIndex)}${keystoreLoaderSnippet}${gradleScript.slice(androidIndex)}`;
}

const signingConfigSnippet = `	signingConfigs {
		create("release") {
			if (keystorePropertiesFile.exists()) {
				storeFile = rootProject.file(keystoreProperties.getProperty("storeFile"))
				storePassword = keystoreProperties.getProperty("storePassword")
				keyAlias = keystoreProperties.getProperty("keyAlias")
				keyPassword = keystoreProperties.getProperty("keyPassword")
			}
		}
	}

`;

if (!gradleScript.includes('create("release")')) {
	gradleScript = gradleScript.replace('android {\n', `android {\n${signingConfigSnippet}`);
}

if (!gradleScript.includes('signingConfig = signingConfigs.getByName("release")')) {
	gradleScript = gradleScript.replace(
		/getByName\("release"\)\s*\{/,
		`getByName("release") {\n\t\t\tsigningConfig = signingConfigs.getByName("release")`,
	);
}

await writeFile(appGradlePath, gradleScript, 'utf8');
console.log('Configured Android release signing at', appGradlePath);
