#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const REACT_NATIVE_CLI = path.join(ROOT_DIR, 'node_modules/react-native/cli.js');

function die(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function resolveWindowsArch() {
  const override = process.env.WINDOWS_ARCH?.trim();
  if (override) {
    const normalized = override.toLowerCase();
    if (normalized === 'arm64') {
      return 'ARM64';
    }
    if (normalized === 'x86' || normalized === 'win32') {
      return 'x86';
    }
    if (normalized === 'x64' || normalized === 'amd64') {
      return 'x64';
    }
    die(`Unknown WINDOWS_ARCH value: ${override}. Use: x64 | x86 | ARM64`);
  }

  const osArch = (
    process.env.PROCESSOR_ARCHITEW6432 ??
    process.env.PROCESSOR_ARCHITECTURE ??
    ''
  ).toUpperCase();

  if (osArch === 'ARM64') {
    return 'ARM64';
  }
  if (osArch === 'X86') {
    return 'x86';
  }
  if (osArch === 'AMD64' || osArch === 'X64') {
    return 'x64';
  }

  switch (process.arch) {
    case 'arm64':
      return 'ARM64';
    case 'ia32':
      return 'x86';
    default:
      return 'x64';
  }
}

function getWasdkPlatform(arch) {
  switch (arch) {
    case 'x86':
      return 'x86';
    case 'ARM64':
      return 'arm64';
    default:
      return 'x64';
  }
}

if (process.platform !== 'win32') {
  die('Windows dev builds must run on Windows.');
}

if (!fs.existsSync(REACT_NATIVE_CLI)) {
  die('react-native CLI is not installed. Run: npm install --legacy-peer-deps');
}

const windowsArch = resolveWindowsArch();
const wasdkPlatform = getWasdkPlatform(windowsArch);
const userArgs = process.argv.slice(2);

const result = spawnSync(
  process.execPath,
  [
    REACT_NATIVE_CLI,
    'run-windows',
    '--arch',
    windowsArch,
    '--msbuildprops',
    `_WindowsAppSDKFoundationPlatform=${wasdkPlatform},UseExperimentalNuget=true`,
    ...userArgs,
  ],
  {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    shell: false,
  },
);

if (result.error) {
  die(result.error.message);
}

process.exit(result.status ?? 0);
