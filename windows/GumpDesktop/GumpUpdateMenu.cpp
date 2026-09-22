#include "pch.h"
#include "GumpUpdateMenu.h"
#include "GumpUpdater.h"
#include "GumpVersion.h"
#include "resource.h"

#include "winsparkle.h"

#include <shellapi.h>

#include <string>

namespace GumpDesktop {
namespace {

constexpr UINT WM_GUMP_UPDATE_MENU = WM_APP + 41;
constexpr int kUpdateCheckIntervalSeconds = 14400; // match macOS SUScheduledCheckInterval

// Same EdDSA public key as macOS Info.plist SUPublicEDKey.
constexpr char kEdDsaPublicKey[] = "VeDFFxhbxJDv7T2PLITqeemS3ccGhXjooGJW9bO7Nw8=";

enum class UpdateMenuState {
  Idle,
  Checking,
  Downloading,
  Ready,
};

HWND g_hwnd = nullptr;
HMENU g_menuBar = nullptr;
HMENU g_appMenu = nullptr;
UpdateMenuState g_menuState = UpdateMenuState::Idle;
bool g_updateReady = false;
std::wstring g_pendingInstallerPath;

#if GUMP_UPDATES_ENABLED

void ApplyMenuTitle() noexcept {
  if (!g_appMenu) {
    return;
  }

  UINT enable = MF_BYCOMMAND | MF_ENABLED;
  const wchar_t *title = L"Check for Updates...";

  switch (g_menuState) {
    case UpdateMenuState::Checking:
      title = L"Checking for Updates...";
      enable = MF_BYCOMMAND | MF_GRAYED | MF_DISABLED;
      break;
    case UpdateMenuState::Downloading:
      title = L"Downloading Update...";
      enable = MF_BYCOMMAND | MF_GRAYED | MF_DISABLED;
      break;
    case UpdateMenuState::Ready:
      title = L"Restart to Update";
      enable = MF_BYCOMMAND | MF_ENABLED;
      break;
    case UpdateMenuState::Idle:
    default:
      title = L"Check for Updates...";
      enable = MF_BYCOMMAND | MF_ENABLED;
      break;
  }

  // Single menu item: rewrite the Check command in place (also used when Ready).
  ModifyMenuW(g_appMenu, IDM_CHECK_FOR_UPDATES, MF_BYCOMMAND | MF_STRING, IDM_CHECK_FOR_UPDATES, title);
  EnableMenuItem(g_appMenu, IDM_CHECK_FOR_UPDATES, enable);
  if (g_hwnd) {
    DrawMenuBar(g_hwnd);
  }
}

void SetMenuState(UpdateMenuState state) noexcept {
  g_menuState = state;
  g_updateReady = (state == UpdateMenuState::Ready);
  if (g_hwnd) {
    PostMessageW(g_hwnd, WM_GUMP_UPDATE_MENU, static_cast<WPARAM>(state), 0);
  } else {
    ApplyMenuTitle();
  }
}

void OnDidFindUpdate() {
  if (g_menuState != UpdateMenuState::Ready) {
    SetMenuState(UpdateMenuState::Downloading);
  }
  NotifySharedUpdateFound("");
}

void OnDidNotFindUpdate() {
  if (g_menuState != UpdateMenuState::Ready) {
    SetMenuState(UpdateMenuState::Idle);
  }
}

void OnUpdateCancelled() {
  g_pendingInstallerPath.clear();
  if (g_menuState != UpdateMenuState::Ready) {
    SetMenuState(UpdateMenuState::Idle);
  }
}

void OnError() {
  g_pendingInstallerPath.clear();
  SetMenuState(UpdateMenuState::Idle);
}

int __cdecl OnCanShutdown() {
  return 1;
}

void __cdecl OnShutdownRequest() {
  if (g_hwnd) {
    PostMessageW(g_hwnd, WM_CLOSE, 0, 0);
  } else {
    PostQuitMessage(0);
  }
}

// Fired when the update payload is downloaded and ready to run.
// Return 1 = we handle install later via "Restart to Update".
int __cdecl OnUserRunInstaller(const wchar_t *path) {
  if (path != nullptr && path[0] != L'\0') {
    g_pendingInstallerPath = path;
  }
  SetMenuState(UpdateMenuState::Ready);
  NotifySharedUpdateFound("");
  return 1;
}

HMENU BuildMenuBar() noexcept {
  HMENU appMenu = CreatePopupMenu();
  if (!appMenu) {
    return nullptr;
  }

  AppendMenuW(appMenu, MF_STRING, IDM_CHECK_FOR_UPDATES, L"Check for Updates...");

  HMENU menuBar = CreateMenu();
  if (!menuBar) {
    DestroyMenu(appMenu);
    return nullptr;
  }

  AppendMenuW(menuBar, MF_POPUP, reinterpret_cast<UINT_PTR>(appMenu), L"GUMP");
  g_appMenu = appMenu;
  return menuBar;
}

void InstallMenu(HWND hwnd) noexcept {
  if (!hwnd || g_menuBar) {
    return;
  }

  g_menuBar = BuildMenuBar();
  if (!g_menuBar) {
    return;
  }

  SetMenu(hwnd, g_menuBar);
  DrawMenuBar(hwnd);
  ApplyMenuTitle();
}

void LaunchPendingInstallerAndQuit() noexcept {
  if (!g_pendingInstallerPath.empty()) {
    ShellExecuteW(
        nullptr,
        L"open",
        g_pendingInstallerPath.c_str(),
        nullptr,
        nullptr,
        SW_SHOWNORMAL);
  }
  if (g_hwnd) {
    PostMessageW(g_hwnd, WM_CLOSE, 0, 0);
  } else {
    PostQuitMessage(0);
  }
}

#endif // GUMP_UPDATES_ENABLED

} // namespace

void GumpUpdateMenu::Bootstrap(HWND hwnd) noexcept {
#if GUMP_UPDATES_ENABLED
  g_hwnd = hwnd;
  InstallMenu(hwnd);

  win_sparkle_set_appcast_url(
      "https://raw.githubusercontent.com/RiffaAlfaridziPriatna/gump-desktop/main/appcast.xml");
  win_sparkle_set_app_details(L"Gump", L"GUMP Desktop", GUMP_APP_VERSION_STR);
  win_sparkle_set_eddsa_public_key(kEdDsaPublicKey);
  win_sparkle_set_automatic_check_for_updates(1);
  win_sparkle_set_update_check_interval(kUpdateCheckIntervalSeconds);
  win_sparkle_set_did_find_update_callback(&OnDidFindUpdate);
  win_sparkle_set_did_not_find_update_callback(&OnDidNotFindUpdate);
  win_sparkle_set_update_cancelled_callback(&OnUpdateCancelled);
  win_sparkle_set_error_callback(&OnError);
  win_sparkle_set_user_run_installer_callback(&OnUserRunInstaller);
  win_sparkle_set_can_shutdown_callback(&OnCanShutdown);
  win_sparkle_set_shutdown_request_callback(&OnShutdownRequest);
  win_sparkle_init();
#else
  (void)hwnd;
#endif
}

bool GumpUpdateMenu::HandleWindowMessage(
    HWND hwnd, UINT msg, WPARAM wParam, LPARAM /*lParam*/) noexcept {
#if GUMP_UPDATES_ENABLED
  switch (msg) {
    case WM_GUMP_UPDATE_MENU:
      ApplyMenuTitle();
      return true;
    case WM_COMMAND:
      if (LOWORD(wParam) == IDM_CHECK_FOR_UPDATES) {
        if (g_menuState == UpdateMenuState::Ready) {
          RestartToUpdate();
        } else if (g_menuState == UpdateMenuState::Idle) {
          CheckForUpdates();
        }
        return true;
      }
      break;
    default:
      break;
  }
#else
  (void)hwnd;
  (void)msg;
  (void)wParam;
#endif
  return false;
}

void GumpUpdateMenu::CheckForUpdates() noexcept {
#if GUMP_UPDATES_ENABLED
  if (g_menuState != UpdateMenuState::Idle) {
    return;
  }
  // Prefer without_ui so progress is reflected in the menu (WinSparkle may
  // still show its own window when an update is found — library limitation).
  SetMenuState(UpdateMenuState::Checking);
  win_sparkle_check_update_without_ui();
#endif
}

void GumpUpdateMenu::RestartToUpdate() noexcept {
#if GUMP_UPDATES_ENABLED
  LaunchPendingInstallerAndQuit();
#endif
}

bool GumpUpdateMenu::IsUpdateReady() noexcept {
#if GUMP_UPDATES_ENABLED
  return g_updateReady;
#else
  return false;
#endif
}

} // namespace GumpDesktop
