import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');

const ENV_FILES = {
  prod: '.env',
  local: '.env.local',
  staging: '.env.staging',
};

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const values = {};
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const eq = line.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function readPlatformVersion(platform) {
  const fileName =
    platform === 'windows' ? 'VERSION.windows' : 'VERSION.macos';
  const filePath = path.join(ROOT_DIR, fileName);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf8').trim();
  }
  return platform === 'windows' ? '0.0.0.1' : '1.0.0';
}

function readGitSha() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: ROOT_DIR,
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'unknown';
  }
}

/** Convert semver `x.y.z` to Windows Identity Version `x.y.z.0`. */
export function toWindowsIdentityVersion(semver) {
  const parts = String(semver)
    .trim()
    .split('.')
    .map(part => part.replace(/\D/g, '') || '0');
  while (parts.length < 4) {
    parts.push('0');
  }
  return parts.slice(0, 4).join('.');
}

export function syncWindowsPackageVersion(semver) {
  const manifestPath = path.join(
    ROOT_DIR,
    'windows/GumpDesktop.Package/Package.appxmanifest',
  );
  if (!fs.existsSync(manifestPath)) {
    return;
  }
  const identityVersion = toWindowsIdentityVersion(semver);
  const original = fs.readFileSync(manifestPath, 'utf8');
  const updated = original.replace(
    /(<Identity\b[^>]*\bVersion=")[^"]+(")/,
    `$1${identityVersion}$2`,
  );
  if (updated !== original) {
    fs.writeFileSync(manifestPath, updated);
  }
  return identityVersion;
}

/**
 * Load dotenv for GUMP_ENV and stamp APP_VERSION / GIT_SHA / APP_BUILD_ID.
 * @param {{platform?: 'macos' | 'windows', envName?: string}} options
 */
export function applyGumpBuildIdentity(options = {}) {
  const platform = options.platform ?? process.env.GUMP_PLATFORM ?? 'windows';
  const envName =
    options.envName ?? process.env.GUMP_ENV ?? 'prod';

  if (!ENV_FILES[envName]) {
    throw new Error(`Unknown GUMP_ENV '${envName}'. Use: prod | local | staging`);
  }
  if (platform !== 'macos' && platform !== 'windows') {
    throw new Error(`Unknown GUMP_PLATFORM '${platform}'. Use: macos | windows`);
  }

  const envPath = path.join(ROOT_DIR, ENV_FILES[envName]);
  const fileValues = parseEnvFile(envPath);
  for (const [key, value] of Object.entries(fileValues)) {
    if (process.env[key] == null || process.env[key] === '') {
      process.env[key] = value;
    }
  }

  process.env.GUMP_ENV = envName;
  process.env.GUMP_PLATFORM = platform;
  process.env.APP_BUILD_ID = envName;
  process.env.APP_VERSION = readPlatformVersion(platform);
  process.env.GIT_SHA = readGitSha();
  if (!process.env.APP_BUILD_NUMBER) {
    process.env.APP_BUILD_NUMBER = String(Math.floor(Date.now() / 1000));
  }
  if (!process.env.EXTRA_PACKAGER_ARGS) {
    process.env.EXTRA_PACKAGER_ARGS = '--reset-cache';
  }

  process.env.GUMP_DIST_DIR = path.join(ROOT_DIR, 'dist', envName, platform);

  console.log(
    `\n▸ App identity: platform=${platform} env=${envName} version=${process.env.APP_VERSION} buildId=${process.env.APP_BUILD_ID} git=${process.env.GIT_SHA}`,
  );
  console.log(`▸ Dist output: ${process.env.GUMP_DIST_DIR}`);

  if (platform === 'windows') {
    const identityVersion = syncWindowsPackageVersion(process.env.APP_VERSION);
    if (identityVersion) {
      console.log(`▸ Windows Package.appxmanifest Version=${identityVersion}`);
    }
  }

  return {
    platform,
    envName,
    appVersion: process.env.APP_VERSION,
    appBuildId: process.env.APP_BUILD_ID,
    gitSha: process.env.GIT_SHA,
    distDir: process.env.GUMP_DIST_DIR,
  };
}
