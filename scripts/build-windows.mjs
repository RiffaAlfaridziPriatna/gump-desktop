#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
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

const ARCH_ALIASES = {
  arm64: 'ARM64',
  x86: 'x86',
  win32: 'x86',
  x64: 'x64',
  amd64: 'x64',
};

const variant = process.argv[2] ?? 'exe';

function log(message) {
  console.log(`\n▸ ${message}`);
}

function die(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function normalizeArch(value) {
  const normalized = ARCH_ALIASES[value.trim().toLowerCase()];
  if (!normalized) {
    die(
      `Unknown WINDOWS_ARCH value: ${value}. Use: x64 | x86 | ARM64 | x64,ARM64`,
    );
  }
  return normalized;
}

function detectHostArch() {
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

function resolveWindowsArchs() {
  const override = process.env.WINDOWS_ARCH?.trim();
  if (!override) {
    return [detectHostArch()];
  }

  if (override.toLowerCase() === 'all') {
    return ['x64', 'ARM64'];
  }

  const archs = [
    ...new Set(
      override
        .split(/[|,]/)
        .map(part => part.trim())
        .filter(Boolean)
        .map(normalizeArch),
    ),
  ];

  if (archs.length === 0) {
    die('WINDOWS_ARCH is empty. Use: x64 | x86 | ARM64 | x64,ARM64 | all');
  }

  return archs;
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

function getMsbuildPlatform(arch) {
  return arch === 'x86' ? 'Win32' : arch;
}

function getReleaseExeCandidates(arch) {
  const platformDir = getMsbuildPlatform(arch);
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

  const releaseRoot = path.join(
    ROOT_DIR,
    'windows',
    getMsbuildPlatform(arch),
    'Release',
  );
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

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    shell: false,
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

function resolveVsWherePath() {
  const programFilesX86 =
    process.env['ProgramFiles(x86)'] || process.env.ProgramFiles;
  if (!programFilesX86) {
    return null;
  }
  return path.join(
    programFilesX86,
    'Microsoft Visual Studio',
    'Installer',
    'vswhere.exe',
  );
}

function queryVsInstallPath(vsWherePath, requires) {
  try {
    const raw = execFileSync(
      vsWherePath,
      [
        '-latest',
        '-products',
        '*',
        '-requires',
        ...requires,
        '-property',
        'installationPath',
        '-format',
        'value',
        '-utf8',
      ],
      { encoding: 'utf8' },
    );
    return raw
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * MSBuild is not on PATH by default. Locate it the same way RNW does: vswhere
 * → latest VS with Microsoft.Component.MSBuild → MSBuild/Current/Bin/amd64.
 */
function resolveMsbuildExe(requiredArchs) {
  const vsWherePath = resolveVsWherePath();
  if (!vsWherePath || !fs.existsSync(vsWherePath)) {
    die(
      `vswhere.exe not found. Install Visual Studio 2022+ with MSBuild, or open "Developer PowerShell for VS" and retry.`,
    );
  }

  const requires = ['Microsoft.Component.MSBuild'];
  for (const arch of requiredArchs) {
    if (arch === 'ARM64') {
      requires.push('Microsoft.VisualStudio.Component.VC.Tools.ARM64');
    } else {
      requires.push('Microsoft.VisualStudio.Component.VC.Tools.x86.x64');
    }
  }

  let installs = queryVsInstallPath(vsWherePath, requires);

  // Fall back to any VS with MSBuild if the strict VCTools query misses
  // (common when ARM64 tools aren't installed yet — surface a clearer error).
  if (installs.length === 0) {
    installs = queryVsInstallPath(vsWherePath, ['Microsoft.Component.MSBuild']);

    if (installs.length === 0) {
      die(
        'MSBuild not found via vswhere. Install Visual Studio Build Tools / VS with "Desktop development with C++" and Microsoft.Component.MSBuild.',
      );
    }

    if (requiredArchs.includes('ARM64')) {
      die(
        `Found Visual Studio at ${installs[0]}, but ARM64 C++ tools are missing.\n` +
          `Install "MSVC v143 - VS 2022 C++ ARM64 build tools" (or current MSVC ARM64 tools), then retry.\n` +
          `Or build x64 only: set WINDOWS_ARCH=x64`,
      );
    }
  }

  const installationPath = installs[0];
  const candidates = [
    path.join(installationPath, 'MSBuild', 'Current', 'Bin', 'amd64', 'MSBuild.exe'),
    path.join(installationPath, 'MSBuild', 'Current', 'Bin', 'MSBuild.exe'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      log(`Using MSBuild: ${candidate}`);
      return candidate;
    }
  }

  die(`MSBuild.exe not found under ${installationPath}`);
}

function runReactNativeWindows(args) {
  run(process.execPath, [REACT_NATIVE_CLI, 'run-windows', ...args]);
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

function getAppxBundlePlatform(arch) {
  // AppxBundlePlatforms expects x86|x64|arm64 (arm64 lowercase).
  switch (arch) {
    case 'x86':
      return 'x86';
    case 'ARM64':
      return 'arm64';
    default:
      return 'x64';
  }
}

function getPackageSearchRoots(appxPackageDir) {
  return [
    appxPackageDir,
    WINDOWS_MSIX_DIR,
    path.join(ROOT_DIR, 'windows', 'GumpDesktop.Package', 'AppPackages'),
    path.join(ROOT_DIR, 'windows', 'GumpDesktop', 'AppPackages'),
  ];
}

function findLatestPackage(searchRoots) {
  const packages = [];
  const packageExts = ['.msix', '.msixbundle', '.appx', '.appxbundle'];

  function walk(dir) {
    if (!fs.existsSync(dir)) {
      return;
    }

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }

      const lower = entry.name.toLowerCase();
      if (packageExts.some(ext => lower.endsWith(ext))) {
        packages.push({
          path: entryPath,
          mtimeMs: fs.statSync(entryPath).mtimeMs,
        });
      }
    }
  }

  for (const root of searchRoots) {
    walk(root);
  }

  packages.sort((a, b) => a.mtimeMs - b.mtimeMs);
  return packages.at(-1)?.path ?? null;
}

function buildExe(archs) {
  if (archs.length !== 1) {
    die(
      'build:windows (exe) only supports one architecture. Use WINDOWS_ARCH=x64 (or omit it). For multi-arch installers use: npm run build:windows:msix',
    );
  }

  const windowsArch = archs[0];
  const wasdkPlatform = getWasdkPlatform(windowsArch);

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
      `Windows executable not found under windows/${getMsbuildPlatform(windowsArch)}/Release. Expected GumpDesktop.exe`,
    );
  }

  copyArtifact(releaseExe, path.join(DIST_DIR, 'windows'));
}

function buildMsix(archs) {
  const msbuildExe = resolveMsbuildExe(archs);
  const primaryArch = archs[0];
  const wasdkPlatform = getWasdkPlatform(primaryArch);
  const bundlePlatforms = archs.map(getAppxBundlePlatform).join('|');
  const isMultiArch = archs.length > 1;
  const appxPackageDir = `${path.join(DIST_DIR, 'windows', 'AppPackages')}${path.sep}`;
  const packageProject = path.join(
    'windows',
    'GumpDesktop.Package',
    'GumpDesktop.Package.wapproj',
  );

  ensureDir(appxPackageDir);

  log(
    isMultiArch
      ? `Building Windows MSIX bundle (${bundlePlatforms})...`
      : `Building Windows MSIX package (${primaryArch})...`,
  );

  // GenerateAppxPackageOnBuild is required: without it MSBuild can exit 0
  // after compiling natives but never emit an .msix/.msixbundle.
  const msbuildArgs = [
    packageProject,
    '/restore',
    '/p:Configuration=Release',
    `/p:Platform=${getMsbuildPlatform(primaryArch)}`,
    `/p:_WindowsAppSDKFoundationPlatform=${wasdkPlatform}`,
    '/p:UseExperimentalNuget=true',
    '/p:GenerateAppxPackageOnBuild=true',
    '/p:AppxBundle=Always',
    `/p:AppxBundlePlatforms=${bundlePlatforms}`,
    '/p:UapAppxPackageBuildMode=SideloadOnly',
    `/p:AppxPackageDir=${appxPackageDir}`,
  ];

  run(msbuildExe, msbuildArgs);

  const searchRoots = getPackageSearchRoots(appxPackageDir);
  const latestPackage = findLatestPackage(searchRoots);
  if (!latestPackage) {
    die(
      `MSIX package not found after build.\n` +
        `Searched:\n${searchRoots.map(root => `  - ${root}`).join('\n')}\n` +
        `MSBuild likely compiled without packaging. Re-run and confirm the log mentions Appx/MSIX packaging.`,
    );
  }

  copyArtifact(latestPackage, path.join(DIST_DIR, 'windows'));
}

if (process.platform !== 'win32') {
  die('Windows builds must run on Windows.');
}

ensureWindowsTooling();
ensureDir(DIST_DIR);

const windowsArchs = resolveWindowsArchs();
log(`Detected Windows target architecture(s): ${windowsArchs.join(', ')}`);

switch (variant) {
  case 'exe':
    buildExe(windowsArchs);
    break;
  case 'msix':
    buildMsix(windowsArchs);
    break;
  default:
    die(`Unknown Windows variant: ${variant}. Use: exe | msix`);
}

log(`Done. Output directory: ${path.join(DIST_DIR, 'windows')}/`);
