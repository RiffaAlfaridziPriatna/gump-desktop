#!/usr/bin/env node
/**
 * Cross-platform env loader (Node equivalent of run-with-env.sh).
 * Usage: node scripts/run-with-env.mjs <prod|local|staging> <command...>
 * Optional: GUMP_PLATFORM=macos|windows
 */
import {spawn} from 'node:child_process';

import {applyGumpBuildIdentity, ROOT_DIR} from './gump-env.mjs';

function die(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const envName = args[0];

if (!envName || envName === '-h' || envName === '--help') {
  console.log(`Load Gump env vars then run a command.

Usage:
  node scripts/run-with-env.mjs <prod|local|staging> <command...>

Optional env:
  GUMP_PLATFORM=macos|windows   (default: windows on win32, else macos)

Examples:
  node scripts/run-with-env.mjs local node node_modules/react-native/cli.js start
  node scripts/run-with-env.mjs local npx react-native run-macos`);
  process.exit(0);
}

const command = args.slice(1);
if (command.length === 0) {
  die('Missing command after env name');
}

const platform =
  process.env.GUMP_PLATFORM ??
  (process.platform === 'win32' ? 'windows' : 'macos');

try {
  applyGumpBuildIdentity({platform, envName});
} catch (error) {
  die(error instanceof Error ? error.message : String(error));
}

const [bin, ...binArgs] = command;
const child = spawn(bin, binArgs, {
  cwd: ROOT_DIR,
  env: process.env,
  stdio: 'inherit',
  // Windows needs a shell for .cmd shims (npx, npm); Unix can exec directly.
  shell: process.platform === 'win32',
  windowsHide: true,
});

child.on('error', error => {
  die(error.message);
});

child.on('exit', code => {
  process.exit(code ?? 1);
});
