#import "GumpSharedFaceDetection.h"

#include "DifferenceHash.h"
#include "FaceDetectionPipeline.h"

#include <mutex>
#include <string>
#include <vector>

namespace {

FaceDetection::FaceDetectionPipeline &SharedPipeline() {
  static FaceDetection::FaceDetectionPipeline pipeline;
  static std::once_flag once;
  std::call_once(once, []() {
    FaceDetection::PipelineConfig config;

    auto resolveModel = [](NSString *name) -> std::string {
      NSBundle *bundle = [NSBundle mainBundle];
      NSString *path = [bundle pathForResource:name ofType:@"onnx"];
      if (path.length == 0) {
        path = [bundle pathForResource:name ofType:@"onnx" inDirectory:@"Models"];
      }
      if (path.length == 0) {
        // Dev / harness: Models next to the source tree.
        NSString *fallback = [[bundle.resourcePath stringByAppendingPathComponent:@"Models"]
            stringByAppendingPathComponent:[name stringByAppendingPathExtension:@"onnx"]];
        if ([[NSFileManager defaultManager] fileExistsAtPath:fallback]) {
          path = fallback;
        }
      }
      return path.length > 0 ? std::string(path.UTF8String) : std::string{};
    };

    config.scrfdModelPath = resolveModel(@"face_detection_scrfd_2.5g_bnkps");
    config.ocecModelPath = resolveModel(@"eye_state_ocec_s");
    // config.landmark106ModelPath = resolveModel(@"face_landmarks_2d106det");
    config.scoreThreshold = 0.50f;
    config.acceptScoreThreshold = 0.65f;
    config.nmsThreshold = 0.40f;
    config.enableTiling = true;
    config.requireLandmarkPlausibility = true;
    config.enablePostProcess = false;
    config.enableTinyAreaArtifactFilter = false;
    config.enableSharpnessArtifactFilter = false;
    config.enableNativeFpFilter = true;

    if (!pipeline.initialize(config)) {
      NSLog(@"[GumpSharedFaceDetection] init failed: %s", pipeline.lastError().c_str());
    } else {
      NSLog(@"[GumpSharedFaceDetection] SCRFD+OCEC ready (scrfd=%s)",
            config.scrfdModelPath.c_str());
    }
  });
  return pipeline;
}

/// Copy CGImage to BGRA without color-space conversion when possible.
/// Uses the image's own color space so encoded channel values stay close to
/// Windows `DoNotColorManage` decode (parity for SCRFD + dHash).
bool CopyCGImageToBgra(
    CGImageRef image,
    std::vector<uint8_t> &outBgra,
    int &outWidth,
    int &outHeight,
    int &outStride) {
  if (image == nullptr) {
    return false;
  }
  const size_t width = CGImageGetWidth(image);
  const size_t height = CGImageGetHeight(image);
  if (width == 0 || height == 0) {
    return false;
  }

  const size_t stride = width * 4;
  outBgra.assign(stride * height, 0);
  outWidth = static_cast<int>(width);
  outHeight = static_cast<int>(height);
  outStride = static_cast<int>(stride);

  CGColorSpaceRef imageColorSpace = CGImageGetColorSpace(image);
  bool releaseColorSpace = false;
  CGColorSpaceRef colorSpace = imageColorSpace;
  if (colorSpace == nullptr) {
    colorSpace = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
    releaseColorSpace = true;
  }

  CGContextRef context = CGBitmapContextCreate(
      outBgra.data(),
      width,
      height,
      8,
      stride,
      colorSpace,
      kCGImageAlphaPremultipliedFirst | kCGBitmapByteOrder32Little);
  if (releaseColorSpace) {
    CGColorSpaceRelease(colorSpace);
  }
  if (context == nullptr) {
    return false;
  }
  // Disable interpolation so resize already done by ImageIO is preserved 1:1.
  CGContextSetInterpolationQuality(context, kCGInterpolationNone);
  CGContextDrawImage(context, CGRectMake(0, 0, width, height), image);
  CGContextRelease(context);
  return true;
}

NSDictionary *FaceDictionaryFromResult(const FaceDetection::FaceResult &face) {
  NSMutableArray *landmarks = [NSMutableArray arrayWithCapacity:face.landmarks.size()];
  for (const auto &lm : face.landmarks) {
    [landmarks addObject:@{
      @"type" : [NSString stringWithUTF8String:lm.type.c_str()],
      @"x" : @(lm.x),
      @"y" : @(lm.y),
    }];
  }

  return @{
    @"boundingBox" : @{
      @"left" : @(face.left),
      @"top" : @(face.top),
      @"width" : @(face.width),
      @"height" : @(face.height),
    },
    @"eyesOpen" : @{
      @"value" : @(face.eyesOpen.value),
      @"confidence" : @(face.eyesOpen.confidence),
      @"leftProbability" : @(face.eyesOpen.leftProbability),
      @"rightProbability" : @(face.eyesOpen.rightProbability),
    },
    @"eyeStatus" : [NSString stringWithUTF8String:face.eyeStatus.c_str()],
    @"focusLevel" : [NSString stringWithUTF8String:face.focusLevel.c_str()],
    @"sharpness" : @(face.sharpness),
    @"brightness" : @(face.brightness),
    @"confidence" : @(face.confidence),
    @"landmarks" : landmarks,
    @"pose" : @{
      @"pitch" : @(face.pose.pitch),
      @"roll" : @(face.pose.roll),
      @"yaw" : @(face.pose.yaw),
    },
    @"faceId" : [NSString stringWithUTF8String:face.faceId.c_str()],
    @"engine" : [NSString stringWithUTF8String:face.engine.c_str()],
  };
}

NSString *HashHexFromBgra(const std::vector<uint8_t> &bgra, int width, int height, int stride) {
  const auto hash =
      FaceDetection::differenceHashFromBgra(bgra.data(), width, height, stride);
  if (!hash.has_value()) {
    return nil;
  }
  const std::string hex = FaceDetection::formatHashHex(*hash);
  return [NSString stringWithUTF8String:hex.c_str()];
}

} // namespace

@implementation GumpSharedFaceDetection

+ (BOOL)isReady {
  return SharedPipeline().isReady() ? YES : NO;
}

+ (NSString *)lastError {
  const std::string error = SharedPipeline().lastError();
  return [NSString stringWithUTF8String:error.c_str()];
}

+ (NSArray<NSDictionary *> *)facesFromCGImage:(CGImageRef)cgImage {
  auto &pipeline = SharedPipeline();
  if (!pipeline.isReady()) {
    NSLog(@"[GumpSharedFaceDetection] not ready: %s", pipeline.lastError().c_str());
    return @[];
  }

  std::vector<uint8_t> bgra;
  int width = 0;
  int height = 0;
  int stride = 0;
  if (!CopyCGImageToBgra(cgImage, bgra, width, height, stride)) {
    return @[];
  }

  const auto faces = pipeline.detectFaces(bgra.data(), width, height, stride);
  NSMutableArray *result = [NSMutableArray arrayWithCapacity:faces.size()];
  for (const auto &face : faces) {
    [result addObject:FaceDictionaryFromResult(face)];
  }
  return result;
}

+ (NSDictionary *)analyzeCGImage:(CGImageRef)cgImage {
  std::vector<uint8_t> bgra;
  int width = 0;
  int height = 0;
  int stride = 0;
  if (!CopyCGImageToBgra(cgImage, bgra, width, height, stride)) {
    return @{
      @"faces" : @[],
      @"perceptualHash" : [NSNull null],
    };
  }

  NSString *perceptualHash = HashHexFromBgra(bgra, width, height, stride);
  NSArray *faces = @[];
  auto &pipeline = SharedPipeline();
  if (pipeline.isReady()) {
    const auto detected = pipeline.detectFaces(bgra.data(), width, height, stride);
    NSMutableArray *mapped = [NSMutableArray arrayWithCapacity:detected.size()];
    for (const auto &face : detected) {
      [mapped addObject:FaceDictionaryFromResult(face)];
    }
    faces = mapped;
  } else {
    NSLog(@"[GumpSharedFaceDetection] analyze: SCRFD not ready (%s)",
          pipeline.lastError().c_str());
  }

  return @{
    @"faces" : faces,
    @"perceptualHash" : perceptualHash ?: [NSNull null],
  };
}

+ (NSString *)perceptualHashFromCGImage:(CGImageRef)cgImage {
  std::vector<uint8_t> bgra;
  int width = 0;
  int height = 0;
  int stride = 0;
  if (!CopyCGImageToBgra(cgImage, bgra, width, height, stride)) {
    return nil;
  }
  return HashHexFromBgra(bgra, width, height, stride);
}

@end
