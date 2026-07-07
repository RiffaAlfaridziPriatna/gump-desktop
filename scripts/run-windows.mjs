#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import url from 'node:url';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const REACT_NATIVE_CLI = path.join(ROOT_DIR, 'node_modules/react-native/cli.js');

function die(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function checkMetroRunning(host, port) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host, port });
    const finish = ok => {
      socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(1500);
    socket.on('connect', () => finish(true));
    socket.on('timeout', () => finish(false));
    socket.on('error', () => finish(false));
  });
}

async function ensureMetroRunning() {
  const host = process.env.REACT_NATIVE_PACKAGER_HOSTNAME?.trim() || '127.0.0.1';
  const port = Number(process.env.RCT_METRO_PORT ?? 8081);

  const running = await checkMetroRunning(host, port);
  if (running) {
    console.log(`✓ Metro detected at ${host}:${port}`);
    return;
  }

  console.error('');
  console.error('✗ Metro dev server is not running.');
  console.error('');
  console.error('Debug builds load JS from Metro. Without it the app can crash silently.');
  console.error('');
  console.error('Run these in TWO terminals inside the Windows VM:');
  console.error('  Terminal 1:  npm start');
  console.error('  Terminal 2:  npm run windows -- --reset-cache');
  console.error('');
  console.error(
    'If Metro runs on your Mac host (not inside Parallels), set the host IP first:',
  );
  console.error('  set REACT_NATIVE_PACKAGER_HOSTNAME=<mac-ip-visible-from-vm>');
  console.error('');
  die(`No Metro server at ${host}:${port}`);
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

await ensureMetroRunning();

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
