#!/usr/bin/env node
/**
 * Force @react-native-windows/cli to use Windows PowerShell 5.1 (powershell.exe).
 *
 * Newer RNW CLI builds resolve `pwsh` via findPowerShell(). Appx cmdlets
 * (Get-AppxPackage, etc.) fail under PowerShell 7 with 0x80131539, which breaks
 * `run-windows` deploy even when the solution built successfully.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const MARKER = 'GUMP_FORCE_WINDOWS_POWERSHELL';

function resolveWindowsPowerShell() {
  const systemRoot = process.env.SystemRoot || process.env.SYSTEMROOT || 'C:\\Windows';
  return path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

function patchCommandWithProgress(filePath, powershellPath) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const original = fs.readFileSync(filePath, 'utf8');
  if (original.includes(MARKER)) {
    return false;
  }

  const literal = JSON.stringify(powershellPath);
  let patched = original;

  patched = patched.replace(
    /const\s+powershell\s*=\s*findPowerShell\s*\(\s*\)\s*;/,
    `const powershell = /* ${MARKER} */ ${literal};`,
  );
  patched = patched.replace(
    /exports\.powershell\s*=\s*findPowerShell\s*\(\s*\)\s*;/,
    `exports.powershell = /* ${MARKER} */ ${literal};`,
  );
  patched = patched.replace(
    /(?:const\s+powershell|exports\.powershell)\s*=\s*\(0,\s*[\w.]*findPowerShell\)\s*\(\s*\)\s*;/,
    match =>
      match.startsWith('const')
        ? `const powershell = /* ${MARKER} */ ${literal};`
        : `exports.powershell = /* ${MARKER} */ ${literal};`,
  );
  patched = patched.replace(
    /exports\.powershell\s*=\s*`\$\{process\.env\.SystemRoot\}\\System32\\WindowsPowerShell\\v1\.0\\powershell\.exe`\s*;/,
    `exports.powershell = /* ${MARKER} */ ${literal};`,
  );

  if (patched === original) {
    // Unknown layout — still force the exported value if present.
    if (!/exports\.powershell\s*=/.test(original)) {
      return false;
    }
    patched = original.replace(
      /exports\.powershell\s*=\s*[^;]+;/,
      `exports.powershell = /* ${MARKER} */ ${literal};`,
    );
  }

  if (patched === original) {
    return false;
  }

  fs.writeFileSync(filePath, patched);
  return true;
}

export function ensureRnwWindowsPowerShell({ silent = false } = {}) {
  if (process.platform !== 'win32') {
    return { patched: false, reason: 'not-windows' };
  }

  const powershellPath = resolveWindowsPowerShell();
  if (!fs.existsSync(powershellPath)) {
    return { patched: false, reason: 'powershell-missing', powershellPath };
  }

  const targets = [
    path.join(
      ROOT_DIR,
      'node_modules/@react-native-windows/cli/lib-commonjs/utils/commandWithProgress.js',
    ),
    path.join(
      ROOT_DIR,
      'node_modules/react-native-windows/node_modules/@react-native-windows/cli/lib-commonjs/utils/commandWithProgress.js',
    ),
  ];

  let patchedAny = false;
  for (const target of targets) {
    if (patchCommandWithProgress(target, powershellPath)) {
      patchedAny = true;
      if (!silent) {
        console.log(`✓ RNW deploy will use Windows PowerShell 5.1 (${target})`);
      }
    }
  }

  return { patched: patchedAny, powershellPath };
}

const isDirectRun =
  process.argv[1] != null &&
  url.pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  const result = ensureRnwWindowsPowerShell();
  if (result.reason === 'powershell-missing') {
    console.error(`✗ Windows PowerShell not found at ${result.powershellPath}`);
    process.exit(1);
  }
}
