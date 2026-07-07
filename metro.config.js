const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const fs = require('fs');
const path = require('path');

require('dotenv').config({path: path.resolve(__dirname, '.env')});

const defaultConfig = getDefaultConfig(__dirname);

defaultConfig.transformer = {
  ...defaultConfig.transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer'),
};
defaultConfig.resolver = {
  ...defaultConfig.resolver,
  assetExts: defaultConfig.resolver.assetExts.filter(ext => ext !== 'svg'),
  sourceExts: [...defaultConfig.resolver.sourceExts, 'svg'],
};

const rnwPath = fs.realpathSync(
  path.resolve(require.resolve('react-native-windows/package.json'), '..'),
);

const USE_NATIVE_SVG = process.env.USE_NATIVE_SVG === '1';

const windowsShims = {
  'react-native-screens': path.resolve(
    __dirname,
    'src/shims/react-native-screens.windows.tsx',
  ),
  'react-native-safe-area-context': path.resolve(
    __dirname,
    'src/shims/react-native-safe-area-context.windows.tsx',
  ),
  '@react-native-community/blur': path.resolve(
    __dirname,
    'src/shims/react-native-community-blur.windows.tsx',
  ),
};

if (!USE_NATIVE_SVG) {
  windowsShims['react-native-svg'] = path.resolve(
    __dirname,
    'src/shims/react-native-svg.windows.tsx',
  );
}

const config = {
  resolver: {
    ...defaultConfig.resolver,
    platforms: ['macos', 'ios', 'android', 'windows'],
    blockList: [
      new RegExp(
        `${path.resolve(__dirname, 'windows').replace(/[/\\]/g, '/')}.*`,
      ),
      new RegExp(`${rnwPath.replace(/[/\\]/g, '/')}/build/.*`),
      new RegExp(`${rnwPath.replace(/[/\\]/g, '/')}/target/.*`),
      /.*\.ProjectImports\.zip/,
    ],
    resolveRequest: (context, moduleName, platform) => {
      if (platform === 'macos') {
        const macosModuleName =
          moduleName === 'react-native'
            ? 'react-native-macos'
            : moduleName.startsWith('react-native/')
              ? `react-native-macos/${moduleName.slice('react-native/'.length)}`
              : moduleName;

        try {
          return context.resolveRequest(context, macosModuleName, platform);
        } catch {
          return context.resolveRequest(
            {...context, platform: 'ios'},
            macosModuleName,
            'ios',
          );
        }
      }

      if (platform === 'windows') {
        const origin = (context && context.originModulePath) || '';
        const isFromBlur =
          origin.includes(`${path.sep}node_modules${path.sep}@react-native-community${path.sep}blur${path.sep}`) ||
          origin.includes(`/node_modules/@react-native-community/blur/`);

        for (const [prefix, shimPath] of Object.entries(windowsShims)) {
          if (moduleName === prefix || moduleName.startsWith(`${prefix}/`)) {
            return {
              filePath: shimPath,
              type: 'sourceFile',
            };
          }
        }

        // Some packages (e.g. @react-native-community/blur) publish a generic
        // react-native entry which imports platform-specific files. On Windows
        // they may not exist, causing relative imports to fail. If we are
        // currently resolving a relative import from within the blur package,
        // redirect it to our Windows shim.
        if (isFromBlur && moduleName.startsWith('./components/')) {
          return {
            filePath: windowsShims['@react-native-community/blur'],
            type: 'sourceFile',
          };
        }

        if (
          moduleName.endsWith('ReactDevToolsSettingsManager') ||
          moduleName.includes(
            'rndevtools/ReactDevToolsSettingsManager',
          )
        ) {
          return {
            filePath: path.resolve(
              __dirname,
              'src/shims/ReactDevToolsSettingsManager.windows.js',
            ),
            type: 'sourceFile',
          };
        }

        // react-native-windows is an out-of-tree platform. Its
        // react-native.config declares npmPackageName: 'react-native-windows',
        // so core imports (including react-native's internal getter that does
        // require('./Libraries/Utilities/Platform')) must resolve to RNW.
        // Without this redirect, Platform resolves to undefined and the app
        // aborts with "Cannot read property 'OS' of undefined".
        const rnwModuleName =
          moduleName === 'react-native'
            ? 'react-native-windows'
            : moduleName.startsWith('react-native/')
              ? `react-native-windows/${moduleName.slice(
                  'react-native/'.length,
                )}`
              : null;

        if (rnwModuleName) {
          return context.resolveRequest(context, rnwModuleName, platform);
        }
      }

      return context.resolveRequest(context, moduleName, platform);
    },
  },
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
};

module.exports = mergeConfig(defaultConfig, config);
