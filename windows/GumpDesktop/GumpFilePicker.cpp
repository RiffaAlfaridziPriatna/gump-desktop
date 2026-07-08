#include "pch.h"
#include "GumpFilePicker.h"

#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Storage.h>
#include <winrt/Windows.Storage.FileProperties.h>
#include <winrt/Windows.Storage.Pickers.h>
#include <winrt/Windows.Foundation.h>

namespace winrtRN = winrt::Microsoft::ReactNative;
using namespace winrt::Windows::Storage;
using namespace winrt::Windows::Storage::Pickers;

namespace GumpDesktop {

void GumpFilePicker::PickImages(
    winrtRN::ReactPromise<winrtRN::JSValue> &&promise) noexcept {
  try {
    try {
      winrt::init_apartment(winrt::apartment_type::single_threaded);
    } catch (const winrt::hresult_error &e) {
      if (e.code() != 0x80010106 /* RPC_E_CHANGED_MODE */) {
        throw;
      }
    }

    FileOpenPicker picker;
    picker.SuggestedStartLocation(PickerLocationId::PicturesLibrary);
    picker.ViewMode(PickerViewMode::Thumbnail);
    picker.FileTypeFilter().Append(L".jpg");
    picker.FileTypeFilter().Append(L".jpeg");
    picker.FileTypeFilter().Append(L".png");
    picker.FileTypeFilter().Append(L".gif");
    picker.FileTypeFilter().Append(L".heic");
    picker.FileTypeFilter().Append(L".tiff");

    auto op = picker.PickMultipleFilesAsync();
    op.Completed(
        [promise = std::move(promise)](
            auto const &asyncOp,
            winrt::Windows::Foundation::AsyncStatus status) mutable {
          try {
            if (status != winrt::Windows::Foundation::AsyncStatus::Completed) {
              promise.Resolve(winrtRN::JSValueArray{});
              return;
            }

            auto files = asyncOp.GetResults();

            winrtRN::JSValueArray result;
            for (const auto &file : files) {
              auto props = file.GetBasicPropertiesAsync().get();
              std::wstring uri = L"file:///";
              uri += file.Path().c_str();
              winrtRN::JSValueObject fileObj;
              fileObj["uri"] = winrt::to_string(uri);
              fileObj["name"] = winrt::to_string(file.Name());
              fileObj["size"] = static_cast<double>(props.Size());
              fileObj["type"] = winrt::to_string(file.ContentType());
              result.push_back(std::move(fileObj));
            }

            promise.Resolve(std::move(result));
          } catch (const winrt::hresult_error &e) {
            promise.Reject(
                winrtRN::ReactError{"Error", winrt::to_string(e.message())});
          } catch (...) {
            promise.Reject("Unknown native error");
          }
        });
  } catch (const winrt::hresult_error &e) {
    promise.Reject(winrtRN::ReactError{"Error", winrt::to_string(e.message())});
  } catch (...) {
    promise.Reject("Unknown native error");
  }
}

} // namespace GumpDesktop
