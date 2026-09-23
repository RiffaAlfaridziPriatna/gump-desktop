#!/usr/bin/env node
/**
 * Generate appcast.xml for Sparkle (macOS) and WinSparkle (Windows).
 * Supports separate versions per platform.
 *
 * Usage:
 *   node scripts/generate-appcast.mjs [--tag <release-tag>]
 *
 * If --tag not provided, uses today's date (YYYY-MM-DD).
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

const MAC_VERSION = fs
  .readFileSync(path.join(ROOT_DIR, 'VERSION.macos'), 'utf8')
  .trim();
const WIN_VERSION = fs
  .readFileSync(path.join(ROOT_DIR, 'VERSION.windows'), 'utf8')
  .trim();

const args = process.argv.slice(2);
const tagIndex = args.indexOf('--tag');
const RELEASE_TAG =
  tagIndex !== -1 && args[tagIndex + 1]
    ? args[tagIndex + 1]
    : new Date().toISOString().split('T')[0];

// Public feed + binaries (source repo may be private). Override with env if needed.
const GITHUB_REPO =
  process.env.GITHUB_RELEASES_REPO ||
  'RiffaAlfaridziPriatna/gump-desktop-releases';
const BASE_URL = `https://github.com/${GITHUB_REPO}/releases/download`;

const macZip = `Gump-MacOS-v${MAC_VERSION}.zip`;
const winZip = `Gump-Windows-v${WIN_VERSION}.zip`;

const macSigPath = path.join(
  ROOT_DIR,
  'dist/prod/macos/sparkle_signature.txt',
);
const macSigRaw = fs.existsSync(macSigPath)
  ? fs.readFileSync(macSigPath, 'utf8').trim()
  : '';

/** sign_update prints: sparkle:edSignature="…" length="…" — store bare value only. */
function parseEdSignature(raw) {
  if (!raw) return '';
  const fromAttr = raw.match(/edSignature="([^"]+)"/);
  if (fromAttr) return fromAttr[1];
  // Already a bare EdDSA signature (no spaces / attributes)
  if (!/[\s=]/.test(raw)) return raw;
  return '';
}

function parseSignedLength(raw) {
  const m = raw && raw.match(/\blength="(\d+)"/);
  return m ? Number(m[1]) : 0;
}

const macSig = parseEdSignature(macSigRaw);

function getFileSize(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

const macZipPath = path.join(ROOT_DIR, `dist/prod/macos/${macZip}`);
const winZipPath = path.join(ROOT_DIR, `dist/prod/windows/${winZip}`);
const macSize = parseSignedLength(macSigRaw) || getFileSize(macZipPath);
const winSize = getFileSize(winZipPath);
const pubDate = new Date().toUTCString();

const appcast = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
<channel>
  <title>GUMP Desktop Updates</title>
  <link>https://gump.app</link>
  <description>GUMP Desktop application updates</description>

  <!-- macOS (Sparkle reads this) -->
  <item>
    <title>Version ${MAC_VERSION} (macOS)</title>
    <sparkle:version>${MAC_VERSION}</sparkle:version>
    <sparkle:shortVersionString>${MAC_VERSION}</sparkle:shortVersionString>
    <pubDate>${pubDate}</pubDate>
    <enclosure
      url="${BASE_URL}/${RELEASE_TAG}/${macZip}"
      sparkle:os="macos"${macSig ? `
      sparkle:edSignature="${macSig}"` : ''}${macSize ? `
      length="${macSize}"` : ''}
      type="application/octet-stream"/>
  </item>

  <!-- Windows (WinSparkle reads this) -->
  <item>
    <title>Version ${WIN_VERSION} (Windows)</title>
    <sparkle:version>${WIN_VERSION}</sparkle:version>
    <sparkle:shortVersionString>${WIN_VERSION}</sparkle:shortVersionString>
    <pubDate>${pubDate}</pubDate>
    <enclosure
      url="${BASE_URL}/${RELEASE_TAG}/${winZip}"
      sparkle:os="windows"${winSize ? `
      length="${winSize}"` : ''}
      type="application/octet-stream"/>
  </item>
</channel>
</rss>
`;

const outPath = path.join(ROOT_DIR, 'dist/appcast.xml');
fs.mkdirSync(path.dirname(outPath), {recursive: true});
fs.writeFileSync(outPath, appcast);

console.log(`✓ Generated appcast.xml`);
console.log(`  Release tag: ${RELEASE_TAG}`);
console.log(`  macOS: v${MAC_VERSION} → ${macZip}`);
console.log(`  Windows: v${WIN_VERSION} → ${winZip}`);
console.log(`  Output: ${outPath}`);
