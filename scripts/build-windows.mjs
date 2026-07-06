#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const WINDOWS_RELEASE_EXE = path.join(
  ROOT_DIR,
  'windows/x64/Release/GumpDesktop/GumpDesktop.exe',
);
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
  log('Building Windows release executable...');
  runReactNativeWindows([
    '--release',
    '--arch',
    'x64',
    '--no-launch',
    '--logging',
  ]);

  if (!fs.existsSync(WINDOWS_RELEASE_EXE)) {
    die(`Windows executable not found at ${WINDOWS_RELEASE_EXE}`);
  }

  copyArtifact(WINDOWS_RELEASE_EXE, path.join(DIST_DIR, 'windows'));
}

function buildMsix() {
  log('Building Windows MSIX package...');
  run('msbuild', [
    'windows/GumpDesktop.sln',
    '/p:Configuration=Release',
    '/p:Platform=x64',
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
