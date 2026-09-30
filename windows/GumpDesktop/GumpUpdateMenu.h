#pragma once

#include "pch.h"

namespace GumpDesktop {

/** WinSparkle + native "GUMP" menu (Check for Updates / Restart to Update). Prod only. */
struct GumpUpdateMenu {
  static void Bootstrap(HWND hwnd) noexcept;
  static bool HandleWindowMessage(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) noexcept;
  static void CheckForUpdates() noexcept;
  static void RestartToUpdate() noexcept;
  static bool IsUpdateReady() noexcept;
};

} // namespace GumpDesktop
