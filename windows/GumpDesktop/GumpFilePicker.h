#pragma once

#include "pch.h"

#include <NativeModules.h>

namespace GumpDesktop {

REACT_MODULE(GumpFilePicker, L"GumpFilePicker");
struct GumpFilePicker {
  REACT_METHOD(PickImages, L"pickImages");
  void PickImages(
      winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&promise) noexcept;
};

} // namespace GumpDesktop
