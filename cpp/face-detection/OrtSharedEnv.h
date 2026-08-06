#pragma once

#if __has_include(<onnxruntime_cxx_api.h>)
#include <onnxruntime_cxx_api.h>
#define FACE_DETECTION_HAS_ONNXRUNTIME 1
#else
#define FACE_DETECTION_HAS_ONNXRUNTIME 0
#endif

namespace FaceDetection {

#if FACE_DETECTION_HAS_ONNXRUNTIME

inline Ort::Env &SharedOrtEnv() {
  static Ort::Env env{ORT_LOGGING_LEVEL_WARNING, "GumpFaceDetection"};
  return env;
}

#endif

} // namespace FaceDetection
