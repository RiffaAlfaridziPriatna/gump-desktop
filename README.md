# Gump Desktop

Desktop-first React Native macOS app for Gump — a photo/album platform.

## Quick Start

```bash
# Install JS dependencies
npm install

# Install native pods (macOS)
cd macos && LANG=en_US.UTF-8 pod install && cd ..

# Terminal 1: Metro bundler
npm run start

# Terminal 2: build and launch macOS app
npm run macos
```

If `pod install` fails fetching Hermes (network/DNS), download the tarball once and retry:

```bash
curl -L -o /tmp/hermes-ios-debug.tar.gz \
  https://repo1.maven.org/maven2/com/facebook/react/react-native-artifacts/0.81.6/react-native-artifacts-0.81.6-hermes-ios-debug.tar.gz
HERMES_ENGINE_TARBALL_PATH=/tmp/hermes-ios-debug.tar.gz pod install
```

## Architecture Decisions

### Desktop-First

This app targets macOS as the primary platform using `react-native-macos` (Microsoft's official fork). It is NOT an Expo app and does NOT use mobile-first navigation patterns.

### Why Not Expo Router

Expo Router requires `react-native-screens` which has no macOS native module. It also forces mobile navigation patterns (stack-based push/pop) that don't suit desktop UX.

### New Architecture Disabled

The New Architecture (Fabric) is disabled on macOS (`RCT_NEW_ARCH_ENABLED=0` in Podfile and `.xcode.env`). With Fabric enabled, codegen registers components from packages like `react-native-screens` that have no macOS native module — `NSClassFromString` returns nil and the app aborts in `RCTThirdPartyComponentsProvider`.

A post-install patch (`macos/scripts/patch_third_party_fabric_components.rb`) filters nil Fabric registrations as a safety net if codegen runs again.

### Navigation

Uses `@react-navigation/stack` (JS-based transitions, no native-stack) with simple auth gating:
- Unauthenticated → AuthNavigator (login screen)
- Authenticated → MainNavigator (home screen)

### State Management

- **DI**: tsyringe with reflect-metadata (babel plugin for decorator emission)
- **Auth state**: Zustand + Immer store wrapped in React Context
- **Token storage**: `@react-native-async-storage/async-storage` (has macOS podspec)

### API

Fetch-based client hitting `https://api.gump.app` with Bearer token auth. Resources: `auth.login`, `auth.getCurrentUser`, `user.getAlbums`.

## Version Matrix

| Package | Version | Notes |
|---------|---------|-------|
| react-native | 0.81.6 | Must match react-native-macos peer dep |
| react-native-macos | 0.81.7 | Latest stable (Apr 2026) |
| react | 19.1.4 | Peer dep of RN-macOS |
| @react-navigation/stack | 7.x | JS stack (NOT native-stack) |
| react-native-gesture-handler | 3.x | Has macOS podspec |
| react-native-safe-area-context | 5.x | Has macOS podspec |
| @react-native-async-storage/async-storage | 3.x | Has macOS podspec |
| zustand | 5.x | Pure JS |
| tsyringe | 4.10.0 | Pure JS |

## Dependency macOS Support

| Dependency | macOS Support | Notes |
|-----------|--------------|-------|
| react-native-macos | Native | The runtime itself |
| react-native-gesture-handler | Native podspec | Required by navigation |
| react-native-safe-area-context | Native podspec | Required by navigation |
| @react-native-async-storage/async-storage | Native podspec | Token storage |
| react-native-screens | NO | Excluded from macOS autolinking |
| zustand | Pure JS | No native deps |
| tsyringe + reflect-metadata | Pure JS | No native deps |
| immer | Pure JS | No native deps |

## Scripts

| Script | Description |
|--------|-------------|
| `npm run start` | Start Metro bundler |
| `npm run macos` | Build and run macOS app |
| `npm run typecheck` | Run TypeScript compiler check |
| `npm run ios` | Build and run iOS (future) |
| `npm run android` | Build and run Android (future) |

## Project Structure

```
src/
├── app/               Root shell, navigators, auth gate
├── screens/           LoginScreen, HomeScreen
├── components/ui/     Button, TextInput
├── context/           Auth Zustand store + React context
├── hooks/             useAuth re-export
├── lib/               DI, token storage, state helpers
└── services/api/      APIService, resources, types
```

## Adding iOS/Android Later

1. iOS is already scaffolded (`ios/` folder from RN init). Run `cd ios && pod install`.
2. Android is scaffolded (`android/` folder). Should work with `npm run android`.
3. For token storage on mobile, add `expo-secure-store` and make `authTokenStorage.ts` platform-conditional (Platform.OS check).
4. For mobile navigation, the `@react-navigation/stack` navigators work unchanged.
5. Consider adding `react-native-screens` for iOS/Android performance (it has native support there).

## Known Limitations

- Album grid uses mock data (API `getAlbums` is wired but not called yet)
- Forgot Password button is a stub
- No sidebar yet (single-pane v1)
- Window min size set to 900x600 in AppDelegate
- `react-native-screens` is installed (peer dep of navigation) but excluded from macOS autolinking
