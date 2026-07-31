// GumpDesktop.cpp : Defines the entry point for the application.
//

#include "pch.h"
#include "GumpDesktop.h"

#include "resource.h"

#include "AutolinkedNativeModules.g.h"

#include "NativeModules.h"

#include <appmodel.h>

#if __has_include(<MddBootstrap.h>) && __has_include(<WindowsAppSDK-VersionInfo.h>)
#include <MddBootstrap.h>
#include <WindowsAppSDK-VersionInfo.h>
#define GUMP_HAS_WINDOWSAPPSDK_BOOTSTRAP 1
#else
#define GUMP_HAS_WINDOWSAPPSDK_BOOTSTRAP 0
#endif

namespace {
// Keep original Win32 WndProc so we can delegate messages.
static WNDPROC g_originalWndProc{nullptr};

// 60% of the monitor *work area* (excludes taskbar).
static constexpr double kMinSizeRatio = 0.60;

static bool GetMonitorWorkArea(HWND hwnd, RECT &workArea) noexcept {
  MONITORINFO mi{};
  mi.cbSize = sizeof(mi);
  const HMONITOR monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
  if (monitor && GetMonitorInfo(monitor, &mi)) {
    workArea = mi.rcWork;
    return (workArea.right > workArea.left) && (workArea.bottom > workArea.top);
  }

  // Fallback: primary screen bounds.
  workArea.left = 0;
  workArea.top = 0;
  workArea.right = GetSystemMetrics(SM_CXSCREEN);
  workArea.bottom = GetSystemMetrics(SM_CYSCREEN);
  return workArea.right > 0 && workArea.bottom > 0;
}

static SIZE GetMonitorWorkAreaSizePx(HWND hwnd) noexcept {
  RECT workArea{};
  if (!GetMonitorWorkArea(hwnd, workArea)) {
    return SIZE{0, 0};
  }

  const LONG w = (workArea.right - workArea.left);
  const LONG h = (workArea.bottom - workArea.top);
  return SIZE{w > 0 ? w : 0, h > 0 ? h : 0};
}

static void ApplyMinTrackSize(MINMAXINFO *mmi, HWND hwnd) noexcept {
  if (!mmi || !hwnd) {
    return;
  }

  const SIZE workArea = GetMonitorWorkAreaSizePx(hwnd);
  if (workArea.cx <= 0 || workArea.cy <= 0) {
    return;
  }

  const LONG minW = static_cast<LONG>(workArea.cx * kMinSizeRatio);
  const LONG minH = static_cast<LONG>(workArea.cy * kMinSizeRatio);
  if (minW > 0) {
    mmi->ptMinTrackSize.x = minW;
  }
  if (minH > 0) {
    mmi->ptMinTrackSize.y = minH;
  }
}

static LRESULT CALLBACK MinSizeWndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
  if (msg == WM_GETMINMAXINFO) {
    auto *mmi = reinterpret_cast<MINMAXINFO *>(lParam);
    ApplyMinTrackSize(mmi, hwnd);
  }

  return g_originalWndProc ? CallWindowProc(g_originalWndProc, hwnd, msg, wParam, lParam)
                           : DefWindowProc(hwnd, msg, wParam, lParam);
}

static void InstallMinSizeHook(winrt::Microsoft::UI::Windowing::AppWindow const &appWindow) noexcept {
  // Get HWND from WinUI AppWindow id.
  const auto windowId = appWindow.Id();
  const HWND hwnd = winrt::Microsoft::UI::GetWindowFromWindowId(windowId);
  if (!hwnd) {
    return;
  }

  // Install only once.
  if (!g_originalWndProc) {
    g_originalWndProc =
        reinterpret_cast<WNDPROC>(SetWindowLongPtr(hwnd, GWLP_WNDPROC, reinterpret_cast<LONG_PTR>(&MinSizeWndProc)));
  }

  // Force a re-evaluation of min/max constraints.
  SetWindowPos(hwnd, nullptr, 0, 0, 0, 0,
               SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED);
}

static HWND GetHwnd(winrt::Microsoft::UI::Windowing::AppWindow const &appWindow) noexcept {
  const auto windowId = appWindow.Id();
  return winrt::Microsoft::UI::GetWindowFromWindowId(windowId);
}

static void ApplyWindowIcons(HWND hwnd, HINSTANCE hInstance) noexcept {
  if (!hwnd || !hInstance) {
    return;
  }

  // Load the app icon from resources and apply to the native window. This
  // ensures the title bar shows the correct icon even when running via the
  // packaged AppX launcher.
  const HICON iconSmall = reinterpret_cast<HICON>(LoadImageW(
      hInstance, MAKEINTRESOURCEW(IDI_ICON1), IMAGE_ICON, GetSystemMetrics(SM_CXSMICON),
      GetSystemMetrics(SM_CYSMICON), LR_DEFAULTCOLOR));

  const HICON iconBig = reinterpret_cast<HICON>(LoadImageW(
      hInstance, MAKEINTRESOURCEW(IDI_ICON1), IMAGE_ICON, GetSystemMetrics(SM_CXICON), GetSystemMetrics(SM_CYICON),
      LR_DEFAULTCOLOR));

  if (iconSmall) {
    SendMessageW(hwnd, WM_SETICON, ICON_SMALL, reinterpret_cast<LPARAM>(iconSmall));
  }
  if (iconBig) {
    SendMessageW(hwnd, WM_SETICON, ICON_BIG, reinterpret_cast<LPARAM>(iconBig));
  }
}

static void ApplyInitialWindowPlacement(
    winrt::Microsoft::UI::Windowing::AppWindow const &appWindow, HWND hwnd) noexcept {
  RECT workArea{};
  if (!GetMonitorWorkArea(hwnd, workArea)) {
    appWindow.Resize({1000, 800});
    return;
  }

  const int32_t w = static_cast<int32_t>(workArea.right - workArea.left);
  const int32_t h = static_cast<int32_t>(workArea.bottom - workArea.top);
  // Default: top-left of work area, 100% size.
  appWindow.Move({workArea.left, workArea.top});
  appWindow.Resize({w, h});
}

static PCWSTR FindSubpath(PCWSTR haystack, PCWSTR needle) noexcept {
  const size_t needleLength = wcslen(needle);
  for (PCWSTR cursor = haystack; *cursor != L'\0'; ++cursor) {
    if (_wcsnicmp(cursor, needle, needleLength) == 0) {
      return cursor;
    }
  }
  return nullptr;
}

static bool TryLoadDllFromDirectory(PCWSTR directory, PCWSTR dllName) noexcept {
  if (!directory || !dllName) {
    return false;
  }

  WCHAR dllPath[MAX_PATH];
  if (FAILED(PathCchCombine(dllPath, MAX_PATH, directory, dllName))) {
    return false;
  }

  if (GetFileAttributesW(dllPath) == INVALID_FILE_ATTRIBUTES) {
    return false;
  }

  return LoadLibraryW(dllPath) != nullptr;
}

static void TryLoadDllFromWindowsBuildOutputs(PCWSTR dllName) noexcept {
  WCHAR modulePath[MAX_PATH];
  if (GetModuleFileNameW(NULL, modulePath, MAX_PATH) == 0) {
    return;
  }

  PCWSTR windowsPos = FindSubpath(modulePath, L"\\windows\\");
  if (!windowsPos) {
    return;
  }

  const size_t windowsDirLength = static_cast<size_t>(windowsPos - modulePath) + 8;
  if (windowsDirLength >= MAX_PATH) {
    return;
  }

  WCHAR windowsDir[MAX_PATH];
  wmemcpy(windowsDir, modulePath, windowsDirLength);
  windowsDir[windowsDirLength] = L'\0';

  static constexpr PCWSTR kPlatforms[] = {L"ARM64", L"x64", L"Win32"};
  static constexpr PCWSTR kConfigs[] = {L"Debug", L"Release"};
  for (PCWSTR platform : kPlatforms) {
    for (PCWSTR config : kConfigs) {
      WCHAR buildDir[MAX_PATH];
      if (FAILED(PathCchCombine(buildDir, MAX_PATH, windowsDir, platform))) {
        continue;
      }
      if (FAILED(PathCchAppend(buildDir, MAX_PATH, config))) {
        continue;
      }
      if (TryLoadDllFromDirectory(buildDir, dllName)) {
        return;
      }
    }
  }
}

static void PreloadAutolinkedModuleDlls(PCWSTR appDirectory) noexcept {
  static constexpr PCWSTR kModuleDlls[] = {
      L"RNSVG.dll",
      L"ReactNativeAsyncStorage.dll",
      L"ReactNativeTurboSqlite.dll",
  };
  for (PCWSTR dllName : kModuleDlls) {
    if (TryLoadDllFromDirectory(appDirectory, dllName)) {
      continue;
    }
    TryLoadDllFromWindowsBuildOutputs(dllName);
  }
}

static void RegisterCustomFonts(PCWSTR appDirectory) noexcept {
  static constexpr PCWSTR kFontFiles[] = {
      L"DMSerifDisplay-Regular.ttf",
      L"RedHatDisplay-Regular.ttf",
      L"RedHatDisplay-Medium.ttf",
      L"RedHatDisplay-Bold.ttf",
  };

  const std::filesystem::path fontsDir =
      std::filesystem::path(appDirectory) / L"Assets" / L"Fonts";

  for (PCWSTR fileName : kFontFiles) {
    const std::filesystem::path fontPath = fontsDir / fileName;
    if (!std::filesystem::exists(fontPath)) {
      continue;
    }
    AddFontResourceExW(fontPath.c_str(), 0, nullptr);
  }
}

static void ShowStartupError(PCWSTR title, PCWSTR message) noexcept {
  MessageBoxW(nullptr, message, title, MB_OK | MB_ICONERROR);
}

static bool IsRunningAsPackagedApp() noexcept {
  UINT32 length = 0;
  return GetCurrentPackageFullName(&length, nullptr) != APPMODEL_ERROR_NO_PACKAGE;
}

// AsyncStorage's Windows native module defaults to ApplicationData::Current(),
// which only exists for packaged (MSIX) apps. For unpackaged/portable builds it
// fails to open the DB and never invokes the JS callback — AuthProvider then
// stays on isLoading forever. Point it at a real LocalAppData path instead.
static void ConfigureUnpackagedAsyncStoragePath() noexcept {
  if (IsRunningAsPackagedApp()) {
    return;
  }

  try {
    PWSTR localAppData = nullptr;
    const HRESULT hr = SHGetKnownFolderPath(FOLDERID_LocalAppData, 0, nullptr, &localAppData);
    if (FAILED(hr) || localAppData == nullptr) {
      return;
    }

    const std::filesystem::path dbDir =
        std::filesystem::path(localAppData) / L"GumpDesktop";
    CoTaskMemFree(localAppData);

    std::error_code ec;
    std::filesystem::create_directories(dbDir, ec);
    const std::wstring dbPath = (dbDir / L"AsyncStorage.db").wstring();

    auto properties =
        winrt::Windows::ApplicationModel::Core::CoreApplication::Properties();
    const auto key = winrt::hstring{
        L"React-Native-Community-Async-Storage-Database-Path"};
    if (properties.HasKey(key)) {
      properties.Remove(key);
    }
    properties.Insert(key, winrt::box_value(winrt::hstring{dbPath}));
  } catch (...) {
    // If this fails, AsyncStorage will still hang/error later; prefer continuing
    // startup so other diagnostics can surface.
  }
}

static std::wstring ToBundleRootFileUri(PCWSTR appDirectory) {
  // Windows file URIs need file:///C:/path/ form, not file://C:\path\.
  std::wstring path(appDirectory);
  for (wchar_t &ch : path) {
    if (ch == L'\\') {
      ch = L'/';
    }
  }
  return std::wstring(L"file:///") + path + L"/Bundle/";
}

static bool EnsureReleaseBundlePresent(PCWSTR appDirectory) noexcept {
#if !BUNDLE
  return true;
#else
  const std::filesystem::path bundlePath =
      std::filesystem::path(appDirectory) / L"Bundle" / L"index.windows.bundle";
  if (std::filesystem::exists(bundlePath)) {
    return true;
  }

  ShowStartupError(
      L"GUMP Desktop",
      L"Release JS bundle is missing.\n\n"
      L"Expected:\n"
      L"  Bundle\\index.windows.bundle\n"
      L"next to GumpDesktop.exe.\n\n"
      L"Rebuild with: npm run build:windows");
  return false;
#endif
}

#if GUMP_HAS_WINDOWSAPPSDK_BOOTSTRAP
struct WindowsAppSdkBootstrap {
  bool initialized{false};

  static UINT32 ResolveReleaseMajorMinor() noexcept {
#if defined(WINDOWSAPPSDK_RELEASE_MAJORMINOR)
    return WINDOWSAPPSDK_RELEASE_MAJORMINOR;
#elif defined(WINDOWSAPPSDK_RELEASE_VERSION_MAJORMINOR)
    return WINDOWSAPPSDK_RELEASE_VERSION_MAJORMINOR;
#elif defined(WINDOWSAPPSDK_RELEASE_MAJOR) && defined(WINDOWSAPPSDK_RELEASE_MINOR)
    return (static_cast<UINT32>(WINDOWSAPPSDK_RELEASE_MAJOR) << 16) |
           static_cast<UINT32>(WINDOWSAPPSDK_RELEASE_MINOR);
#else
    // Pinned project WinUI3Version: 1.7.250401001
    return 0x00010007u;
#endif
  }

  static PCWSTR ResolveReleaseVersionTag() noexcept {
#if defined(WINDOWSAPPSDK_RELEASE_VERSION_TAG_W)
    return WINDOWSAPPSDK_RELEASE_VERSION_TAG_W;
#else
    return L"";
#endif
  }

  static PACKAGE_VERSION ResolveMinRuntimeVersion() noexcept {
    PACKAGE_VERSION minVersion{};
#if defined(WINDOWSAPPSDK_RUNTIME_VERSION_UINT64)
    minVersion.Version = WINDOWSAPPSDK_RUNTIME_VERSION_UINT64;
#else
    minVersion.Version = 0;
#endif
    return minVersion;
  }

  bool TryInitialize() {
    if (IsRunningAsPackagedApp()) {
      // MSIX already declares the Windows App SDK framework dependency.
      return true;
    }

    // Unpackaged/portable builds must bootstrap the runtime or WinUI/RN
    // Composition APIs fail immediately (often with no visible window).
    const HRESULT hr = MddBootstrapInitialize2(
        ResolveReleaseMajorMinor(),
        ResolveReleaseVersionTag(),
        ResolveMinRuntimeVersion(),
        MddBootstrapInitializeOptions_None);
    if (FAILED(hr)) {
      wchar_t message[768];
      swprintf_s(
          message,
          L"Failed to initialize Windows App SDK runtime (HRESULT=0x%08X).\n\n"
          L"Install \"Windows App Runtime\" 1.7 (matching this build), then retry.\n"
          L"Archive download:\n"
          L"https://aka.ms/windowsappsdk/1.7/1.7.250401001/windowsappruntimeinstall-x64.exe\n\n"
          L"Packaged MSIX installs do not need this step.",
          static_cast<unsigned>(hr));
      ShowStartupError(L"GUMP Desktop", message);
      return false;
    }

    initialized = true;
    return true;
  }

  ~WindowsAppSdkBootstrap() {
    if (initialized) {
      MddBootstrapShutdown();
    }
  }
};
#else
struct WindowsAppSdkBootstrap {
  bool TryInitialize() {
    if (IsRunningAsPackagedApp()) {
      return true;
    }
    ShowStartupError(
        L"GUMP Desktop",
        L"This portable build was compiled without Windows App SDK bootstrap "
        L"headers. Rebuild on a machine with Microsoft.WindowsAppSDK 1.7 restored.");
    return false;
  }
};
#endif
} // namespace

// A PackageProvider containing any turbo modules you define within this app project
struct CompReactPackageProvider
    : winrt::implements<CompReactPackageProvider, winrt::Microsoft::ReactNative::IReactPackageProvider> {
 public: // IReactPackageProvider
  void CreatePackage(winrt::Microsoft::ReactNative::IReactPackageBuilder const &packageBuilder) noexcept {
    AddAttributedModules(packageBuilder, true);
  }
};

// The entry point of the Win32 application
_Use_decl_annotations_ int CALLBACK WinMain(HINSTANCE instance, HINSTANCE, PSTR /* commandLine */, int showCmd) {
  WindowsAppSdkBootstrap windowsAppSdk;
  if (!windowsAppSdk.TryInitialize()) {
    return 1;
  }

  ConfigureUnpackagedAsyncStoragePath();

  try {
    // Initialize WinRT
    winrt::init_apartment(winrt::apartment_type::single_threaded);

    // Enable per monitor DPI scaling
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

    // Find the path hosting the app exe file
    WCHAR appDirectory[MAX_PATH];
    GetModuleFileNameW(NULL, appDirectory, MAX_PATH);
    PathCchRemoveFileSpec(appDirectory, MAX_PATH);
    if (!EnsureReleaseBundlePresent(appDirectory)) {
      return 1;
    }
    RegisterCustomFonts(appDirectory);

    // Create a ReactNativeWin32App with the ReactNativeAppBuilder
    auto reactNativeWin32App{winrt::Microsoft::ReactNative::ReactNativeAppBuilder().Build()};

    // Configure the initial InstanceSettings for the app's ReactNativeHost
    auto settings{reactNativeWin32App.ReactNativeHost().InstanceSettings()};
    // Ensure autolinked WinRT module DLLs are loaded before package registration.
    PreloadAutolinkedModuleDlls(appDirectory);
    // Register any autolinked native modules
    RegisterAutolinkedNativeModulePackages(settings.PackageProviders());
    // Register any native modules defined within this app project
    settings.PackageProviders().Append(winrt::make<CompReactPackageProvider>());

#if BUNDLE
    // Load the JS bundle from a file (not Metro):
    settings.BundleRootPath(ToBundleRootFileUri(appDirectory).c_str());
    // Set the name of the bundle file (without the .bundle extension)
    settings.JavaScriptBundleFile(L"index.windows");
    // Disable hot reload
    settings.UseFastRefresh(false);
#else
    // Load the JS bundle from Metro
    settings.JavaScriptBundleFile(L"index");
    settings.DebugBundlePath(L"index");
    // Enable hot reload
    settings.UseFastRefresh(true);
#endif
#if _DEBUG
    // Direct debugger can crash new-arch RNW on ARM64; keep dev menu only.
    settings.UseDirectDebugger(false);
    // Enable the Developer Menu
    settings.UseDeveloperSupport(true);
#else
    // For Release builds:
    // Disable Direct Debugging of JS
    settings.UseDirectDebugger(false);
    // Disable the Developer Menu
    settings.UseDeveloperSupport(false);
#endif

    // Get the AppWindow so we can configure its initial title and size
    auto appWindow{reactNativeWin32App.AppWindow()};
    appWindow.Title(L"GUMP - Cull Your Photos");
    InstallMinSizeHook(appWindow);
    if (const HWND hwnd = GetHwnd(appWindow)) {
      ApplyWindowIcons(hwnd, instance);
      ApplyInitialWindowPlacement(appWindow, hwnd);
    } else {
      appWindow.Resize({1000, 800});
    }

    // Get the ReactViewOptions so we can set the initial RN component to load
    auto viewOptions{reactNativeWin32App.ReactViewOptions()};
    viewOptions.ComponentName(L"GumpDesktop");

    // Start the app
    reactNativeWin32App.Start();
    return 0;
  } catch (winrt::hresult_error const &ex) {
    wchar_t message[1024];
    swprintf_s(
        message,
        L"GUMP Desktop failed to start.\n\nHRESULT=0x%08X\n%s",
        static_cast<unsigned>(ex.code()),
        ex.message().c_str());
    ShowStartupError(L"GUMP Desktop", message);
    return 1;
  } catch (std::exception const &ex) {
    wchar_t message[1024];
    swprintf_s(message, L"GUMP Desktop failed to start.\n\n%hs", ex.what());
    ShowStartupError(L"GUMP Desktop", message);
    return 1;
  } catch (...) {
    ShowStartupError(L"GUMP Desktop", L"GUMP Desktop failed to start (unknown error).");
    return 1;
  }
}
