#import "GumpLocalStorage.h"

#import <AppKit/AppKit.h>
#import <ImageIO/ImageIO.h>
#import <Vision/Vision.h>

@implementation GumpLocalStorage

RCT_EXPORT_MODULE();

- (NSString *)cullingAlbumDirectory:(NSString *)albumId
{
  NSURL *appSupport =
      [[NSFileManager defaultManager] URLsForDirectory:NSApplicationSupportDirectory
                                             inDomains:NSUserDomainMask]
          .firstObject;
  NSURL *dir = [[appSupport URLByAppendingPathComponent:@"Gump/culling-albums" isDirectory:YES]
      URLByAppendingPathComponent:albumId
                      isDirectory:YES];
  return dir.path;
}

- (NSString *)pathFromUri:(NSString *)uri
{
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

- (NSArray *)landmarksFromObservation:(VNFaceObservation *)face
{
  VNFaceLandmarks2D *landmarks = face.landmarks;
  if (landmarks == nil) {
    return @[];
  }

  NSMutableArray *items = [NSMutableArray array];
  void (^addRegion)(VNFaceLandmarkRegion2D *, NSString *) = ^(VNFaceLandmarkRegion2D *region,
                                                              NSString *type) {
    if (region == nil || region.pointCount == 0) {
      return;
    }
    CGPoint inFace = region.normalizedPoints[0];
    CGRect bbox = face.boundingBox;
    CGFloat x = bbox.origin.x + inFace.x * bbox.size.width;
    CGFloat y = bbox.origin.y + inFace.y * bbox.size.height;
    [items addObject:@{
      @"type" : type,
      @"x" : @(x),
      @"y" : @(1.0 - y),
    }];
  };

  addRegion(landmarks.leftEye, @"eyeLeft");
  addRegion(landmarks.rightEye, @"eyeRight");
  addRegion(landmarks.nose, @"nose");
  addRegion(landmarks.outerLips, @"mouth");

  return items;
}

- (CGFloat)eyeAspectRatioFromRegion:(VNFaceLandmarkRegion2D *)region
{
  if (region == nil || region.pointCount < 3) {
    return -1;
  }

  const CGPoint *points = region.normalizedPoints;
  CGFloat minX = points[0].x;
  CGFloat maxX = points[0].x;
  CGFloat minY = points[0].y;
  CGFloat maxY = points[0].y;
  for (NSUInteger i = 1; i < region.pointCount; i++) {
    minX = MIN(minX, points[i].x);
    maxX = MAX(maxX, points[i].x);
    minY = MIN(minY, points[i].y);
    maxY = MAX(maxY, points[i].y);
  }

  CGFloat width = maxX - minX;
  CGFloat height = maxY - minY;
  if (width < 1e-5) {
    return -1;
  }
  return height / width;
}

- (CGFloat)sharpnessFromCaptureQuality:(CGFloat)quality
{
  return fminf(100.0f, fmaxf(0.0f, 8.0f + quality * 92.0f));
}

- (NSDictionary *)eyesOpenFromLandmarks:(VNFaceLandmarks2D *)landmarks
{
  static const CGFloat kOpenThreshold = 0.22f;
  static const CGFloat kClosedThreshold = 0.14f;

  CGFloat leftRatio = [self eyeAspectRatioFromRegion:landmarks.leftEye];
  CGFloat rightRatio = [self eyeAspectRatioFromRegion:landmarks.rightEye];
  BOOL hasLeft = leftRatio >= 0;
  BOOL hasRight = rightRatio >= 0;

  if (!hasLeft && !hasRight) {
    return @{@"value" : @NO, @"confidence" : @(50.0f)};
  }

  CGFloat minRatio = hasLeft && hasRight ? MIN(leftRatio, rightRatio)
                                         : hasLeft ? leftRatio
                                                   : rightRatio;

  if (minRatio >= kOpenThreshold) {
    CGFloat confidence = MIN(98.0f, 86.0f + (minRatio - kOpenThreshold) * 200.0f);
    return @{@"value" : @YES, @"confidence" : @(confidence)};
  }
  if (minRatio <= kClosedThreshold) {
    CGFloat confidence = MIN(98.0f, 86.0f + (kClosedThreshold - minRatio) * 400.0f);
    return @{@"value" : @NO, @"confidence" : @(confidence)};
  }

  return @{@"value" : @NO, @"confidence" : @(70.0f)};
}

- (NSDictionary *)faceDictionaryFromObservation:(VNFaceObservation *)face
                                          index:(NSInteger)index
                                captureQuality:(NSNumber *)captureQuality
{
  CGRect box = face.boundingBox;
  CGFloat left = box.origin.x;
  CGFloat top = 1.0 - box.origin.y - box.size.height;
  CGFloat width = box.size.width;
  CGFloat height = box.size.height;

  CGFloat sharpness = 50.0f;
  if (captureQuality != nil) {
    sharpness = [self sharpnessFromCaptureQuality:captureQuality.floatValue];
  } else if (face.faceCaptureQuality != nil) {
    sharpness = [self sharpnessFromCaptureQuality:face.faceCaptureQuality.floatValue];
  }

  NSDictionary *eyesOpen = [self eyesOpenFromLandmarks:face.landmarks];

  return @{
    @"boundingBox" : @{
      @"left" : @(left),
      @"top" : @(top),
      @"width" : @(width),
      @"height" : @(height),
    },
    @"eyesOpen" : eyesOpen,
    @"sharpness" : @(sharpness),
    @"brightness" : @(60),
    @"landmarks" : [self landmarksFromObservation:face],
    @"pose" : @{
      @"pitch" : @(face.pitch != nil ? face.pitch.floatValue : 0),
      @"roll" : @(face.roll != nil ? face.roll.floatValue : 0),
      @"yaw" : @(face.yaw != nil ? face.yaw.floatValue : 0),
    },
    @"faceId" : [NSString stringWithFormat:@"local-face-%ld", (long)index],
  };
}

RCT_EXPORT_METHOD(detectFacesForCulling:(NSString *)uri
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    @try {
      NSString *path = [self pathFromUri:uri];
      if (path.length == 0 ||
          ![[NSFileManager defaultManager] fileExistsAtPath:path]) {
        dispatch_async(dispatch_get_main_queue(), ^{
          reject(@"ENOENT", @"Photo file not found", nil);
        });
        return;
      }

      NSURL *url = [NSURL fileURLWithPath:path isDirectory:NO];
      VNDetectFaceLandmarksRequest *landmarksRequest =
          [[VNDetectFaceLandmarksRequest alloc] init];
      VNDetectFaceCaptureQualityRequest *qualityRequest =
          [[VNDetectFaceCaptureQualityRequest alloc] init];

      VNImageRequestHandler *handler =
          [[VNImageRequestHandler alloc] initWithURL:url options:@{}];
      NSError *error = nil;
      BOOL performed = [handler performRequests:@[ landmarksRequest ] error:&error];
      if (!performed) {
        dispatch_async(dispatch_get_main_queue(), ^{
          reject(@"EDETECT", error.localizedDescription ?: @"Face detection failed", error);
        });
        return;
      }

      NSArray<VNFaceObservation *> *landmarkFaces = landmarksRequest.results;
      if (landmarkFaces.count == 0) {
        dispatch_async(dispatch_get_main_queue(), ^{
          resolve(@[]);
        });
        return;
      }

      qualityRequest.inputFaceObservations = landmarkFaces;
      performed = [handler performRequests:@[ qualityRequest ] error:&error];
      if (!performed) {
        dispatch_async(dispatch_get_main_queue(), ^{
          reject(@"EDETECT", error.localizedDescription ?: @"Face quality analysis failed", error);
        });
        return;
      }

      NSMutableDictionary<NSUUID *, NSNumber *> *qualityByFaceId =
          [NSMutableDictionary dictionary];
      for (VNFaceObservation *qualityFace in qualityRequest.results) {
        if (qualityFace.faceCaptureQuality != nil) {
          qualityByFaceId[qualityFace.uuid] = qualityFace.faceCaptureQuality;
        }
      }

      NSMutableArray *faces = [NSMutableArray arrayWithCapacity:landmarkFaces.count];
      NSArray<VNFaceObservation *> *qualityFaces = qualityRequest.results;
      for (NSInteger index = 0; index < (NSInteger)landmarkFaces.count; index++) {
        VNFaceObservation *face = landmarkFaces[index];
        NSNumber *captureQuality = qualityByFaceId[face.uuid];
        if (captureQuality == nil && index < (NSInteger)qualityFaces.count) {
          captureQuality = qualityFaces[index].faceCaptureQuality;
        }
        [faces addObject:[self faceDictionaryFromObservation:face
                                                       index:index
                                             captureQuality:captureQuality]];
      }

      dispatch_async(dispatch_get_main_queue(), ^{
        resolve(faces);
      });
    } @catch (NSException *exception) {
      dispatch_async(dispatch_get_main_queue(), ^{
        reject(@"EDETECT", exception.reason ?: @"Face detection failed", nil);
      });
    }
  });
}

RCT_EXPORT_METHOD(copyPhoto:(NSString *)albumId
                  sourceUri:(NSString *)sourceUri
                  fileName:(NSString *)fileName
                  photoId:(NSString *)photoId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    @try {
      NSString *sourcePath = [self pathFromUri:sourceUri];
      if (sourcePath.length == 0 ||
          ![[NSFileManager defaultManager] fileExistsAtPath:sourcePath]) {
        reject(@"ENOENT", @"Source file not found", nil);
        return;
      }

      NSString *albumDir = [self cullingAlbumDirectory:albumId];
      NSError *dirError = nil;
      [[NSFileManager defaultManager] createDirectoryAtPath:albumDir
                                withIntermediateDirectories:YES
                                                 attributes:nil
                                                      error:&dirError];
      if (dirError != nil) {
        reject(@"EACCES", dirError.localizedDescription, dirError);
        return;
      }

      NSString *ext = [(fileName ?: @"photo.jpg") pathExtension];
      NSString *destId = photoId.length > 0 ? photoId : [[NSUUID UUID] UUIDString];
      NSString *destName =
          ext.length > 0 ? [NSString stringWithFormat:@"%@.%@", destId, ext]
                         : destId;
      NSString *destPath = [albumDir stringByAppendingPathComponent:destName];
      NSError *copyError = nil;
      [[NSFileManager defaultManager] copyItemAtPath:sourcePath
                                              toPath:destPath
                                               error:&copyError];
      if (copyError != nil) {
        reject(@"ECOPY", copyError.localizedDescription, copyError);
        return;
      }

      NSDictionary *attributes =
          [[NSFileManager defaultManager] attributesOfItemAtPath:destPath error:nil];
      NSNumber *fileSize = attributes[NSFileSize];
      ext = destPath.pathExtension.lowercaseString;
      NSString *type = ext.length > 0
                           ? [NSString stringWithFormat:@"public.%@", ext]
                           : @"image/jpeg";

      resolve(@{
        @"uri" : [NSString stringWithFormat:@"file://%@", destPath],
        @"name" : destName,
        @"size" : fileSize ?: @(0),
        @"type" : type,
      });
    } @catch (NSException *exception) {
      reject(@"EUNKNOWN", exception.reason, nil);
    }
  });
}

RCT_EXPORT_METHOD(listPhotos:(NSString *)albumId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    NSString *albumDir = [self cullingAlbumDirectory:albumId];
    NSError *error = nil;
    NSArray<NSString *> *entries =
        [[NSFileManager defaultManager] contentsOfDirectoryAtPath:albumDir error:&error];
    if (error != nil) {
      if (error.code == NSFileReadNoSuchFileError) {
        resolve(@[]);
        return;
      }
      reject(@"EREAD", error.localizedDescription, error);
      return;
    }

    NSMutableArray *files = [NSMutableArray array];
    for (NSString *entry in entries) {
      if ([entry hasPrefix:@"."]) {
        continue;
      }
      NSString *path = [albumDir stringByAppendingPathComponent:entry];
      BOOL isDirectory = NO;
      if (![[NSFileManager defaultManager] fileExistsAtPath:path isDirectory:&isDirectory] ||
          isDirectory) {
        continue;
      }

      NSDictionary *attributes =
          [[NSFileManager defaultManager] attributesOfItemAtPath:path error:nil];
      NSNumber *fileSize = attributes[NSFileSize];
      NSString *ext = entry.pathExtension.lowercaseString;
      NSString *type = ext.length > 0
                           ? [NSString stringWithFormat:@"public.%@", ext]
                           : @"image/jpeg";

      [files addObject:@{
        @"uri" : [NSString stringWithFormat:@"file://%@", path],
        @"name" : entry,
        @"size" : fileSize ?: @(0),
        @"type" : type,
      }];
    }

    resolve(files);
  });
}

RCT_EXPORT_METHOD(deletePhoto:(NSString *)uri
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    NSString *path = [self pathFromUri:uri];
    if (path.length == 0) {
      resolve(@(YES));
      return;
    }
    if ([[NSFileManager defaultManager] fileExistsAtPath:path]) {
      NSError *error = nil;
      [[NSFileManager defaultManager] removeItemAtPath:path error:&error];
      if (error != nil) {
        reject(@"EDELETE", error.localizedDescription, error);
        return;
      }
    }
    resolve(@(YES));
  });
}

RCT_EXPORT_METHOD(deleteAlbum:(NSString *)albumId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    NSString *albumDir = [self cullingAlbumDirectory:albumId];
    if ([[NSFileManager defaultManager] fileExistsAtPath:albumDir]) {
      NSError *error = nil;
      [[NSFileManager defaultManager] removeItemAtPath:albumDir error:&error];
      if (error != nil) {
        reject(@"EDELETE", error.localizedDescription, error);
        return;
      }
    }
    resolve(@(YES));
  });
}

- (NSDictionary *)orientedImageDimensionsAtPath:(NSString *)path
{
  NSURL *url = [NSURL fileURLWithPath:path isDirectory:NO];
  CGImageSourceRef source = CGImageSourceCreateWithURL((__bridge CFURLRef)url, NULL);
  if (source == NULL) {
    return nil;
  }

  CFDictionaryRef properties = CGImageSourceCopyPropertiesAtIndex(source, 0, NULL);
  CFRelease(source);
  if (properties == NULL) {
    return nil;
  }

  NSNumber *pixelWidth =
      (__bridge NSNumber *)CFDictionaryGetValue(properties, kCGImagePropertyPixelWidth);
  NSNumber *pixelHeight =
      (__bridge NSNumber *)CFDictionaryGetValue(properties, kCGImagePropertyPixelHeight);
  NSNumber *orientation =
      (__bridge NSNumber *)CFDictionaryGetValue(properties, kCGImagePropertyOrientation);
  CFRelease(properties);

  if (pixelWidth == nil || pixelHeight == nil) {
    return nil;
  }

  CGFloat width = pixelWidth.doubleValue;
  CGFloat height = pixelHeight.doubleValue;
  NSInteger orientationValue = orientation != nil ? orientation.integerValue : 1;

  if (orientationValue >= 5 && orientationValue <= 8) {
    CGFloat tmp = width;
    width = height;
    height = tmp;
  }

  return @{
    @"width" : @(width),
    @"height" : @(height),
  };
}

RCT_EXPORT_METHOD(getImageDimensions:(NSString *)uri
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    @try {
      NSString *path = [self pathFromUri:uri];
      if (path.length == 0 ||
          ![[NSFileManager defaultManager] fileExistsAtPath:path]) {
        dispatch_async(dispatch_get_main_queue(), ^{
          reject(@"ENOENT", @"Photo file not found", nil);
        });
        return;
      }

      NSURL *url = [NSURL fileURLWithPath:path isDirectory:NO];
      NSDictionary *dimensions = [self orientedImageDimensionsAtPath:path];
      if (dimensions == nil) {
        NSImage *image = [[NSImage alloc] initWithContentsOfURL:url];
        if (image == nil) {
          dispatch_async(dispatch_get_main_queue(), ^{
            reject(@"EIMAGE", @"Unable to read image", nil);
          });
          return;
        }

        NSSize size = image.size;
        dimensions = @{
          @"width" : @(size.width),
          @"height" : @(size.height),
        };
      }

      NSNumber *width = dimensions[@"width"];
      NSNumber *height = dimensions[@"height"];
      if (width.doubleValue <= 0 || height.doubleValue <= 0) {
        dispatch_async(dispatch_get_main_queue(), ^{
          reject(@"EIMAGE", @"Invalid image dimensions", nil);
        });
        return;
      }

      dispatch_async(dispatch_get_main_queue(), ^{
        resolve(@{
          @"width" : width,
          @"height" : height,
        });
      });
    } @catch (NSException *exception) {
      dispatch_async(dispatch_get_main_queue(), ^{
        reject(@"EUNKNOWN", exception.reason, nil);
      });
    }
  });
}

@end
