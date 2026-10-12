#include "pch.h"
#include "GumpKeyboard.h"

namespace GumpDesktop {
namespace {

GumpKeyboard *g_instance = nullptr;
HWND g_targetHwnd = nullptr;
HHOOK g_keyboardHook = nullptr;

bool IsTargetWindowForeground() noexcept {
  if (!g_targetHwnd || !IsWindow(g_targetHwnd)) {
    return false;
  }
  const HWND foreground = GetForegroundWindow();
  if (!foreground) {
    return false;
  }
  return foreground == g_targetHwnd || IsChild(g_targetHwnd, foreground);
}

void EmitIfArrowKey(DWORD vkCode) noexcept {
  if (!g_instance) {
    return;
  }
  if (vkCode == VK_LEFT) {
    g_instance->EmitKeyDown("ArrowLeft");
  } else if (vkCode == VK_RIGHT) {
    g_instance->EmitKeyDown("ArrowRight");
  }
}

LRESULT CALLBACK LowLevelKeyboardProc(int nCode, WPARAM wParam, LPARAM lParam) {
  if (nCode == HC_ACTION && (wParam == WM_KEYDOWN || wParam == WM_SYSKEYDOWN)) {
    const auto *info = reinterpret_cast<KBDLLHOOKSTRUCT *>(lParam);
    if (info && IsTargetWindowForeground()) {
      EmitIfArrowKey(info->vkCode);
    }
  }
  return CallNextHookEx(g_keyboardHook, nCode, wParam, lParam);
}

void EnsureKeyboardHook() noexcept {
  if (g_keyboardHook) {
    return;
  }
  g_keyboardHook =
      SetWindowsHookExW(WH_KEYBOARD_LL, LowLevelKeyboardProc, GetModuleHandleW(nullptr), 0);
}

} // namespace

void GumpKeyboard::Initialize(
    winrt::Microsoft::ReactNative::ReactContext const &context) noexcept {
  m_context = context;
  g_instance = this;
  // Hook must be installed on the WinMain UI thread (see SetKeyboardTargetHwnd),
  // not here — WH_KEYBOARD_LL callbacks require that thread's message loop.
}

void GumpKeyboard::EmitKeyDown(const char *code) noexcept {
  if (!m_context || !code) {
    return;
  }
  m_context.EmitJSEvent(
      L"RCTDeviceEventEmitter",
      L"gumpKeyDown",
      winrt::Microsoft::ReactNative::JSValueObject{
          {"code", code},
      });
}

void SetKeyboardTargetHwnd(HWND hwnd) noexcept {
  g_targetHwnd = hwnd;
  // Install on the UI thread that owns the Win32 message pump.
  EnsureKeyboardHook();
}

} // namespace GumpDesktop
