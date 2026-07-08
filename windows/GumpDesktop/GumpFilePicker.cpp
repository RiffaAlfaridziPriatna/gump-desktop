#include "pch.h"
#include "GumpFilePicker.h"

#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Storage.h>
#include <winrt/Windows.Storage.FileProperties.h>
#include <commdlg.h>
#include <algorithm>
#include <cwctype>

namespace winrtRN = winrt::Microsoft::ReactNative;

namespace GumpDesktop {

void GumpFilePicker::PickImages(
    winrtRN::ReactPromise<winrtRN::JSValue> &&promise) noexcept {
  try {
    // Using Win32 dialog to avoid WinRT "Invalid window handle" and SDK/projection
    // inconsistencies across environments. This runs synchronously but is a
    // modal system picker, so the user experience is consistent.

    // Buffer format (multi-select):
    // - either: <full_path>\0
    // - or: <dir>\0<file1>\0<file2>\0...\0\0
    wchar_t fileBuffer[65536] = {};

    static constexpr wchar_t filter[] =
        L"Images (*.jpg;*.jpeg;*.png;*.gif;*.heic;*.tiff)\0"
        L"*.jpg;*.jpeg;*.png;*.gif;*.heic;*.tiff\0";

    OPENFILENAMEW ofn{};
    ofn.lStructSize = sizeof(ofn);
    ofn.hwndOwner = GetActiveWindow();
    ofn.lpstrFilter = filter;
    ofn.nFilterIndex = 1;
    ofn.lpstrFile = fileBuffer;
    ofn.nMaxFile = static_cast<DWORD>(std::size(fileBuffer));
    ofn.Flags = OFN_ALLOWMULTISELECT | OFN_EXPLORER | OFN_FILEMUSTEXIST | OFN_PATHMUSTEXIST;
    ofn.lpstrTitle = L"Select photos";

    BOOL ok = GetOpenFileNameW(&ofn);
    if (!ok) {
      // Cancel or error: treat as empty selection.
      promise.Resolve(winrtRN::JSValueArray{});
      return;
    }

    auto parseSelectedPaths = [&](wchar_t *buf) {
      std::vector<std::wstring> paths;

      std::wstring first(buf);
      wchar_t *cursor = buf + first.size() + 1;
      if (*cursor == L'\0') {
        // single selection (first is full path)
        paths.push_back(std::move(first));
        return paths;
      }

      // multi selection
      std::wstring dir = std::move(first);
      while (*cursor != L'\0') {
        std::wstring name(cursor);
        paths.push_back(dir + L"\\" + name);
        cursor += name.size() + 1;
      }
      return paths;
    };

    std::vector<std::wstring> paths = parseSelectedPaths(fileBuffer);

    auto mimeTypeForPath = [](const std::wstring &path) -> std::wstring {
      std::wstring ext = std::filesystem::path(path).extension().wstring();
      std::transform(ext.begin(), ext.end(), ext.begin(), ::towlower);

      if (ext == L".jpg" || ext == L".jpeg") return L"image/jpeg";
      if (ext == L".png") return L"image/png";
      if (ext == L".gif") return L"image/gif";
      if (ext == L".heic") return L"image/heic";
      if (ext == L".tif" || ext == L".tiff") return L"image/tiff";
      return L"image/*";
    };

    winrtRN::JSValueArray result;
    for (const auto &path : paths) {
      std::wstring uriPath = path;
      std::replace(uriPath.begin(), uriPath.end(), L'\\', L'/');

      double size = 0;
      try {
        size = static_cast<double>(std::filesystem::file_size(path));
      } catch (...) {
        size = 0;
      }

      std::wstring name = std::filesystem::path(path).filename().wstring();

      winrtRN::JSValueObject fileObj;
      fileObj["uri"] = winrt::to_string(L"file:///" + uriPath);
      fileObj["name"] = winrt::to_string(name);
      fileObj["size"] = size;
      fileObj["type"] = winrt::to_string(mimeTypeForPath(path));

      result.push_back(std::move(fileObj));
    }

    promise.Resolve(std::move(result));
  } catch (const winrt::hresult_error &e) {
    promise.Reject(
        winrtRN::ReactError{"Error", winrt::to_string(e.message())});
  } catch (...) {
    promise.Reject("Unknown native error");
  }
}

} // namespace GumpDesktop
