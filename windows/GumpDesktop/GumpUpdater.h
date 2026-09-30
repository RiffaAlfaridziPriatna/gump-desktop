#pragma once

#include "pch.h"

#include <NativeModules.h>

#include <string>

namespace GumpDesktop {

REACT_MODULE(GumpUpdater, L"GumpUpdater");
struct GumpUpdater {
  REACT_INIT(Initialize);
  void Initialize(winrt::Microsoft::ReactNative::ReactContext const &context) noexcept;

  REACT_METHOD(CheckForUpdates, L"checkForUpdates");
  void CheckForUpdates() noexcept;

  REACT_METHOD(RestartToUpdate, L"restartToUpdate");
  void RestartToUpdate() noexcept;

  REACT_METHOD(GetUpdateStatus, L"getUpdateStatus");
  void GetUpdateStatus(
      winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue>
          promise) noexcept;

  void NotifyUpdateFound(std::string version) noexcept;

 private:
  winrt::Microsoft::ReactNative::ReactContext m_context{nullptr};
  bool m_updateReady{false};
  std::string m_pendingVersion;
};

void NotifySharedUpdateFound(std::string version = {}) noexcept;

} // namespace GumpDesktop
