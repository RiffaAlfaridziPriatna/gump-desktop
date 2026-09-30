#include "pch.h"
#include "GumpUpdater.h"
#include "GumpUpdateMenu.h"
#include "GumpVersion.h"

namespace GumpDesktop {
namespace {

GumpUpdater *g_instance = nullptr;

constexpr bool UpdatesEnabled() noexcept {
#if GUMP_UPDATES_ENABLED
  return true;
#else
  return false;
#endif
}

} // namespace

void GumpUpdater::Initialize(
    winrt::Microsoft::ReactNative::ReactContext const &context) noexcept {
  m_context = context;
  g_instance = this;
  m_updateReady = GumpUpdateMenu::IsUpdateReady();
}

void GumpUpdater::NotifyUpdateFound(std::string version) noexcept {
  if (!UpdatesEnabled()) {
    return;
  }
  m_updateReady = true;
  if (!version.empty()) {
    m_pendingVersion = std::move(version);
  }
  if (!m_context) {
    return;
  }
  m_context.EmitJSEvent(
      L"RCTDeviceEventEmitter",
      L"updateReady",
      winrt::Microsoft::ReactNative::JSValueObject{
          {"version", m_pendingVersion},
      });
}

void GumpUpdater::CheckForUpdates() noexcept {
  GumpUpdateMenu::CheckForUpdates();
}

void GumpUpdater::RestartToUpdate() noexcept {
  GumpUpdateMenu::RestartToUpdate();
}

void GumpUpdater::GetUpdateStatus(
    winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue>
        promise) noexcept {
  promise.Resolve(winrt::Microsoft::ReactNative::JSValueObject{
      {"enabled", UpdatesEnabled()},
      {"updateReady", UpdatesEnabled() && (m_updateReady || GumpUpdateMenu::IsUpdateReady())},
      {"pendingVersion",
       m_pendingVersion.empty()
           ? winrt::Microsoft::ReactNative::JSValue(nullptr)
           : winrt::Microsoft::ReactNative::JSValue(m_pendingVersion)},
  });
}

void NotifySharedUpdateFound(std::string version) noexcept {
  if (g_instance) {
    g_instance->NotifyUpdateFound(std::move(version));
  }
}

} // namespace GumpDesktop
