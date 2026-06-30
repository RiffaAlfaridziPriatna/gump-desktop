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
  static const CGFloat kOpenThreshold = 0.25f;
  static const CGFloat kClosedThreshold = 0.17f;

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

  // Partially open / squinting — between fully closed and fully open.
  return @{@"value" : @NO, @"confidence" : @(72.0f)};
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
      VNDetectFaceRectanglesRequest *rectRequest =
          [[VNDetectFaceRectanglesRequest alloc] init];
      rectRequest.revision = VNDetectFaceRectanglesRequestRevision3;

      VNImageRequestHandler *handler =
          [[VNImageRequestHandler alloc] initWithURL:url options:@{}];
      NSError *error = nil;
      BOOL performed = [handler performRequests:@[ rectRequest ] error:&error];
      if (!performed) {
        dispatch_async(dispatch_get_main_queue(), ^{
          reject(@"EDETECT", error.localizedDescription ?: @"Face detection failed", error);
        });
        return;
      }

      NSArray<VNFaceObservation *> *rectFaces = rectRequest.results;
      if (rectFaces.count == 0) {
        dispatch_async(dispatch_get_main_queue(), ^{
          resolve(@[]);
        });
        return;
      }

      VNDetectFaceLandmarksRequest *landmarksRequest =
          [[VNDetectFaceLandmarksRequest alloc] init];
      landmarksRequest.revision = VNDetectFaceLandmarksRequestRevision3;
      landmarksRequest.inputFaceObservations = rectFaces;

      performed = [handler performRequests:@[ landmarksRequest ] error:&error];
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

      VNDetectFaceCaptureQualityRequest *qualityRequest =
          [[VNDetectFaceCaptureQualityRequest alloc] init];
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
        dispatch_async(dispatch_get_main_queue(), ^{
          reject(@"ENOENT", @"Source file not found", nil);
        });
        return;
      }

      NSString *albumDir = [self cullingAlbumDirectory:albumId];
      NSError *dirError = nil;
      [[NSFileManager defaultManager] createDirectoryAtPath:albumDir
                                withIntermediateDirectories:YES
                                                 attributes:nil
                                                      error:&dirError];
      if (dirError != nil) {
        dispatch_async(dispatch_get_main_queue(), ^{
          reject(@"EACCES", dirError.localizedDescription, dirError);
        });
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
        dispatch_async(dispatch_get_main_queue(), ^{
          reject(@"ECOPY", copyError.localizedDescription, copyError);
        });
        return;
      }

      NSDictionary *attributes =
          [[NSFileManager defaultManager] attributesOfItemAtPath:destPath error:nil];
      NSNumber *fileSize = attributes[NSFileSize];
      ext = destPath.pathExtension.lowercaseString;
      NSString *type = ext.length > 0
                           ? [NSString stringWithFormat:@"public.%@", ext]
                           : @"image/jpeg";
      NSDictionary *result = @{
        @"uri" : [NSString stringWithFormat:@"file://%@", destPath],
        @"name" : destName,
        @"size" : fileSize ?: @(0),
        @"type" : type,
      };

      dispatch_async(dispatch_get_main_queue(), ^{
        resolve(result);
      });
    } @catch (NSException *exception) {
      dispatch_async(dispatch_get_main_queue(), ^{
        reject(@"EUNKNOWN", exception.reason, nil);
      });
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

RCT_EXPORT_METHOD(readFileSlice:(NSString *)uri
                  start:(nonnull NSNumber *)start
                  end:(nonnull NSNumber *)end
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    @try {
      NSString *path = [self pathFromUri:uri];
      if (path.length == 0 ||
          ![[NSFileManager defaultManager] fileExistsAtPath:path]) {
        reject(@"ENOENT", @"File not found", nil);
        return;
      }

      unsigned long long startOffset = start.unsignedLongLongValue;
      unsigned long long endOffset = end.unsignedLongLongValue;
      if (endOffset < startOffset) {
        reject(@"EINVAL", @"Invalid slice range", nil);
        return;
      }

      NSUInteger length = (NSUInteger)(endOffset - startOffset);
      NSFileHandle *handle = [NSFileHandle fileHandleForReadingAtPath:path];
      if (handle == nil) {
        reject(@"EOPEN", @"Unable to open file", nil);
        return;
      }

      [handle seekToFileOffset:startOffset];
      NSData *data = [handle readDataOfLength:length];
      [handle closeFile];

      if (data.length != length) {
        reject(@"EREAD", @"Unexpected end of file while reading slice", nil);
        return;
      }

      resolve(@{
        @"data" : [data base64EncodedStringWithOptions:0],
        @"size" : @(data.length),
      });
    } @catch (NSException *exception) {
      reject(@"EUNKNOWN", exception.reason, nil);
    }
  });
}

RCT_EXPORT_METHOD(uploadFilePart:(NSString *)uri
                  start:(nonnull NSNumber *)start
                  end:(nonnull NSNumber *)end
                  uploadUrl:(NSString *)uploadUrl
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    @try {
      NSString *path = [self pathFromUri:uri];
      if (path.length == 0 ||
          ![[NSFileManager defaultManager] fileExistsAtPath:path]) {
        reject(@"ENOENT", @"File not found", nil);
        return;
      }

      unsigned long long startOffset = start.unsignedLongLongValue;
      unsigned long long endOffset = end.unsignedLongLongValue;
      if (endOffset < startOffset) {
        reject(@"EINVAL", @"Invalid slice range", nil);
        return;
      }

      NSUInteger length = (NSUInteger)(endOffset - startOffset);
      NSFileHandle *handle = [NSFileHandle fileHandleForReadingAtPath:path];
      if (handle == nil) {
        reject(@"EOPEN", @"Unable to open file", nil);
        return;
      }

      [handle seekToFileOffset:startOffset];
      NSData *data = [handle readDataOfLength:length];
      [handle closeFile];

      if (data.length != length) {
        reject(@"EREAD", @"Unexpected end of file while reading slice", nil);
        return;
      }

      NSURL *url = [NSURL URLWithString:uploadUrl];
      if (url == nil) {
        reject(@"EINVAL", @"Invalid upload URL", nil);
        return;
      }

      NSMutableURLRequest *request =
          [NSMutableURLRequest requestWithURL:url
                                  cachePolicy:NSURLRequestUseProtocolCachePolicy
                              timeoutInterval:60.0];
      request.HTTPMethod = @"PUT";
      request.HTTPBody = data;

      dispatch_semaphore_t sema = dispatch_semaphore_create(0);
      __block NSHTTPURLResponse *httpResponse = nil;
      __block NSError *requestError = nil;

      NSURLSessionDataTask *task = [[NSURLSession sharedSession]
          dataTaskWithRequest:request
            completionHandler:^(__unused NSData *responseData,
                                NSURLResponse *response,
                                NSError *error) {
              requestError = error;
              if ([response isKindOfClass:[NSHTTPURLResponse class]]) {
                httpResponse = (NSHTTPURLResponse *)response;
              }
              dispatch_semaphore_signal(sema);
            }];
      [task resume];
      dispatch_semaphore_wait(sema, DISPATCH_TIME_FOREVER);

      if (requestError != nil) {
        reject(@"ENETWORK", requestError.localizedDescription, requestError);
        return;
      }

      if (httpResponse == nil || httpResponse.statusCode < 200 ||
          httpResponse.statusCode >= 300) {
        NSInteger status = httpResponse != nil ? httpResponse.statusCode : 0;
        reject(@"EUPLOAD",
               [NSString stringWithFormat:@"Upload part failed with HTTP %ld",
                                          (long)status],
               nil);
        return;
      }

      NSString *rawETag = httpResponse.allHeaderFields[@"ETag"];
      if (rawETag == nil || rawETag.length == 0) {
        reject(@"EUPLOAD", @"Missing ETag header", nil);
        return;
      }

      NSString *eTag =
          [rawETag stringByReplacingOccurrencesOfString:@"\"" withString:@""];
      resolve(@{@"eTag" : eTag});
    } @catch (NSException *exception) {
      reject(@"EUNKNOWN", exception.reason, nil);
    }
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

- (NSNumber *)captureTimestampMillisFromPath:(NSString *)path
{
  NSURL *url = [NSURL fileURLWithPath:path isDirectory:NO];
  CGImageSourceRef source = CGImageSourceCreateWithURL((__bridge CFURLRef)url, NULL);
  if (source == NULL) {
    return nil;
  }

  NSDictionary *properties = (__bridge_transfer NSDictionary *)CGImageSourceCopyPropertiesAtIndex(source, 0, NULL);
  CFRelease(source);
  if (properties == nil) {
    return nil;
  }

  NSString *dateString = nil;
  NSDictionary *exif = properties[(NSString *)kCGImagePropertyExifDictionary];
  if ([exif isKindOfClass:[NSDictionary class]]) {
    dateString = exif[(NSString *)kCGImagePropertyExifDateTimeOriginal];
    if (dateString.length == 0) {
      dateString = exif[(NSString *)kCGImagePropertyExifDateTimeDigitized];
    }
    if (dateString.length == 0) {
      dateString = exif[@"DateTime"];
    }
  }
  if (dateString.length == 0) {
    NSDictionary *tiff = properties[(NSString *)kCGImagePropertyTIFFDictionary];
    if ([tiff isKindOfClass:[NSDictionary class]]) {
      dateString = tiff[(NSString *)kCGImagePropertyTIFFDateTime];
    }
  }
  if (dateString.length == 0) {
    return nil;
  }

  NSDateFormatter *formatter = [[NSDateFormatter alloc] init];
  formatter.locale = [NSLocale localeWithLocaleIdentifier:@"en_US_POSIX"];
  formatter.timeZone = [NSTimeZone localTimeZone];
  formatter.dateFormat = @"yyyy:MM:dd HH:mm:ss";
  NSDate *date = [formatter dateFromString:dateString];
  if (date == nil) {
    return nil;
  }

  return @((long long)([date timeIntervalSince1970] * 1000.0));
}

- (NSString *)differenceHashHexFromPath:(NSString *)path
{
  NSURL *url = [NSURL fileURLWithPath:path isDirectory:NO];
  NSDictionary *options = @{
    (NSString *)kCGImageSourceCreateThumbnailFromImageAlways : @YES,
    (NSString *)kCGImageSourceThumbnailMaxPixelSize : @256,
    (NSString *)kCGImageSourceCreateThumbnailWithTransform : @YES,
  };
  CGImageSourceRef source = CGImageSourceCreateWithURL((__bridge CFURLRef)url, NULL);
  if (source == NULL) {
    return nil;
  }
  CGImageRef image = CGImageSourceCreateThumbnailAtIndex(source, 0, (__bridge CFDictionaryRef)options);
  CFRelease(source);
  if (image == NULL) {
    return nil;
  }

  uint8_t pixels[72];
  CGColorSpaceRef grayColorSpace = CGColorSpaceCreateDeviceGray();
  CGContextRef context = CGBitmapContextCreate(pixels, 9, 8, 8, 9, grayColorSpace, kCGImageAlphaNone);
  CGContextSetInterpolationQuality(context, kCGInterpolationLow);
  CGContextTranslateCTM(context, 0, 8);
  CGContextScaleCTM(context, 1.0, -1.0);
  CGContextDrawImage(context, CGRectMake(0, 0, 9, 8), image);
  CGContextRelease(context);
  CGColorSpaceRelease(grayColorSpace);
  CGImageRelease(image);

  uint64_t hash = 0;
  int bit = 0;
  for (int y = 0; y < 8; y++) {
    for (int x = 0; x < 8; x++) {
      if (pixels[y * 9 + x] > pixels[y * 9 + x + 1]) {
        hash |= (1ULL << (63 - bit));
      }
      bit++;
    }
  }
  return [NSString stringWithFormat:@"%016llx", hash];
}

RCT_EXPORT_METHOD(readImageCaptureTime:(NSString *)uri
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    NSString *path = [self pathFromUri:uri];
    if (path.length == 0 ||
        ![[NSFileManager defaultManager] fileExistsAtPath:path]) {
      dispatch_async(dispatch_get_main_queue(), ^{
        resolve([NSNull null]);
      });
      return;
    }

    NSNumber *timestamp = [self captureTimestampMillisFromPath:path];
    dispatch_async(dispatch_get_main_queue(), ^{
      resolve(timestamp ?: [NSNull null]);
    });
  });
}

RCT_EXPORT_METHOD(computePerceptualHash:(NSString *)uri
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    NSString *path = [self pathFromUri:uri];
    if (path.length == 0 ||
        ![[NSFileManager defaultManager] fileExistsAtPath:path]) {
      dispatch_async(dispatch_get_main_queue(), ^{
        resolve([NSNull null]);
      });
      return;
    }

    NSString *hash = [self differenceHashHexFromPath:path];
    dispatch_async(dispatch_get_main_queue(), ^{
      resolve(hash ?: [NSNull null]);
    });
  });
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
