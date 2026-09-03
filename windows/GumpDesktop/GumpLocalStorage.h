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

  REACT_METHOD(AnalyzePhotoForCulling, L"analyzePhotoForCulling");
  void AnalyzePhotoForCulling(
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

  REACT_METHOD(GetThumbnailUri, L"getThumbnailUri");
  void GetThumbnailUri(
      std::string albumId,
      std::string photoId,
      winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&promise) noexcept;

  REACT_METHOD(EnsureThumbnail, L"ensureThumbnail");
  void EnsureThumbnail(
      std::string albumId,
      std::string sourceUri,
      std::string photoId,
      winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&promise) noexcept;

  REACT_METHOD(EnsureDetail, L"ensureDetail");
  void EnsureDetail(
      std::string albumId,
      std::string sourceUri,
      std::string photoId,
      winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&promise) noexcept;

  REACT_METHOD(EnsureFaceCrops, L"ensureFaceCrops");
  void EnsureFaceCrops(
      std::string albumId,
      std::string sourceUri,
      std::string photoId,
      winrt::Microsoft::ReactNative::JSValueArray faces,
      winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&promise) noexcept;

  REACT_METHOD(ReadImageCaptureTime, L"readImageCaptureTime");
  void ReadImageCaptureTime(
      std::string uri,
      winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&promise) noexcept;

  REACT_METHOD(ComputePerceptualHash, L"computePerceptualHash");
  void ComputePerceptualHash(
      std::string uri,
      winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&promise) noexcept;

  REACT_METHOD(EnsureDefaultExportDirectory, L"ensureDefaultExportDirectory");
  void EnsureDefaultExportDirectory(
      winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&promise) noexcept;

  REACT_METHOD(PickExportDirectory, L"pickExportDirectory");
  void PickExportDirectory(
      winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&promise) noexcept;

  REACT_METHOD(ResolveUniqueZipPath, L"resolveUniqueZipPath");
  void ResolveUniqueZipPath(
      std::string directory,
      std::string fileName,
      winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&promise) noexcept;

  REACT_METHOD(CreateZipFromEntries, L"createZipFromEntries");
  void CreateZipFromEntries(
      winrt::Microsoft::ReactNative::JSValueArray entries,
      std::string zipPath,
      winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&promise) noexcept;

  REACT_METHOD(OpenInFileManager, L"openInFileManager");
  void OpenInFileManager(
      std::string path,
      winrt::Microsoft::ReactNative::ReactPromise<bool> &&promise) noexcept;

  REACT_METHOD(EnsureExportStagingDirectory, L"ensureExportStagingDirectory");
  void EnsureExportStagingDirectory(
      winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&promise) noexcept;

  REACT_METHOD(CopyFile, L"copyFile");
  void CopyFile(
      std::string sourcePath,
      std::string destinationPath,
      winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&promise) noexcept;

  REACT_METHOD(ApplyLook, L"applyLook");
  void ApplyLook(
      std::string sourceUri,
      std::string destPath,
      winrt::Microsoft::ReactNative::JSValueArray matrix,
      double maxPixelSize,
      double jpegQuality,
      winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&promise) noexcept;

  REACT_METHOD(StartAnalysis, L"startAnalysis");
  void StartAnalysis(
      std::string albumId,
      winrt::Microsoft::ReactNative::JSValueArray photos,
      winrt::Microsoft::ReactNative::JSValue config,
      winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&promise) noexcept;

  REACT_METHOD(CancelAnalysis, L"cancelAnalysis");
  void CancelAnalysis(
      winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&promise) noexcept;

  REACT_METHOD(PauseAnalysis, L"pauseAnalysis");
  void PauseAnalysis(
      winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&promise) noexcept;

  REACT_METHOD(ResumeAnalysis, L"resumeAnalysis");
  void ResumeAnalysis(
      winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&promise) noexcept;

  REACT_METHOD(IsAnalysisRunning, L"isRunning");
  void IsAnalysisRunning(
      winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&promise) noexcept;

  REACT_INIT(Initialize);
  void Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept;

private:
  winrt::Microsoft::ReactNative::ReactContext m_reactContext{nullptr};
};

} // namespace GumpDesktop
