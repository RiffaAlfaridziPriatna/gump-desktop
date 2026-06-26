#include "pch.h"
#include "GumpFilePicker.h"

#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Storage.h>
#include <winrt/Windows.Storage.Pickers.h>
#include <thread>

namespace winrtRN = winrt::Microsoft::ReactNative;
using namespace winrt::Windows::Storage;
using namespace winrt::Windows::Storage::Pickers;

namespace GumpDesktop {

void GumpFilePicker::PickImages(
    winrtRN::ReactPromise<winrtRN::JSValue> &&promise) noexcept {
  std::thread([promise = std::move(promise)]() mutable {
    try {
      FileOpenPicker picker;
      picker.SuggestedStartLocation(PickerLocationId::PicturesLibrary);
      picker.ViewMode(PickerViewMode::Thumbnail);
      picker.FileTypeFilter().Append(L".jpg");
      picker.FileTypeFilter().Append(L".jpeg");
      picker.FileTypeFilter().Append(L".png");
      picker.FileTypeFilter().Append(L".gif");
      picker.FileTypeFilter().Append(L".heic");
      picker.FileTypeFilter().Append(L".tiff");

      auto files = picker.PickMultipleFilesAsync().get();

      winrtRN::JSValueArray result;
      for (const auto &file : files) {
        auto props = file.GetBasicPropertiesAsync().get();
        winrtRN::JSValueObject fileObj;
        fileObj["uri"] = winrt::to_string(L"file:///" + file.Path());
        fileObj["name"] = winrt::to_string(file.Name());
        fileObj["size"] = static_cast<double>(props.Size());
        fileObj["type"] = winrt::to_string(file.ContentType());
        result.push_back(std::move(fileObj));
      }

      promise.Resolve(std::move(result));
    } catch (const winrt::hresult_error &e) {
      promise.Reject(winrt::to_string(e.message()).c_str());
    }
  }).detach();
}

} // namespace GumpDesktop
