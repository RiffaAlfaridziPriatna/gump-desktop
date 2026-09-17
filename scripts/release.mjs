#!/usr/bin/env node
/**
 * Automate GitHub Release creation and appcast update (local fallback).
 *
 * Prerequisites:
 *   - gh CLI installed and authenticated
 *   - Build artifacts in dist/prod/macos/ and dist/prod/windows/
 *
 * Usage:
 *   node scripts/release.mjs [--tag <tag>] [--dry-run]
 */
import {execSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

const GITHUB_RELEASES_REPO =
  process.env.GITHUB_RELEASES_REPO || 'RiffaAlfaridziPriatna/gump-desktop';

const args = process.argv.slice(2);
const tagIndex = args.indexOf('--tag');
const RELEASE_TAG =
  tagIndex !== -1 && args[tagIndex + 1]
    ? args[tagIndex + 1]
    : new Date().toISOString().split('T')[0];
const DRY_RUN = args.includes('--dry-run');

const MAC_VERSION = fs
  .readFileSync(path.join(ROOT_DIR, 'VERSION.macos'), 'utf8')
  .trim();
const WIN_VERSION = fs
  .readFileSync(path.join(ROOT_DIR, 'VERSION.windows'), 'utf8')
  .trim();

const macZip = `Gump-MacOS-v${MAC_VERSION}.zip`;
const winZip = `Gump-Windows-v${WIN_VERSION}.zip`;
const macZipPath = path.join(ROOT_DIR, `dist/prod/macos/${macZip}`);
const winZipPath = path.join(ROOT_DIR, `dist/prod/windows/${winZip}`);

function log(msg) {
  console.log(`▸ ${msg}`);
}
function error(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}
function success(msg) {
  console.log(`✓ ${msg}`);
}

function run(cmd, options = {}) {
  if (DRY_RUN) {
    console.log(`  [dry-run] ${cmd}`);
    return '';
  }
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      stdio: 'pipe',
      cwd: ROOT_DIR,
      ...options,
    });
  } catch (e) {
    if (options.ignoreError) {
      return '';
    }
    error(`Command failed: ${cmd}\n${e.stderr || e.message}`);
  }
}

function checkPrerequisites() {
  try {
    execSync('gh --version', {stdio: 'pipe'});
  } catch {
    error('gh CLI not found. Install: https://cli.github.com/');
  }

  try {
    execSync('gh auth status', {stdio: 'pipe'});
  } catch {
    error('gh CLI not authenticated. Run: gh auth login');
  }

  const missing = [];
  if (!fs.existsSync(macZipPath)) {
    missing.push(macZipPath);
  }
  if (!fs.existsSync(winZipPath)) {
    missing.push(winZipPath);
  }
  if (missing.length > 0) {
    error(
      `Missing build artifacts:\n  ${missing.join('\n  ')}\n\nRun builds first:\n  npm run build:macos:distribute\n  npm run build:windows`,
    );
  }
}

function generateAppcast() {
  log('Generating appcast.xml...');
  run(`node scripts/generate-appcast.mjs --tag ${RELEASE_TAG}`);
  success('appcast.xml generated');
}

function createGitHubRelease() {
  log(`Creating GitHub Release: ${RELEASE_TAG}`);

  const title = `Release ${RELEASE_TAG}`;
  const notes = `## Versions\n\n- **macOS**: v${MAC_VERSION}\n- **Windows**: v${WIN_VERSION}\n\n---\n\n*Auto-generated release*`;

  const existing = run(
    `gh release view ${RELEASE_TAG} --repo ${GITHUB_RELEASES_REPO} --json tagName 2>/dev/null || echo ""`,
    {ignoreError: true},
  );

  if (existing.includes(RELEASE_TAG)) {
    log(`Release ${RELEASE_TAG} exists, uploading assets...`);
    run(
      `gh release delete-asset ${RELEASE_TAG} ${macZip} --repo ${GITHUB_RELEASES_REPO} -y 2>/dev/null || true`,
      {ignoreError: true},
    );
    run(
      `gh release delete-asset ${RELEASE_TAG} ${winZip} --repo ${GITHUB_RELEASES_REPO} -y 2>/dev/null || true`,
      {ignoreError: true},
    );
  } else {
    run(
      `gh release create ${RELEASE_TAG} --repo ${GITHUB_RELEASES_REPO} --title "${title}" --notes "${notes}"`,
    );
    success(`Release ${RELEASE_TAG} created`);
  }

  log('Uploading macOS artifact...');
  run(
    `gh release upload ${RELEASE_TAG} "${macZipPath}" --repo ${GITHUB_RELEASES_REPO} --clobber`,
  );
  success(`Uploaded ${macZip}`);

  log('Uploading Windows artifact...');
  run(
    `gh release upload ${RELEASE_TAG} "${winZipPath}" --repo ${GITHUB_RELEASES_REPO} --clobber`,
  );
  success(`Uploaded ${winZip}`);
}

function updateAppcastInRepo() {
  log('Updating appcast.xml on main...');

  const appcastPath = path.join(ROOT_DIR, 'dist/appcast.xml');
  if (!fs.existsSync(appcastPath)) {
    error('appcast.xml not found. Run generate-appcast.mjs first.');
  }

  if (!DRY_RUN) {
    fs.copyFileSync(appcastPath, path.join(ROOT_DIR, 'appcast.xml'));
    run('git add appcast.xml');
    run(
      `git commit -m "chore: update appcast.xml for ${RELEASE_TAG}" --allow-empty`,
      {ignoreError: true},
    );
    run('git push');
  } else {
    console.log(`  [dry-run] copy ${appcastPath} → appcast.xml && commit/push`);
  }

  success('appcast.xml updated on main');
}

console.log('\nGUMP Desktop Release Script\n');
console.log(`  Tag:     ${RELEASE_TAG}`);
console.log(`  macOS:   v${MAC_VERSION} (${macZip})`);
console.log(`  Windows: v${WIN_VERSION} (${winZip})`);
console.log(`  Repo:    ${GITHUB_RELEASES_REPO}`);
if (DRY_RUN) {
  console.log('  Mode:    DRY RUN (no changes)\n');
} else {
  console.log('');
}

checkPrerequisites();
generateAppcast();
createGitHubRelease();
updateAppcastInRepo();

console.log('\nRelease complete!\n');
console.log(
  `  GitHub Release: https://github.com/${GITHUB_RELEASES_REPO}/releases/tag/${RELEASE_TAG}`,
);
console.log(
  `  Appcast URL:    https://raw.githubusercontent.com/${GITHUB_RELEASES_REPO}/main/appcast.xml\n`,
);
