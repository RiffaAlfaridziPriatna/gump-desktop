#!/usr/bin/env node
/**
 * RNW autolink only ADDS projects to the .sln — it never removes stale ones.
 * After a bad link (e.g. react-native-device-info UWP), the project stays in
 * GumpDesktop.sln and keeps failing New Arch builds (RnwNewArch=true).
 *
 * Strip denylisted native projects before every Windows build.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const SOLUTION_PATH = path.join(ROOT_DIR, 'windows', 'GumpDesktop.sln');

/** Match Project(...) lines / paths that must never stay in the app solution. */
const DENYLIST_PATTERNS = [
  /RNDeviceInfoCPP/i,
  /react-native-device-info/i,
];

/**
 * @param {string} solutionPath
 * @returns {{removed: string[], changed: boolean}}
 */
export function scrubWindowsSolution(solutionPath = SOLUTION_PATH) {
  if (!fs.existsSync(solutionPath)) {
    return {removed: [], changed: false};
  }

  const original = fs.readFileSync(solutionPath, 'utf8');
  const newline = original.includes('\r\n') ? '\r\n' : '\n';
  const lines = original.split(/\r?\n/);

  const deniedGuids = new Set();
  const removedNames = new Set();

  for (const line of lines) {
    if (!line.startsWith('Project(')) {
      continue;
    }
    if (!DENYLIST_PATTERNS.some(pattern => pattern.test(line))) {
      continue;
    }
    // Project("{type}") = "Name", "path", "{GUID}"
    const match = line.match(/=\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"(\{[^"]+\})"/);
    if (match) {
      removedNames.add(match[1]);
      deniedGuids.add(match[3].toUpperCase());
    }
  }

  if (deniedGuids.size === 0) {
    return {removed: [], changed: false};
  }

  const scrubbed = [];
  let skippingProjectBlock = false;

  for (const line of lines) {
    if (line.startsWith('Project(') && DENYLIST_PATTERNS.some(p => p.test(line))) {
      skippingProjectBlock = true;
      continue;
    }
    if (skippingProjectBlock) {
      if (line.trim() === 'EndProject') {
        skippingProjectBlock = false;
      }
      continue;
    }

    const guidMatch = line.match(/(\{[0-9A-Fa-f-]{36}\})/);
    if (guidMatch && deniedGuids.has(guidMatch[1].toUpperCase())) {
      continue;
    }

    scrubbed.push(line);
  }

  const next = scrubbed.join(newline);
  if (next !== original) {
    fs.writeFileSync(solutionPath, next, 'utf8');
  }

  return {
    removed: [...removedNames],
    changed: next !== original,
  };
}

export function scrubWindowsSolutionOrDie() {
  const {removed, changed} = scrubWindowsSolution();
  if (changed) {
    console.log(
      `▸ Scrubbed stale Windows solution projects: ${removed.join(', ')}`,
    );
  }
  return {removed, changed};
}

if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  scrubWindowsSolutionOrDie();
}
