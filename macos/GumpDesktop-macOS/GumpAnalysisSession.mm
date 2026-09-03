#import "GumpAnalysisSession.h"
#import "GumpSharedFaceDetection.h"

#import <AppKit/AppKit.h>
#import <ImageIO/ImageIO.h>

#include "../../cpp/analysis/AnalysisSession.h"
#include "../../cpp/face-detection/ExifDateTime.h"

#include <algorithm>
#include <memory>
#include <string>
#include <vector>

namespace {

// Helper function to decode image with orientation
CGImageRef orientedCGImageFromPath(NSString *path, NSUInteger maxPixelSize) {
  NSURL *url = [NSURL fileURLWithPath:path isDirectory:NO];
  CGImageSourceRef imageSource = CGImageSourceCreateWithURL((__bridge CFURLRef)url, NULL);
  if (imageSource == NULL) {
    return NULL;
  }

  NSMutableDictionary *options = [NSMutableDictionary dictionaryWithDictionary:@{
    (NSString *)kCGImageSourceCreateThumbnailFromImageAlways : @YES,
    (NSString *)kCGImageSourceCreateThumbnailWithTransform : @YES,
  }];

  if (maxPixelSize > 0) {
    options[(NSString *)kCGImageSourceThumbnailMaxPixelSize] = @(maxPixelSize);
  }

  CGImageRef image = CGImageSourceCreateThumbnailAtIndex(imageSource, 0, (__bridge CFDictionaryRef)options);
  CFRelease(imageSource);
  return image;
}

// Copy CGImage to BGRA without color-space conversion when possible
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
  
  CGContextSetInterpolationQuality(context, kCGInterpolationNone);
  CGContextDrawImage(context, CGRectMake(0, 0, width, height), image);
  CGContextRelease(context);
  return true;
}

// Read EXIF capture timestamp
int64_t captureTimestampMillisFromPath(NSString *path) {
  NSURL *url = [NSURL fileURLWithPath:path isDirectory:NO];
  CGImageSourceRef imageSource = CGImageSourceCreateWithURL((__bridge CFURLRef)url, NULL);
  if (imageSource == NULL) {
    return 0;
  }

  NSDictionary *props = (__bridge_transfer NSDictionary *)CGImageSourceCopyPropertiesAtIndex(imageSource, 0, NULL);
  CFRelease(imageSource);
  
  if (props == nil) {
    return 0;
  }

  NSDictionary *exif = props[(NSString *)kCGImagePropertyExifDictionary];
  NSString *dateTimeOriginal = exif[(NSString *)kCGImagePropertyExifDateTimeOriginal];
  
  if (dateTimeOriginal.length > 0) {
    std::string dateStr = [dateTimeOriginal UTF8String];
    auto millis = FaceDetection::parseExifDateTimeToUnixMillisUtc(dateStr);
    if (millis.has_value()) {
      return millis.value();
    }
  }

  NSString *dateTime = exif[(NSString *)kCGImagePropertyExifDateTimeDigitized];
  if (dateTime.length > 0) {
    std::string dateStr = [dateTime UTF8String];
    auto millis = FaceDetection::parseExifDateTimeToUnixMillisUtc(dateStr);
    if (millis.has_value()) {
      return millis.value();
    }
  }

  return 0;
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

NSDictionary *AnalysisResultDictionary(const Analysis::AnalysisResult &result) {
  NSMutableArray *faces = [NSMutableArray arrayWithCapacity:result.faces.size()];
  for (const auto &face : result.faces) {
    [faces addObject:FaceDictionaryFromResult(face)];
  }

  NSMutableDictionary *payload = [NSMutableDictionary dictionaryWithDictionary:@{
    @"photoId" : [NSString stringWithUTF8String:result.photoId.c_str()],
    @"success" : @(result.success),
    @"error" : [NSString stringWithUTF8String:result.error.c_str()],
    @"faces" : faces,
    @"perceptualHash" : result.perceptualHash.empty()
        ? [NSNull null]
        : [NSString stringWithUTF8String:result.perceptualHash.c_str()],
    @"capturedAt" : result.capturedAt == 0 ? [NSNull null] : @(result.capturedAt),
    @"starRating" : @(result.starRating),
    @"duplicated" : @(result.duplicated),
    @"flags" : @{
      @"aiSelected" : @(result.flags.aiSelected),
      @"maybe" : @(result.flags.maybe),
      @"blurred" : @(result.flags.blurred),
      @"closedEyes" : @(result.flags.closedEyes),
      @"selected" : @(result.flags.selected),
    },
  }];
  return payload;
}

NSArray *DuplicateGroupsArray(const std::vector<Analysis::DuplicateGroup> &groups) {
  NSMutableArray *payloads = [NSMutableArray arrayWithCapacity:groups.size()];
  for (const auto &group : groups) {
    NSMutableArray *photoIds = [NSMutableArray arrayWithCapacity:group.photoIds.size()];
    for (const auto &photoId : group.photoIds) {
      [photoIds addObject:[NSString stringWithUTF8String:photoId.c_str()]];
    }
    [payloads addObject:@{
      @"groupId" : [NSString stringWithUTF8String:group.groupId.c_str()],
      @"photoIds" : photoIds,
      @"bestPhotoId" : [NSString stringWithUTF8String:group.bestPhotoId.c_str()],
    }];
  }
  return payloads;
}

class MacOSPlatformDecoder : public Analysis::PlatformDecoder {
public:
  explicit MacOSPlatformDecoder(NSString *dbPath)
      : dbPathUtf8_(dbPath.UTF8String ? dbPath.UTF8String : "") {}

  Analysis::DecodedImage DecodeImageToBgra(const std::string &uri, int maxPixelSize) override {
    Analysis::DecodedImage result;
    
    @autoreleasepool {
      NSString *nsUri = [NSString stringWithUTF8String:uri.c_str()];
      NSString *path = pathFromUri(nsUri);
      
      if (path.length == 0) {
        result.error = "Invalid URI";
        return result;
      }

      CGImageRef cgImage = orientedCGImageFromPath(path, maxPixelSize);
      if (cgImage == nullptr) {
        result.error = "Failed to decode image";
        return result;
      }

      // Use shared_ptr with custom deleter for BGRA buffer
      auto bgraBuffer = std::make_shared<std::vector<uint8_t>>();
      
      if (!CopyCGImageToBgra(cgImage, *bgraBuffer, result.width, result.height, result.stride)) {
        CGImageRelease(cgImage);
        result.error = "Failed to copy image to BGRA";
        return result;
      }

      CGImageRelease(cgImage);

      result.bgraPixels = bgraBuffer->data();
      result.platformHandle = bgraBuffer;
      result.success = true;
    }
    
    return result;
  }

  std::vector<Analysis::DecodedImage> DecodeImageRegionsToBgra(
      const std::string &uri,
      const std::vector<Analysis::ImageRegion> &regions,
      int sourceMaxPixelSize) override {
    std::vector<Analysis::DecodedImage> results(regions.size());
    if (regions.empty()) {
      return results;
    }

    @autoreleasepool {
      NSString *nsUri = [NSString stringWithUTF8String:uri.c_str()];
      NSString *path = pathFromUri(nsUri);
      if (path.length == 0) {
        for (auto &result : results) {
          result.error = "Invalid URI";
        }
        return results;
      }

      const int outputCap = FaceDetection::kMeasurementCropOutputMaxPixelSize;
      for (size_t index = 0; index < regions.size(); ++index) {
        @autoreleasepool {
          const int sourceMax = Analysis::MeasurementSourcePixelSize(
              regions[index], sourceMaxPixelSize, outputCap);
          CGImageRef source =
              orientedCGImageFromPath(path, static_cast<NSUInteger>(sourceMax));
          if (source == nullptr) {
            results[index].error = "Failed to decode image";
            continue;
          }

          const int imageWidth = static_cast<int>(CGImageGetWidth(source));
          const int imageHeight = static_cast<int>(CGImageGetHeight(source));
          const auto pixelRect = Analysis::PixelRectFromNormalized(
              regions[index], imageWidth, imageHeight);
          if (pixelRect.width <= 0 || pixelRect.height <= 0) {
            CGImageRelease(source);
            results[index].error = "Empty crop region";
            continue;
          }

          CGRect cropRect = CGRectMake(
              pixelRect.x, pixelRect.y, pixelRect.width, pixelRect.height);
          CGImageRef crop = CGImageCreateWithImageInRect(source, cropRect);
          CGImageRelease(source);
          if (crop == nullptr) {
            results[index].error = "Failed to crop image";
            continue;
          }

          auto bgraBuffer = std::make_shared<std::vector<uint8_t>>();
          if (!CopyCGImageToBgra(
                  crop,
                  *bgraBuffer,
                  results[index].width,
                  results[index].height,
                  results[index].stride)) {
            CGImageRelease(crop);
            results[index].error = "Failed to copy crop to BGRA";
            continue;
          }
          CGImageRelease(crop);
          results[index].bgraPixels = bgraBuffer->data();
          results[index].platformHandle = bgraBuffer;
          results[index].success = true;
        }
      }
    }

    return results;
  }

  int64_t ReadCapturedAtMillis(const std::string &uri) override {
    @autoreleasepool {
      NSString *nsUri = [NSString stringWithUTF8String:uri.c_str()];
      NSString *path = pathFromUri(nsUri);
      
      if (path.length == 0) {
        return 0;
      }

      return captureTimestampMillisFromPath(path);
    }
  }

  std::string GetDatabasePath() const override {
    return dbPathUtf8_;
  }

private:
  std::string dbPathUtf8_;

  NSString *pathFromUri(NSString *uri) {
    if (uri.length == 0) {
      return @"";
    }
    if ([uri hasPrefix:@"file://"]) {
      NSURL *url = [NSURL URLWithString:uri];
      if (url == nil || url.path.length == 0) {
        NSString *rawPath = [uri substringFromIndex:7];
        url = [NSURL fileURLWithPath:rawPath isDirectory:NO];
      }
      return url.path ?: @"";
    }
    return uri;
  }
};

} // namespace

@interface GumpAnalysisSession () {
  std::unique_ptr<Analysis::AnalysisSession> _session;
  std::unique_ptr<MacOSPlatformDecoder> _decoder;
  BOOL _hasListeners;
  NSTimer *_progressTimer;
}

@end

@implementation GumpAnalysisSession

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

- (instancetype)init {
  if (self = [super init]) {
    _session = std::make_unique<Analysis::AnalysisSession>();
    _hasListeners = NO;
    _progressTimer = nil;
  }
  return self;
}

- (void)dealloc {
  if (_progressTimer) {
    [_progressTimer invalidate];
    _progressTimer = nil;
  }
  _session.reset();
  _decoder.reset();
}

- (NSArray<NSString *> *)supportedEvents {
  return @[@"analysisProgress", @"analysisComplete", @"analysisBatch"];
}

- (void)startObserving {
  _hasListeners = YES;
}

- (void)stopObserving {
  _hasListeners = NO;
}

- (NSString *)getDatabasePath {
  NSURL *appSupport =
      [[NSFileManager defaultManager] URLsForDirectory:NSApplicationSupportDirectory
                                             inDomains:NSUserDomainMask]
          .firstObject;
  NSURL *dbDir = [appSupport URLByAppendingPathComponent:@"Gump" isDirectory:YES];
  
  // Ensure directory exists
  [[NSFileManager defaultManager] createDirectoryAtURL:dbDir
                           withIntermediateDirectories:YES
                                            attributes:nil
                                                 error:nil];
  
  NSURL *dbPath = [dbDir URLByAppendingPathComponent:@"gump.db"];
  return dbPath.path;
}

- (NSString *)getPipelineModelPath:(NSString *)modelName {
  NSBundle *bundle = [NSBundle mainBundle];
  NSString *path = [bundle pathForResource:modelName ofType:@"onnx"];
  if (path.length == 0) {
    path = [bundle pathForResource:modelName ofType:@"onnx" inDirectory:@"Models"];
  }
  return path ?: @"";
}

RCT_EXPORT_METHOD(startAnalysis:(NSString *)albumId
                  photos:(NSArray *)photosArray
                  config:(NSDictionary *)configDict
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
    @try {
      if (self->_session->IsRunning()) {
        reject(@"ALREADY_RUNNING", @"Analysis session is already running", nil);
        return;
      }

      // Create decoder
      NSString *dbPath = [self getDatabasePath];
      self->_decoder = std::make_unique<MacOSPlatformDecoder>(dbPath);

      // Configure pipeline
      FaceDetection::PipelineConfig pipelineConfig;
      pipelineConfig.scrfdModelPath = [[self getPipelineModelPath:@"face_detection_scrfd_2.5g_bnkps"] UTF8String];
      pipelineConfig.ocecModelPath = [[self getPipelineModelPath:@"eye_state_ocec_s"] UTF8String];
      pipelineConfig.scoreThreshold = 0.50f;
      pipelineConfig.acceptScoreThreshold = 0.65f;
      pipelineConfig.nmsThreshold = 0.40f;
      pipelineConfig.enableTiling = YES;
      pipelineConfig.requireLandmarkPlausibility = YES;
      pipelineConfig.enableNativeFpFilter = YES;
      pipelineConfig.pipelinePoolSize = 2;

      // Parse photos
      std::vector<Analysis::PhotoInput> photos;
      for (NSDictionary *photoDict in photosArray) {
        Analysis::PhotoInput input;
        input.photoId = [photoDict[@"photoId"] UTF8String] ?: "";
        input.uri = [photoDict[@"uri"] UTF8String] ?: "";
        input.fileName = [photoDict[@"fileName"] UTF8String] ?: "";
        input.existingCapturedAt = [photoDict[@"capturedAt"] longLongValue];
        input.existingHash = [photoDict[@"perceptualHash"] UTF8String] ?: "";
        photos.push_back(input);
      }

      // Configure session
      Analysis::SessionConfig sessionConfig;
      sessionConfig.maxConcurrency = [configDict[@"maxConcurrency"] intValue] ?: 2;
      sessionConfig.pipelinePoolSize = 2;
      sessionConfig.persistBatchSize = 50;
      sessionConfig.progressIntervalMs = 500;
      sessionConfig.interJobDelayMs = [configDict[@"interJobDelayMs"] intValue] ?: 50;
      sessionConfig.maxDecodePixelSize = [configDict[@"maxDecodePixelSize"] intValue] ?: 4096;
      sessionConfig.progressiveBatchSize = [configDict[@"progressiveBatchSize"] intValue] ?: 20;
      sessionConfig.albumId = [albumId UTF8String];
      sessionConfig.photos = photos;
      sessionConfig.decoder = self->_decoder.get();
      sessionConfig.pipelineConfig = pipelineConfig;

      // Set up callbacks
      __weak GumpAnalysisSession *weakSelf = self;
      
      sessionConfig.onProgress = [weakSelf](const Analysis::ProgressUpdate &update) {
        GumpAnalysisSession *strongSelf = weakSelf;
        if (!strongSelf || !strongSelf->_hasListeners) {
          return;
        }

        dispatch_async(dispatch_get_main_queue(), ^{
          [strongSelf sendEventWithName:@"analysisProgress"
                                   body:@{
                                     @"done" : @(update.done),
                                     @"total" : @(update.total),
                                     @"failed" : @(update.failed),
                                   }];
        });
      };

      sessionConfig.onBatchResults = [weakSelf](const std::vector<Analysis::AnalysisResult> &batch) {
        GumpAnalysisSession *strongSelf = weakSelf;
        if (!strongSelf) {
          return;
        }

        NSMutableArray *resultPayloads = [NSMutableArray arrayWithCapacity:batch.size()];
        for (const auto &result : batch) {
          [resultPayloads addObject:AnalysisResultDictionary(result)];
        }

        dispatch_async(dispatch_get_main_queue(), ^{
          if (strongSelf->_hasListeners) {
            [strongSelf sendEventWithName:@"analysisBatch"
                                     body:@{@"results" : resultPayloads}];
          }
        });
      };

      sessionConfig.onComplete = [weakSelf](const Analysis::CompletionSummary &summary) {
        GumpAnalysisSession *strongSelf = weakSelf;
        if (!strongSelf) {
          return;
        }

        NSMutableArray *resultPayloads = [NSMutableArray arrayWithCapacity:summary.results.size()];
        for (const auto &result : summary.results) {
          [resultPayloads addObject:AnalysisResultDictionary(result)];
        }
        NSArray *duplicateGroups = DuplicateGroupsArray(summary.duplicateGroups);

        dispatch_async(dispatch_get_main_queue(), ^{
          if (strongSelf->_hasListeners) {
            [strongSelf sendEventWithName:@"analysisComplete"
                                     body:@{
                                       @"done" : @(summary.done),
                                       @"total" : @(summary.total),
                                       @"failed" : @(summary.failed),
                                       @"postProcessed" : @YES,
                                       @"results" : resultPayloads,
                                       @"duplicateGroups" : duplicateGroups,
                                     }];
          }
        });
      };

      // Start session
      bool started = self->_session->Start(sessionConfig);
      
      if (!started) {
        reject(@"START_FAILED", @"Failed to start analysis session", nil);
        return;
      }

      resolve(@{@"success" : @(YES)});

    } @catch (NSException *exception) {
      reject(@"EXCEPTION", exception.reason, nil);
    }
  });
}

RCT_EXPORT_METHOD(cancelAnalysis:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    @try {
      self->_session->Cancel();
      resolve(@{@"success" : @(YES)});
    } @catch (NSException *exception) {
      reject(@"EXCEPTION", exception.reason, nil);
    }
  });
}

RCT_EXPORT_METHOD(pauseAnalysis:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    @try {
      self->_session->Pause();
      resolve(@{@"success" : @(YES)});
    } @catch (NSException *exception) {
      reject(@"EXCEPTION", exception.reason, nil);
    }
  });
}

RCT_EXPORT_METHOD(resumeAnalysis:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    @try {
      self->_session->Resume();
      resolve(@{@"success" : @(YES)});
    } @catch (NSException *exception) {
      reject(@"EXCEPTION", exception.reason, nil);
    }
  });
}

RCT_EXPORT_METHOD(isRunning:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    @try {
      bool running = self->_session->IsRunning();
      resolve(@{@"running" : @(running)});
    } @catch (NSException *exception) {
      reject(@"EXCEPTION", exception.reason, nil);
    }
  });
}

@end
