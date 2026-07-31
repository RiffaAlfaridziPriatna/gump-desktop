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
  return destinationPath;
}

function rmrf(targetPath) {
  fs.rmSync(targetPath, {recursive: true, force: true});
}

function shouldIncludeInPortable(name) {
  const lower = name.toLowerCase();
  return ![
    '.pdb',
    '.iobj',
    '.ipdb',
    '.ilk',
    '.exp',
    '.lib',
    '.obj',
    '.log',
    '.tlog',
    '.lastbuildstate',
  ].some(ext => lower.endsWith(ext));
}

function copyTreeFiltered(sourceDir, destDir) {
  ensureDir(destDir);
  for (const entry of fs.readdirSync(sourceDir, {withFileTypes: true})) {
    if (!shouldIncludeInPortable(entry.name)) {
      continue;
    }
    const from = path.join(sourceDir, entry.name);
    const to = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyTreeFiltered(from, to);
      continue;
    }
    fs.copyFileSync(from, to);
  }
}

function getAutolinkedDllCandidates(arch) {
  const platformDir = getMsbuildPlatform(arch);
  const solutionOut = path.join(ROOT_DIR, 'windows', platformDir, 'Release');
  return [
    {
      name: 'RNSVG.dll',
      candidates: [
        path.join(solutionOut, 'RNSVG.dll'),
        path.join(solutionOut, 'RNSVG', 'RNSVG.dll'),
        path.join(
          ROOT_DIR,
          'node_modules/react-native-svg/windows/RNSVG',
          platformDir,
          'Release',
          'RNSVG.dll',
        ),
      ],
    },
    {
      name: 'ReactNativeAsyncStorage.dll',
      candidates: [
        path.join(solutionOut, 'ReactNativeAsyncStorage.dll'),
        path.join(solutionOut, 'ReactNativeAsyncStorage', 'ReactNativeAsyncStorage.dll'),
        path.join(
          ROOT_DIR,
          'node_modules/@react-native-async-storage/async-storage/windows/ReactNativeAsyncStorage',
          platformDir,
          'Release',
          'ReactNativeAsyncStorage.dll',
        ),
      ],
    },
    {
      name: 'ReactNativeTurboSqlite.dll',
      candidates: [
        path.join(solutionOut, 'ReactNativeTurboSqlite.dll'),
        path.join(solutionOut, 'ReactNativeTurboSqlite', 'ReactNativeTurboSqlite.dll'),
        path.join(
          ROOT_DIR,
          'node_modules/react-native-turbo-sqlite/windows/ReactNativeTurboSqlite',
          platformDir,
          'Release',
          'ReactNativeTurboSqlite.dll',
        ),
      ],
    },
  ];
}

function ensureAutolinkedDllsInReleaseDir(releaseDir, arch) {
  for (const {name, candidates} of getAutolinkedDllCandidates(arch)) {
    const dest = path.join(releaseDir, name);
    if (fs.existsSync(dest)) {
      continue;
    }
    const source = candidates.find(candidate => fs.existsSync(candidate));
    if (!source) {
      die(
        `Missing ${name} next to GumpDesktop.exe and no candidate found.\n` +
          `Release dir: ${releaseDir}\n` +
          `The Release build may have failed to produce autolinked native modules.`,
      );
    }
    fs.copyFileSync(source, dest);
    log(`Copied ${name} into portable payload`);
  }
}

function writePortableReadme(destDir, arch) {
  const readmePath = path.join(destDir, 'README.txt');
  const contents = [
    'GUMP Desktop — Windows portable build',
    '',
    `Architecture: ${arch}`,
    '',
    'How to run',
    '1. Unzip this folder anywhere.',
    '2. Double-click GumpDesktop.exe.',
    '3. Keep all files in this folder together (DLL/assets required).',
    '',
    'Requirements',
    '- Windows 10 version 1809+ (build 17763) or Windows 11',
    '- Matching CPU architecture (x64 build will not run on ARM64 without emulation quality guarantees)',
    '- Windows App SDK / Windows App Runtime may be required if not already installed.',
    '  Download: https://learn.microsoft.com/windows/apps/windows-app-sdk/downloads',
    '',
    'Notes',
    '- This is an unpackaged portable build (not MSIX).',
    '- Windows SmartScreen may warn because the binary is unsigned. Use "More info" → "Run anyway" for trusted internal builds.',
    '- Do not redistribute GumpDesktop.exe alone.',
    '',
  ].join('\r\n');
  fs.writeFileSync(readmePath, contents, 'utf8');
}

function zipDirectory(sourceDir, zipPath) {
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  const parentDir = path.dirname(sourceDir);
  const folderName = path.basename(sourceDir);

  // Windows 10+ ships bsdtar, which can create .zip via -a.
  const result = spawnSync(
    'tar',
    ['-a', '-c', '-f', zipPath, '-C', parentDir, folderName],
    {cwd: ROOT_DIR, stdio: 'inherit', shell: false},
  );

  if (result.error) {
    die(`Failed to create zip: ${result.error.message}`);
  }
  if (result.status !== 0) {
    die(`tar failed while creating ${zipPath}`);
  }
  if (!fs.existsSync(zipPath)) {
    die(`Zip was not created: ${zipPath}`);
  }

  log(`Portable zip created: ${zipPath}`);
}

function packagePortableRelease(arch) {
  const releaseExe = findReleaseExe(arch);
  if (!releaseExe) {
    die(
      `Windows executable not found under windows/${getMsbuildPlatform(arch)}/Release. Expected GumpDesktop.exe`,
    );
  }

  const releaseDir = path.dirname(releaseExe);
  ensureAutolinkedDllsInReleaseDir(releaseDir, arch);

  const distWindowsDir = path.join(DIST_DIR, 'windows');
  const portableName = `GumpDesktop-windows-${arch}`;
  const portableDir = path.join(distWindowsDir, portableName);
  const zipPath = path.join(distWindowsDir, `${portableName}.zip`);

  rmrf(portableDir);
  ensureDir(distWindowsDir);
  copyTreeFiltered(releaseDir, portableDir);
  writePortableReadme(portableDir, arch);
  zipDirectory(portableDir, zipPath);

  log(`Portable folder: ${portableDir}`);
  log(`Share this file: ${zipPath}`);
  return {portableDir, zipPath};
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
      'build:windows (portable zip) only supports one architecture. Use WINDOWS_ARCH=x64 (or omit it). For multi-arch packages use: npm run build:windows:msix',
    );
  }

  const windowsArch = archs[0];
  const wasdkPlatform = getWasdkPlatform(windowsArch);

  log(`Building Windows release portable package (${windowsArch})...`);
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

  packagePortableRelease(windowsArch);
}

function buildMsix(archs) {
  const msbuildExe = resolveMsbuildExe(archs);
  const primaryArch = archs[0];
  const wasdkPlatform = getWasdkPlatform(primaryArch);
  const bundlePlatforms = archs.map(getAppxBundlePlatform).join('|');
  const isMultiArch = archs.length > 1;
  const windowsDir = path.join(ROOT_DIR, 'windows');
  const solutionDir = `${windowsDir}${path.sep}`;
  const appxPackageDir = `${path.join(DIST_DIR, 'windows', 'AppPackages')}${path.sep}`;

  ensureDir(appxPackageDir);

  log(
    isMultiArch
      ? `Building Windows MSIX bundle (${bundlePlatforms})...`
      : `Building Windows MSIX package (${primaryArch})...`,
  );

  // Build the .sln (not the .wapproj alone). Building the packaging project
  // directly sets SolutionDir to GumpDesktop.Package\, which breaks RNSVG /
  // autolink paths that expect windows\ExperimentalFeatures.props and
  // windows\<Platform>\Release\*.dll.
  //
  // GenerateAppxPackageOnBuild is still required or MSBuild can exit 0
  // without emitting an .msix/.msixbundle.
  const msbuildArgs = [
    path.join('windows', 'GumpDesktop.sln'),
    '/restore',
    '/p:Configuration=Release',
    `/p:Platform=${getMsbuildPlatform(primaryArch)}`,
    `/p:SolutionDir=${solutionDir}`,
    `/p:_WindowsAppSDKFoundationPlatform=${wasdkPlatform}`,
    '/p:UseExperimentalNuget=true',
    '/p:RnwNewArch=true',
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
  case 'zip':
  case 'portable':
    buildExe(windowsArchs);
    break;
  case 'msix':
    buildMsix(windowsArchs);
    break;
  default:
    die(`Unknown Windows variant: ${variant}. Use: zip | msix`);
}

log(`Done. Output directory: ${path.join(DIST_DIR, 'windows')}/`);
