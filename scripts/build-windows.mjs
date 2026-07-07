#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const WINDOWS_MSIX_DIR = path.join(ROOT_DIR, 'windows/AppPackages');
const REACT_NATIVE_CLI = path.join(ROOT_DIR, 'node_modules/react-native/cli.js');
const REACT_NATIVE_WINDOWS_DIR = path.join(
  ROOT_DIR,
  'node_modules/react-native-windows',
);

const variant = process.argv[2] ?? 'exe';

function log(message) {
  console.log(`\n▸ ${message}`);
}

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

  // Prefer the OS CPU arch. On ARM PCs, x64 Node reports process.arch=x64 but
  // PROCESSOR_ARCHITEW6432=ARM64 (common in Parallels with x64 Node).
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

function getReleaseExeCandidates(arch) {
  const platformDir = arch === 'x86' ? 'Win32' : arch;
  return [
    path.join(ROOT_DIR, `windows/${platformDir}/Release/GumpDesktop.exe`),
    path.join(
      ROOT_DIR,
      `windows/${platformDir}/Release/GumpDesktop/GumpDesktop.exe`,
    ),
    path.join(
      ROOT_DIR,
      `windows/GumpDesktop/${platformDir}/Release/GumpDesktop.exe`,
    ),
    path.join(
      ROOT_DIR,
      `windows/GumpDesktop/${platformDir}/Release/GumpDesktop/GumpDesktop.exe`,
    ),
  ];
}

function findReleaseExe(arch) {
  const candidates = getReleaseExeCandidates(arch);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const platformDir = arch === 'x86' ? 'Win32' : arch;
  const releaseRoot = path.join(ROOT_DIR, 'windows', platformDir, 'Release');
  if (!fs.existsSync(releaseRoot)) {
    return null;
  }

  const stack = [releaseRoot];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      if (entry.name === 'GumpDesktop.exe') {
        return entryPath;
      }
    }
  }

  return null;
}

const windowsArch = resolveWindowsArch();
const wasdkPlatform = getWasdkPlatform(windowsArch);

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });

  if (result.error) {
    die(`${command} failed: ${result.error.message}`);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function ensureWindowsTooling() {
  if (!fs.existsSync(REACT_NATIVE_WINDOWS_DIR)) {
    die(
      'react-native-windows is not installed. Run: npm install --legacy-peer-deps',
    );
  }

  if (!fs.existsSync(REACT_NATIVE_CLI)) {
    die('react-native CLI is not installed. Run: npm install --legacy-peer-deps');
  }
}

function runReactNativeWindows(args) {
  run(process.execPath, [REACT_NATIVE_CLI, 'run-windows', ...args], {
    shell: false,
  });
}

function copyArtifact(sourcePath, destinationDir) {
  if (!fs.existsSync(sourcePath)) {
    die(`Build artifact not found: ${sourcePath}`);
  }

  ensureDir(destinationDir);
  const destinationPath = path.join(destinationDir, path.basename(sourcePath));
  fs.copyFileSync(sourcePath, destinationPath);
  log(`Artifact copied to ${destinationPath}`);
}

function findLatestPackage() {
  if (!fs.existsSync(WINDOWS_MSIX_DIR)) {
    return null;
  }

  const packages = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }

      if (entry.name.endsWith('.msix') || entry.name.endsWith('.msixbundle')) {
        packages.push(entryPath);
      }
    }
  }

  walk(WINDOWS_MSIX_DIR);
  packages.sort();
  return packages.at(-1) ?? null;
}

function buildExe() {
  log(`Building Windows release executable (${windowsArch})...`);
  runReactNativeWindows([
    '--release',
    '--arch',
    windowsArch,
    '--no-launch',
    '--no-deploy',
    '--logging',
    '--msbuildprops',
    `_WindowsAppSDKFoundationPlatform=${wasdkPlatform},UseExperimentalNuget=true`,
  ]);

  const releaseExe = findReleaseExe(windowsArch);
  if (!releaseExe) {
    die(
      `Windows executable not found under windows/${windowsArch === 'x86' ? 'Win32' : windowsArch}/Release. Expected GumpDesktop.exe`,
    );
  }

  copyArtifact(releaseExe, path.join(DIST_DIR, 'windows'));
}

function buildMsix() {
  const msbuildPlatform = windowsArch === 'x86' ? 'Win32' : windowsArch;
  log(`Building Windows MSIX package (${windowsArch})...`);
  run('msbuild', [
    'windows/GumpDesktop.sln',
    '/p:Configuration=Release',
    `/p:Platform=${msbuildPlatform}`,
    `/p:_WindowsAppSDKFoundationPlatform=${wasdkPlatform}`,
    '/p:UseExperimentalNuget=true',
    '/p:AppxBundle=Always',
    '/p:UapAppxPackageBuildMode=StoreUpload',
  ]);

  const latestPackage = findLatestPackage();
  if (!latestPackage) {
    die(`MSIX package not found under ${WINDOWS_MSIX_DIR}`);
  }

  copyArtifact(latestPackage, path.join(DIST_DIR, 'windows'));
}

if (process.platform !== 'win32') {
  die('Windows builds must run on Windows.');
}

ensureWindowsTooling();
ensureDir(DIST_DIR);

log(`Detected Windows target architecture: ${windowsArch}`);

switch (variant) {
  case 'exe':
    buildExe();
    break;
  case 'msix':
    buildMsix();
    break;
  default:
    die(`Unknown Windows variant: ${variant}. Use: exe | msix`);
}

log(`Done. Output directory: ${path.join(DIST_DIR, 'windows')}/`);
