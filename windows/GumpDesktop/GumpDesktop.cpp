// GumpDesktop.cpp : Defines the entry point for the application.
//

#include "pch.h"
#include "GumpDesktop.h"

#include "resource.h"

#include "AutolinkedNativeModules.g.h"

#include "NativeModules.h"

namespace {
// Keep original Win32 WndProc so we can delegate messages.
static WNDPROC g_originalWndProc{nullptr};

// 60% of the monitor *work area* (excludes taskbar).
static constexpr double kMinSizeRatio = 0.60;

static SIZE GetMonitorWorkAreaSizePx(HWND hwnd) noexcept {
  MONITORINFO mi{};
  mi.cbSize = sizeof(mi);
  const HMONITOR monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
  if (monitor && GetMonitorInfo(monitor, &mi)) {
    const LONG w = (mi.rcWork.right - mi.rcWork.left);
    const LONG h = (mi.rcWork.bottom - mi.rcWork.top);
    return SIZE{w > 0 ? w : 0, h > 0 ? h : 0};
  }

  // Fallback: primary screen size.
  const int w = GetSystemMetrics(SM_CXSCREEN);
  const int h = GetSystemMetrics(SM_CYSCREEN);
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

static winrt::Windows::Graphics::SizeInt32 GetInitialSizePx(HWND hwnd) noexcept {
  const SIZE workArea = GetMonitorWorkAreaSizePx(hwnd);
  // Default size: 100% of work area.
  const int32_t w = workArea.cx > 0 ? static_cast<int32_t>(workArea.cx) : 1000;
  const int32_t h = workArea.cy > 0 ? static_cast<int32_t>(workArea.cy) : 800;
  return winrt::Windows::Graphics::SizeInt32{w, h};
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
  static constexpr PCWSTR kModuleDlls[] = {L"RNSVG.dll", L"ReactNativeAsyncStorage.dll"};
  for (PCWSTR dllName : kModuleDlls) {
    if (TryLoadDllFromDirectory(appDirectory, dllName)) {
      continue;
    }
    TryLoadDllFromWindowsBuildOutputs(dllName);
  }
}
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
  // Initialize WinRT
  winrt::init_apartment(winrt::apartment_type::single_threaded);

  // Enable per monitor DPI scaling
  SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

  // Find the path hosting the app exe file
  WCHAR appDirectory[MAX_PATH];
  GetModuleFileNameW(NULL, appDirectory, MAX_PATH);
  PathCchRemoveFileSpec(appDirectory, MAX_PATH);

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
  // Set the path (on disk) where the .bundle file is located
  settings.BundleRootPath(std::wstring(L"file://").append(appDirectory).append(L"\\Bundle\\").c_str());
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
    appWindow.Resize(GetInitialSizePx(hwnd));
  } else {
    appWindow.Resize({1000, 800});
  }

  // Get the ReactViewOptions so we can set the initial RN component to load
  auto viewOptions{reactNativeWin32App.ReactViewOptions()};
  viewOptions.ComponentName(L"GumpDesktop");

  // Start the app
  reactNativeWin32App.Start();
}
