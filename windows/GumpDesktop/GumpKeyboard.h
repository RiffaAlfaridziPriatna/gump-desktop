#pragma once

#include "pch.h"

#include <NativeModules.h>

namespace GumpDesktop {

/**
 * Windows New Architecture does not expose UIManager.focus (iOS-only), so View
 * onKeyDown never fires. This module bridges Left/Right arrow keys from a
 * low-level keyboard hook while our window is foreground.
 */
REACT_MODULE(GumpKeyboard, L"GumpKeyboard");
struct GumpKeyboard {
  REACT_INIT(Initialize);
  void Initialize(winrt::Microsoft::ReactNative::ReactContext const &context) noexcept;

  void EmitKeyDown(const char *code) noexcept;

 private:
  winrt::Microsoft::ReactNative::ReactContext m_context{nullptr};
};

void SetKeyboardTargetHwnd(HWND hwnd) noexcept;

} // namespace GumpDesktop
