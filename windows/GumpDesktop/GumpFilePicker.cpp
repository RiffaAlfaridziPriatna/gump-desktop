#include "pch.h"
#include "GumpFilePicker.h"

#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Storage.h>
#include <winrt/Windows.Storage.FileProperties.h>
#include <commdlg.h>

#pragma comment(lib, "Comdlg32.lib")

namespace winrtRN = winrt::Microsoft::ReactNative;

namespace GumpDesktop {

std::string ToUtf8(std::wstring_view value) {
  if (value.empty()) {
    return {};
  }

  const int size = WideCharToMultiByte(
      CP_UTF8,
      0,
      value.data(),
      static_cast<int>(value.size()),
      nullptr,
      0,
      nullptr,
      nullptr);
  if (size <= 0) {
    return {};
  }

  std::string utf8(size, '\0');
  WideCharToMultiByte(
      CP_UTF8,
      0,
      value.data(),
      static_cast<int>(value.size()),
      utf8.data(),
      size,
      nullptr,
      nullptr);
  return utf8;
}

void GumpFilePicker::PickImages(
    winrtRN::ReactPromise<winrtRN::JSValue> &&promise) noexcept {
  try {
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
    ofn.nMaxFile = static_cast<DWORD>(sizeof(fileBuffer) / sizeof(fileBuffer[0]));
    ofn.Flags = OFN_ALLOWMULTISELECT | OFN_EXPLORER | OFN_FILEMUSTEXIST | OFN_PATHMUSTEXIST;
    ofn.lpstrTitle = L"Select photos";

    BOOL ok = GetOpenFileNameW(&ofn);
    if (!ok) {
      promise.Resolve(winrtRN::JSValueArray{});
      return;
    }

    auto parseSelectedPaths = [&](wchar_t *buf) {
      std::vector<std::wstring> paths;

      std::wstring first(buf);
      wchar_t *cursor = buf + first.size() + 1;
      if (*cursor == L'\0') {
        paths.push_back(std::move(first));
        return paths;
      }

      std::wstring dir = std::move(first);
      while (*cursor != L'\0') {
        std::wstring name(cursor);
        paths.push_back(dir + L"\\" + name);
        cursor += name.size() + 1;
      }
      return paths;
    };

    std::vector<std::wstring> paths = parseSelectedPaths(fileBuffer);

    auto mimeTypeForPath = [](const std::filesystem::path &path) -> std::string {
      const auto ext = path.extension().wstring();
      if (ext.empty()) {
        return "image/jpeg";
      }
      return "public." + ToUtf8(ext.substr(1));
    };

    winrtRN::JSValueArray result;
    for (const auto &path : paths) {
      const std::filesystem::path fsPath(path);

      double size = 0;
      try {
        size = static_cast<double>(std::filesystem::file_size(fsPath));
      } catch (...) {
        size = 0;
      }

      const std::wstring name = fsPath.filename().wstring();

      winrtRN::JSValueObject fileObj;
      fileObj["uri"] = ToUtf8(fsPath.wstring());
      fileObj["name"] = ToUtf8(name);
      fileObj["size"] = size;
      fileObj["type"] = mimeTypeForPath(fsPath);

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
