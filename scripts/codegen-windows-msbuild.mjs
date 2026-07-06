#!/usr/bin/env node
/**
 * MSBuild codegen entrypoint for React Native Windows native modules.
 *
 * RNW's Codegen.targets runs with WorkingDirectory set to the nearest
 * package.json above each .vcxproj (often a dependency in node_modules).
 * Invoking `react-native/cli.js codegen-windows` from that directory makes
 * the community CLI treat the module as the project root, so RNW commands are
 * not registered and MSBuild fails with:
 *   unknown command 'codegen-windows'
 *
 * This script keeps MSBuild's working directory (module root for codegenConfig)
 * while calling RNW's codegen implementation directly from the app install.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const MODULE_ROOT = process.cwd();
const CODEGEN_CLI = path.join(
  APP_ROOT,
  'node_modules/@react-native-windows/cli/lib-commonjs/commands/codegenWindows/codegenWindows.js',
);

function die(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

if (!fs.existsSync(CODEGEN_CLI)) {
  die('react-native-windows CLI is not installed. Run: npm install --legacy-peer-deps');
}

const options = {
  logging: process.argv.includes('--logging'),
  check: process.argv.includes('--check'),
};

const { codegenWindowsInternal } = await import(pathToFileURL(CODEGEN_CLI).href);

try {
  await codegenWindowsInternal([], { root: MODULE_ROOT }, options);
} catch {
  process.exit(1);
}
