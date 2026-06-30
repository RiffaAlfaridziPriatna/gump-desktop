#pragma once

#include "pch.h"

#include <NativeModules.h>

namespace GumpDesktop {

REACT_MODULE(GumpLocalStorage, L"GumpLocalStorage");
struct GumpLocalStorage {
  REACT_METHOD(DetectFacesForCulling, L"detectFacesForCulling");
  void DetectFacesForCulling(
      std::string uri,
      winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&promise) noexcept;

  REACT_METHOD(CopyPhoto, L"copyPhoto");
  void CopyPhoto(
      std::string albumId,
      std::string sourceUri,
      std::string fileName,
      std::string photoId,
      winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&promise) noexcept;

  REACT_METHOD(ListPhotos, L"listPhotos");
  void ListPhotos(
      std::string albumId,
      winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&promise) noexcept;

  REACT_METHOD(ReadFileSlice, L"readFileSlice");
  void ReadFileSlice(
      std::string uri,
      double start,
      double end,
      winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&promise) noexcept;

  REACT_METHOD(UploadFilePart, L"uploadFilePart");
  void UploadFilePart(
      std::string uri,
      double start,
      double end,
      std::string uploadUrl,
      winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&promise) noexcept;

  REACT_METHOD(DeletePhoto, L"deletePhoto");
  void DeletePhoto(
      std::string uri,
      winrt::Microsoft::ReactNative::ReactPromise<bool> &&promise) noexcept;

  REACT_METHOD(DeleteAlbum, L"deleteAlbum");
  void DeleteAlbum(
      std::string albumId,
      winrt::Microsoft::ReactNative::ReactPromise<bool> &&promise) noexcept;

  REACT_METHOD(GetImageDimensions, L"getImageDimensions");
  void GetImageDimensions(
      std::string uri,
      winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&promise) noexcept;

  REACT_METHOD(ReadImageCaptureTime, L"readImageCaptureTime");
  void ReadImageCaptureTime(
      std::string uri,
      winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&promise) noexcept;

  REACT_METHOD(ComputePerceptualHash, L"computePerceptualHash");
  void ComputePerceptualHash(
      std::string uri,
      winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&promise) noexcept;
};

} // namespace GumpDesktop
