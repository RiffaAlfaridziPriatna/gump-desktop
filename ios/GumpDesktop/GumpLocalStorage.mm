#import "GumpLocalStorage.h"

#import <ImageIO/ImageIO.h>
#import <UIKit/UIKit.h>
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
  if (region == nil || region.pointCount < 4) {
    return -1;
  }

  const CGPoint *points = region.normalizedPoints;
  CGFloat minX = points[0].x;
  CGFloat maxX = points[0].x;
  for (NSUInteger i = 1; i < region.pointCount; i++) {
    minX = MIN(minX, points[i].x);
    maxX = MAX(maxX, points[i].x);
  }

  CGFloat width = maxX - minX;
  if (width < 1e-5) {
    return -1;
  }

  // Sort by X and measure vertical span in each half — avoids inflated EAR when
  // the full landmark bbox includes eyelid folds on closed eyes.
  NSMutableArray<NSValue *> *sorted = [NSMutableArray arrayWithCapacity:region.pointCount];
  for (NSUInteger i = 0; i < region.pointCount; i++) {
    [sorted addObject:[NSValue valueWithCGPoint:points[i]]];
  }
  [sorted sortUsingComparator:^NSComparisonResult(NSValue *left, NSValue *right) {
    CGFloat leftX = left.CGPointValue.x;
    CGFloat rightX = right.CGPointValue.x;
    if (leftX < rightX) {
      return NSOrderedAscending;
    }
    if (leftX > rightX) {
      return NSOrderedDescending;
    }
    return NSOrderedSame;
  }];

  NSUInteger mid = region.pointCount / 2;
  NSUInteger leftCount = MAX((NSUInteger)2, mid);
  NSUInteger rightStart = region.pointCount > leftCount ? region.pointCount - leftCount : 0;

  CGFloat (^verticalSpanForRange)(NSUInteger, NSUInteger) = ^CGFloat(NSUInteger start, NSUInteger end) {
    if (end <= start) {
      return 0.0f;
    }
    CGFloat regionMinY = sorted[start].CGPointValue.y;
    CGFloat regionMaxY = regionMinY;
    for (NSUInteger i = start + 1; i < end; i++) {
      CGFloat y = sorted[i].CGPointValue.y;
      regionMinY = MIN(regionMinY, y);
      regionMaxY = MAX(regionMaxY, y);
    }
    return regionMaxY - regionMinY;
  };

  CGFloat leftSpan = verticalSpanForRange(0, leftCount);
  CGFloat rightSpan = verticalSpanForRange(rightStart, region.pointCount);
  CGFloat height = (leftSpan + rightSpan) / 2.0f;
  return height / width;
}

- (CGFloat)sharpnessFromCaptureQuality:(CGFloat)quality
{
  return fminf(100.0f, fmaxf(0.0f, 8.0f + quality * 92.0f));
}

- (CGFloat)sharpnessFromCGImage:(CGImageRef)cgImage faceBox:(CGRect)box
{
  size_t imageWidth = CGImageGetWidth(cgImage);
  size_t imageHeight = CGImageGetHeight(cgImage);
  if (imageWidth < 3 || imageHeight < 3) {
    return 50.0f;
  }

  NSInteger left = (NSInteger)lround(box.origin.x * (CGFloat)imageWidth);
  NSInteger bottom = (NSInteger)lround(box.origin.y * (CGFloat)imageHeight);
  NSInteger faceWidth = (NSInteger)lround(box.size.width * (CGFloat)imageWidth);
  NSInteger faceHeight = (NSInteger)lround(box.size.height * (CGFloat)imageHeight);
  NSInteger top = (NSInteger)imageHeight - bottom - faceHeight;
  NSInteger right = left + faceWidth;
  NSInteger bottomPixel = top + faceHeight;

  left = MAX(0, MIN((NSInteger)imageWidth - 1, left));
  top = MAX(0, MIN((NSInteger)imageHeight - 1, top));
  right = MAX(left + 2, MIN((NSInteger)imageWidth, right));
  bottomPixel = MAX(top + 2, MIN((NSInteger)imageHeight, bottomPixel));

  CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
  size_t bytesPerRow = imageWidth * 4;
  NSMutableData *pixelData = [NSMutableData dataWithLength:bytesPerRow * imageHeight];
  CGContextRef context = CGBitmapContextCreate(
      pixelData.mutableBytes, imageWidth, imageHeight, 8, bytesPerRow, colorSpace,
      kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big);
  CGColorSpaceRelease(colorSpace);
  if (context == NULL) {
    return 50.0f;
  }

  CGContextDrawImage(context, CGRectMake(0, 0, imageWidth, imageHeight), cgImage);
  CGContextRelease(context);

  const uint8_t *bytes = (const uint8_t *)pixelData.bytes;
  double sum = 0.0;
  double sumSquared = 0.0;
  NSInteger count = 0;

  for (NSInteger y = top + 1; y < bottomPixel - 1; y++) {
    for (NSInteger x = left + 1; x < right - 1; x++) {
      CGFloat (^grayAt)(NSInteger, NSInteger) = ^CGFloat(NSInteger px, NSInteger py) {
        size_t index = (size_t)py * bytesPerRow + (size_t)px * 4;
        return bytes[index] * 0.299f + bytes[index + 1] * 0.587f + bytes[index + 2] * 0.114f;
      };

      double laplacian = -grayAt(x, y - 1) - grayAt(x - 1, y) + 4.0 * grayAt(x, y) -
                         grayAt(x + 1, y) - grayAt(x, y + 1);
      sum += laplacian;
      sumSquared += laplacian * laplacian;
      count++;
    }
  }

  if (count == 0) {
    return 50.0f;
  }

  double mean = sum / (double)count;
  double variance = (sumSquared / (double)count) - mean * mean;
  CGFloat normalized = (CGFloat)(log(variance + 1.0) / log(1000.0) * 100.0);
  return fminf(100.0f, fmaxf(0.0f, normalized));
}

- (CGPoint)centroidOfLandmarkRegion:(VNFaceLandmarkRegion2D *)region
{
  if (region == nil || region.pointCount == 0) {
    return CGPointMake(-1.0f, -1.0f);
  }

  const CGPoint *points = region.normalizedPoints;
  CGFloat sumX = 0.0f;
  CGFloat sumY = 0.0f;
  for (NSUInteger i = 0; i < region.pointCount; i++) {
    sumX += points[i].x;
    sumY += points[i].y;
  }
  return CGPointMake(sumX / (CGFloat)region.pointCount, sumY / (CGFloat)region.pointCount);
}

- (CGFloat)landmarkHorizontalSpan:(VNFaceLandmarkRegion2D *)region
{
  if (region == nil || region.pointCount == 0) {
    return -1.0f;
  }

  const CGPoint *points = region.normalizedPoints;
  CGFloat minX = points[0].x;
  CGFloat maxX = points[0].x;
  for (NSUInteger i = 1; i < region.pointCount; i++) {
    minX = MIN(minX, points[i].x);
    maxX = MAX(maxX, points[i].x);
  }
  return maxX - minX;
}

- (BOOL)hasPlausibleLandmarkLayout:(VNFaceLandmarks2D *)landmarks
{
  CGPoint leftEye = [self centroidOfLandmarkRegion:landmarks.leftEye];
  CGPoint rightEye = [self centroidOfLandmarkRegion:landmarks.rightEye];
  CGPoint nose = [self centroidOfLandmarkRegion:landmarks.nose];
  VNFaceLandmarkRegion2D *mouthRegion = landmarks.outerLips ?: landmarks.innerLips;
  CGPoint mouth = [self centroidOfLandmarkRegion:mouthRegion];

  if (leftEye.x < 0 || rightEye.x < 0 || nose.x < 0 || mouth.x < 0) {
    return NO;
  }

  if (landmarks.faceContour == nil || landmarks.faceContour.pointCount < 8) {
    return NO;
  }

  if (landmarks.leftEyebrow == nil || landmarks.leftEyebrow.pointCount < 2 ||
      landmarks.rightEyebrow == nil || landmarks.rightEyebrow.pointCount < 2) {
    return NO;
  }

  if (leftEye.x >= rightEye.x) {
    return NO;
  }

  CGFloat eyeDistance = rightEye.x - leftEye.x;
  if (eyeDistance < 0.15f || eyeDistance > 0.65f) {
    return NO;
  }

  if (fabs(leftEye.y - rightEye.y) > 0.12f) {
    return NO;
  }

  CGFloat eyeCenterX = (leftEye.x + rightEye.x) / 2.0f;
  if (fabs(nose.x - eyeCenterX) > eyeDistance * 0.45f) {
    return NO;
  }

  CGFloat eyesY = (leftEye.y + rightEye.y) / 2.0f;
  if (eyesY <= nose.y || nose.y <= mouth.y) {
    return NO;
  }

  if (eyesY < 0.48f || mouth.y > 0.52f) {
    return NO;
  }

  CGFloat eyeToNose = eyesY - nose.y;
  CGFloat noseToMouth = nose.y - mouth.y;
  if (eyeToNose < 0.12f || eyeToNose > 0.45f) {
    return NO;
  }
  if (noseToMouth < 0.08f || noseToMouth > 0.35f) {
    return NO;
  }

  CGFloat leftEyeWidth = [self landmarkHorizontalSpan:landmarks.leftEye];
  CGFloat rightEyeWidth = [self landmarkHorizontalSpan:landmarks.rightEye];
  CGFloat mouthWidth = [self landmarkHorizontalSpan:mouthRegion];
  if (leftEyeWidth < 0.06f || leftEyeWidth > 0.40f ||
      rightEyeWidth < 0.06f || rightEyeWidth > 0.40f) {
    return NO;
  }
  if (mouthWidth < eyeDistance * 0.55f) {
    return NO;
  }

  return YES;
}

- (NSDictionary *)eyesOpenFromLandmarks:(VNFaceLandmarks2D *)landmarks
{
  static const CGFloat kOpenAvgThreshold = 0.18f;
  static const CGFloat kOpenMinThreshold = 0.14f;
  static const CGFloat kClosedMaxThreshold = 0.14f;
  static const CGFloat kClosedAvgThreshold = 0.12f;

  CGFloat leftRatio = [self eyeAspectRatioFromRegion:landmarks.leftEye];
  CGFloat rightRatio = [self eyeAspectRatioFromRegion:landmarks.rightEye];
  BOOL hasLeft = leftRatio >= 0;
  BOOL hasRight = rightRatio >= 0;

  if (!hasLeft && !hasRight) {
    return @{@"value" : @NO, @"confidence" : @(50.0f)};
  }

  CGFloat minRatio;
  CGFloat avgRatio;
  CGFloat maxRatio;
  if (hasLeft && hasRight) {
    minRatio = MIN(leftRatio, rightRatio);
    maxRatio = MAX(leftRatio, rightRatio);
    avgRatio = (leftRatio + rightRatio) / 2.0f;
  } else {
    minRatio = hasLeft ? leftRatio : rightRatio;
    maxRatio = minRatio;
    avgRatio = minRatio;
  }

  if (avgRatio >= kOpenAvgThreshold && minRatio >= kOpenMinThreshold) {
    CGFloat confidence = MIN(98.0f, 86.0f + (avgRatio - kOpenAvgThreshold) * 250.0f);
    return @{@"value" : @YES, @"confidence" : @(confidence)};
  }
  if (maxRatio <= kClosedMaxThreshold || avgRatio <= kClosedAvgThreshold) {
    CGFloat confidence = MIN(98.0f, 86.0f + (kClosedMaxThreshold - maxRatio) * 400.0f);
    return @{@"value" : @NO, @"confidence" : @(confidence)};
  }

  return @{@"value" : @NO, @"confidence" : @(72.0f)};
}

- (NSDictionary *)faceDictionaryFromObservation:(VNFaceObservation *)face
                                          index:(NSInteger)index
                                captureQuality:(NSNumber *)captureQuality
                                        cgImage:(CGImageRef)cgImage
{
  CGRect box = face.boundingBox;
  CGFloat left = box.origin.x;
  CGFloat top = 1.0 - box.origin.y - box.size.height;
  CGFloat width = box.size.width;
  CGFloat height = box.size.height;

  CGFloat sharpness = 50.0f;
  if (cgImage != NULL) {
    sharpness = [self sharpnessFromCGImage:cgImage faceBox:box];
  }
  if (captureQuality != nil) {
    CGFloat qualitySharpness = [self sharpnessFromCaptureQuality:captureQuality.floatValue];
    sharpness = MAX(sharpness, qualitySharpness);
  } else if (face.faceCaptureQuality != nil) {
    CGFloat qualitySharpness =
        [self sharpnessFromCaptureQuality:face.faceCaptureQuality.floatValue];
    sharpness = MAX(sharpness, qualitySharpness);
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

static const CGFloat kGumpFaceBoxIoUThreshold = 0.50f;
static const CGFloat kGumpTileOverlapFraction = 0.25f;
static const NSUInteger kGumpMinFacesToSkipTiling = 8;
static const NSUInteger kGumpMinPixelsForTiling = 2000000;

- (CGFloat)intersectionOverUnionForBoxA:(CGRect)a boxB:(CGRect)b
{
  CGFloat intersectLeft = MAX(a.origin.x, b.origin.x);
  CGFloat intersectBottom = MAX(a.origin.y, b.origin.y);
  CGFloat intersectRight = MIN(CGRectGetMaxX(a), CGRectGetMaxX(b));
  CGFloat intersectTop = MIN(CGRectGetMaxY(a), CGRectGetMaxY(b));
  CGFloat intersectWidth = MAX(0.0f, intersectRight - intersectLeft);
  CGFloat intersectHeight = MAX(0.0f, intersectTop - intersectBottom);
  CGFloat intersection = intersectWidth * intersectHeight;
  if (intersection <= 0.0f) {
    return 0.0f;
  }

  CGFloat unionArea = a.size.width * a.size.height + b.size.width * b.size.height - intersection;
  if (unionArea <= 0.0f) {
    return 0.0f;
  }
  return intersection / unionArea;
}

- (NSArray<VNFaceObservation *> *)deduplicateFaceObservations:
    (NSArray<VNFaceObservation *> *)observations
{
  if (observations.count <= 1) {
    return observations;
  }

  NSArray<VNFaceObservation *> *sorted =
      [observations sortedArrayUsingComparator:^NSComparisonResult(VNFaceObservation *left,
                                                                   VNFaceObservation *right) {
        if (left.confidence > right.confidence) {
          return NSOrderedAscending;
        }
        if (left.confidence < right.confidence) {
          return NSOrderedDescending;
        }
        return NSOrderedSame;
      }];

  NSMutableArray<VNFaceObservation *> *kept = [NSMutableArray array];
  for (VNFaceObservation *candidate in sorted) {
    BOOL overlapsExisting = NO;
    for (VNFaceObservation *existing in kept) {
      if ([self intersectionOverUnionForBoxA:candidate.boundingBox
                                       boxB:existing.boundingBox] >= kGumpFaceBoxIoUThreshold) {
        overlapsExisting = YES;
        break;
      }
    }
    if (!overlapsExisting) {
      [kept addObject:candidate];
    }
  }
  return kept;
}

- (CGRect)mapTileBoundingBox:(CGRect)tileBox
                tileCropRect:(CGRect)tileCrop
                  imageWidth:(size_t)imageWidth
                 imageHeight:(size_t)imageHeight
{
  CGFloat tileX = tileCrop.origin.x;
  CGFloat tileY = tileCrop.origin.y;
  CGFloat tileW = tileCrop.size.width;
  CGFloat tileH = tileCrop.size.height;
  CGFloat tileBottom = (CGFloat)imageHeight - tileY - tileH;

  CGFloat pixelX = tileX + tileBox.origin.x * tileW;
  CGFloat pixelY = tileBottom + tileBox.origin.y * tileH;
  CGFloat pixelW = tileBox.size.width * tileW;
  CGFloat pixelH = tileBox.size.height * tileH;

  return CGRectMake(pixelX / (CGFloat)imageWidth,
                    pixelY / (CGFloat)imageHeight,
                    pixelW / (CGFloat)imageWidth,
                    pixelH / (CGFloat)imageHeight);
}

- (VNFaceObservation *)faceObservationWithBoundingBox:(CGRect)boundingBox
{
  return [VNFaceObservation faceObservationWithRequestRevision:VNDetectFaceRectanglesRequestRevision2
                                                   boundingBox:boundingBox
                                                          roll:nil
                                                           yaw:nil
                                                         pitch:nil];
}

- (NSArray<VNFaceObservation *> *)detectRectanglesInCGImage:(CGImageRef)cgImage
                                                   revision:(NSUInteger)revision
{
  VNDetectFaceRectanglesRequest *rectRequest = [[VNDetectFaceRectanglesRequest alloc] init];
  rectRequest.revision = revision;

  VNImageRequestHandler *handler =
      [[VNImageRequestHandler alloc] initWithCGImage:cgImage options:@{}];
  NSError *error = nil;
  BOOL performed = [handler performRequests:@[ rectRequest ] error:&error];
  if (!performed) {
    return @[];
  }
  return rectRequest.results ?: @[];
}

- (NSArray<VNFaceObservation *> *)detectRectanglesTiledInCGImage:(CGImageRef)cgImage
                                                        revision:(NSUInteger)revision
                                                       gridCount:(NSUInteger)gridCount
{
  size_t imageWidth = CGImageGetWidth(cgImage);
  size_t imageHeight = CGImageGetHeight(cgImage);
  if (imageWidth == 0 || imageHeight == 0 || gridCount == 0) {
    return @[];
  }

  CGFloat tileWidth =
      (CGFloat)imageWidth / (CGFloat)gridCount * (1.0f + kGumpTileOverlapFraction);
  CGFloat tileHeight =
      (CGFloat)imageHeight / (CGFloat)gridCount * (1.0f + kGumpTileOverlapFraction);
  CGFloat stepX = (CGFloat)imageWidth / (CGFloat)gridCount;
  CGFloat stepY = (CGFloat)imageHeight / (CGFloat)gridCount;

  NSMutableArray<VNFaceObservation *> *merged = [NSMutableArray array];
  for (NSUInteger row = 0; row < gridCount; row++) {
    for (NSUInteger col = 0; col < gridCount; col++) {
      CGFloat originX = col * stepX;
      CGFloat originY = row * stepY;
      if (originX + tileWidth > imageWidth) {
        originX = MAX(0.0f, (CGFloat)imageWidth - tileWidth);
      }
      if (originY + tileHeight > imageHeight) {
        originY = MAX(0.0f, (CGFloat)imageHeight - tileHeight);
      }

      CGRect tileCrop = CGRectMake(originX, originY, tileWidth, tileHeight);
      CGImageRef tileImage = CGImageCreateWithImageInRect(cgImage, tileCrop);
      if (tileImage == NULL) {
        continue;
      }

      NSArray<VNFaceObservation *> *tileFaces =
          [self detectRectanglesInCGImage:tileImage revision:revision];
      CGImageRelease(tileImage);

      for (VNFaceObservation *tileFace in tileFaces) {
        CGRect mappedBox = [self mapTileBoundingBox:tileFace.boundingBox
                                       tileCropRect:tileCrop
                                         imageWidth:imageWidth
                                        imageHeight:imageHeight];
        VNFaceObservation *mappedFace = [self faceObservationWithBoundingBox:mappedBox];
        if (mappedFace != nil) {
          [merged addObject:mappedFace];
        }
      }
    }
  }

  return [self deduplicateFaceObservations:merged];
}

- (NSArray<VNFaceObservation *> *)collectFaceRectanglesFromCGImage:(CGImageRef)cgImage
{
  NSArray<VNFaceObservation *> *revisionThreeFaces =
      [self detectRectanglesInCGImage:cgImage revision:VNDetectFaceRectanglesRequestRevision3];
  NSArray<VNFaceObservation *> *revisionTwoFaces =
      [self detectRectanglesInCGImage:cgImage revision:VNDetectFaceRectanglesRequestRevision2];

  NSArray<VNFaceObservation *> *bestFullFrame =
      revisionThreeFaces.count >= revisionTwoFaces.count ? revisionThreeFaces : revisionTwoFaces;
  bestFullFrame = [self deduplicateFaceObservations:bestFullFrame];

  size_t imageWidth = CGImageGetWidth(cgImage);
  size_t imageHeight = CGImageGetHeight(cgImage);
  NSUInteger pixelCount = imageWidth * imageHeight;
  if (bestFullFrame.count >= kGumpMinFacesToSkipTiling ||
      pixelCount < kGumpMinPixelsForTiling) {
    return bestFullFrame;
  }

  NSArray<VNFaceObservation *> *tiledTwoByTwo =
      [self detectRectanglesTiledInCGImage:cgImage
                                  revision:VNDetectFaceRectanglesRequestRevision2
                                 gridCount:2];
  NSMutableArray<VNFaceObservation *> *combined =
      [NSMutableArray arrayWithArray:bestFullFrame];
  [combined addObjectsFromArray:tiledTwoByTwo];
  NSArray<VNFaceObservation *> *deduped = [self deduplicateFaceObservations:combined];
  if (deduped.count >= kGumpMinFacesToSkipTiling) {
    return deduped;
  }

  NSArray<VNFaceObservation *> *tiledThreeByThree =
      [self detectRectanglesTiledInCGImage:cgImage
                                  revision:VNDetectFaceRectanglesRequestRevision2
                                 gridCount:3];
  [combined addObjectsFromArray:tiledThreeByThree];
  return [self deduplicateFaceObservations:combined];
}

- (BOOL)passesBaseFaceBoxChecks:(VNFaceObservation *)face
                     imageWidth:(size_t)imageWidth
                    imageHeight:(size_t)imageHeight
{
  if (face.confidence < 0.65f) {
    return NO;
  }

  CGRect box = face.boundingBox;
  CGFloat facePixelWidth = box.size.width * (CGFloat)imageWidth;
  CGFloat facePixelHeight = box.size.height * (CGFloat)imageHeight;
  if (facePixelWidth < 30.0f || facePixelHeight < 30.0f) {
    return NO;
  }

  CGFloat faceAreaFraction =
      (box.size.width * box.size.height * (CGFloat)imageWidth * (CGFloat)imageHeight) /
      ((CGFloat)imageWidth * (CGFloat)imageHeight);
  if (faceAreaFraction < 0.0003f) {
    return NO;
  }

  return YES;
}

- (BOOL)hasRequiredFaceLandmarks:(VNFaceLandmarks2D *)landmarks
{
  if (landmarks == nil) {
    return NO;
  }

  if (landmarks.nose == nil || landmarks.nose.pointCount < 3) {
    return NO;
  }

  BOOL hasMouth = (landmarks.outerLips != nil && landmarks.outerLips.pointCount >= 3) ||
                  (landmarks.innerLips != nil && landmarks.innerLips.pointCount >= 3);
  return hasMouth;
}

- (BOOL)hasPlausibleProfileLandmarkLayout:(VNFaceLandmarks2D *)landmarks
{
  BOOL hasLeftEye = landmarks.leftEye != nil && landmarks.leftEye.pointCount >= 4;
  BOOL hasRightEye = landmarks.rightEye != nil && landmarks.rightEye.pointCount >= 4;
  if (!hasLeftEye && !hasRightEye) {
    return NO;
  }

  if (![self hasRequiredFaceLandmarks:landmarks]) {
    return NO;
  }

  if (landmarks.faceContour == nil || landmarks.faceContour.pointCount < 6) {
    return NO;
  }

  CGPoint nose = [self centroidOfLandmarkRegion:landmarks.nose];
  VNFaceLandmarkRegion2D *mouthRegion = landmarks.outerLips ?: landmarks.innerLips;
  CGPoint mouth = [self centroidOfLandmarkRegion:mouthRegion];
  if (nose.x < 0 || mouth.x < 0) {
    return NO;
  }

  CGFloat eyesY;
  if (hasLeftEye && hasRightEye) {
    CGPoint leftEye = [self centroidOfLandmarkRegion:landmarks.leftEye];
    CGPoint rightEye = [self centroidOfLandmarkRegion:landmarks.rightEye];
    eyesY = (leftEye.y + rightEye.y) / 2.0f;
  } else if (hasLeftEye) {
    eyesY = [self centroidOfLandmarkRegion:landmarks.leftEye].y;
  } else {
    eyesY = [self centroidOfLandmarkRegion:landmarks.rightEye].y;
  }

  if (eyesY <= nose.y || nose.y <= mouth.y) {
    return NO;
  }

  return YES;
}

- (BOOL)isAcceptableFrontalFaceObservation:(VNFaceObservation *)face
                                imageWidth:(size_t)imageWidth
                               imageHeight:(size_t)imageHeight
                            captureQuality:(NSNumber *)captureQuality
{
  if (![self passesBaseFaceBoxChecks:face imageWidth:imageWidth imageHeight:imageHeight]) {
    return NO;
  }

  CGRect box = face.boundingBox;
  CGFloat aspect = box.size.width / MAX(box.size.height, 1e-5f);
  if (aspect < 0.55f || aspect > 1.8f) {
    return NO;
  }

  VNFaceLandmarks2D *landmarks = face.landmarks;
  if (landmarks == nil) {
    return NO;
  }

  BOOL hasLeftEye = landmarks.leftEye != nil && landmarks.leftEye.pointCount >= 4;
  BOOL hasRightEye = landmarks.rightEye != nil && landmarks.rightEye.pointCount >= 4;
  if (!hasLeftEye || !hasRightEye) {
    return NO;
  }

  if (![self hasRequiredFaceLandmarks:landmarks]) {
    return NO;
  }

  if (![self hasPlausibleLandmarkLayout:landmarks]) {
    return NO;
  }

  NSNumber *effectiveQuality = captureQuality ?: face.faceCaptureQuality;
  if (effectiveQuality != nil && effectiveQuality.floatValue < 0.15f) {
    return NO;
  }

  if (effectiveQuality == nil && face.confidence < 0.82f) {
    return NO;
  }

  return YES;
}

- (BOOL)isAcceptableProfileFaceObservation:(VNFaceObservation *)face
                               imageWidth:(size_t)imageWidth
                              imageHeight:(size_t)imageHeight
                           captureQuality:(NSNumber *)captureQuality
{
  if (![self passesBaseFaceBoxChecks:face imageWidth:imageWidth imageHeight:imageHeight]) {
    return NO;
  }

  CGRect box = face.boundingBox;
  CGFloat aspect = box.size.width / MAX(box.size.height, 1e-5f);
  if (aspect < 0.35f || aspect > 1.8f) {
    return NO;
  }

  VNFaceLandmarks2D *landmarks = face.landmarks;
  if (![self hasPlausibleProfileLandmarkLayout:landmarks]) {
    return NO;
  }

  NSNumber *effectiveQuality = captureQuality ?: face.faceCaptureQuality;
  if (effectiveQuality != nil && effectiveQuality.floatValue < 0.12f) {
    return NO;
  }

  if (effectiveQuality == nil && face.confidence < 0.78f) {
    return NO;
  }

  return YES;
}

- (BOOL)isAcceptableFaceObservation:(VNFaceObservation *)face
                       imageWidth:(size_t)imageWidth
                      imageHeight:(size_t)imageHeight
                   captureQuality:(NSNumber *)captureQuality
{
  if ([self isAcceptableFrontalFaceObservation:face
                                    imageWidth:imageWidth
                                   imageHeight:imageHeight
                                captureQuality:captureQuality]) {
    return YES;
  }

  return [self isAcceptableProfileFaceObservation:face
                                       imageWidth:imageWidth
                                      imageHeight:imageHeight
                                   captureQuality:captureQuality];
}

- (CGImageRef)orientedCGImageFromPath:(NSString *)path CF_RETURNS_RETAINED
{
  NSURL *url = [NSURL fileURLWithPath:path isDirectory:NO];
  CGImageSourceRef imageSource = CGImageSourceCreateWithURL((__bridge CFURLRef)url, NULL);
  if (imageSource == NULL) {
    return NULL;
  }

  NSDictionary *options = @{
    (NSString *)kCGImageSourceCreateThumbnailFromImageAlways : @YES,
    (NSString *)kCGImageSourceCreateThumbnailWithTransform : @YES,
    (NSString *)kCGImageSourceShouldCacheImmediately : @YES,
  };
  CGImageRef image = CGImageSourceCreateThumbnailAtIndex(imageSource, 0,
                                                         (__bridge CFDictionaryRef)options);
  CFRelease(imageSource);
  return image;
}

- (NSArray *)buildFaceResultsFromRectObservations:(NSArray<VNFaceObservation *> *)rectFaces
                                          handler:(VNImageRequestHandler *)handler
                                       imageWidth:(size_t)imageWidth
                                      imageHeight:(size_t)imageHeight
                                          cgImage:(CGImageRef)cgImage
{
  if (rectFaces.count == 0) {
    return @[];
  }

  NSError *error = nil;
  VNDetectFaceLandmarksRequest *landmarksRequest =
      [[VNDetectFaceLandmarksRequest alloc] init];
  landmarksRequest.revision = VNDetectFaceLandmarksRequestRevision3;
  landmarksRequest.inputFaceObservations = rectFaces;

  NSArray<VNFaceObservation *> *analysisFaces = rectFaces;
  if ([handler performRequests:@[ landmarksRequest ] error:&error] && landmarksRequest.results.count > 0) {
    analysisFaces = landmarksRequest.results;
  }

  NSMutableDictionary<NSUUID *, NSNumber *> *qualityByFaceId = [NSMutableDictionary dictionary];
  VNDetectFaceCaptureQualityRequest *qualityRequest =
      [[VNDetectFaceCaptureQualityRequest alloc] init];
  qualityRequest.inputFaceObservations = analysisFaces;
  NSArray<VNFaceObservation *> *qualityFaces = nil;
  if ([handler performRequests:@[ qualityRequest ] error:&error]) {
    qualityFaces = qualityRequest.results;
    for (VNFaceObservation *qualityFace in qualityFaces) {
      if (qualityFace.faceCaptureQuality != nil) {
        qualityByFaceId[qualityFace.uuid] = qualityFace.faceCaptureQuality;
      }
    }
  }

  NSMutableArray *faces = [NSMutableArray arrayWithCapacity:analysisFaces.count];
  for (NSInteger index = 0; index < (NSInteger)analysisFaces.count; index++) {
    VNFaceObservation *face = analysisFaces[index];
    NSNumber *captureQuality = qualityByFaceId[face.uuid];
    if (captureQuality == nil && qualityFaces != nil &&
        index < (NSInteger)qualityFaces.count) {
      captureQuality = qualityFaces[index].faceCaptureQuality;
    }
    if (![self isAcceptableFaceObservation:face
                                imageWidth:imageWidth
                               imageHeight:imageHeight
                            captureQuality:captureQuality]) {
      continue;
    }
    [faces addObject:[self faceDictionaryFromObservation:face
                                                   index:index
                                         captureQuality:captureQuality
                                                cgImage:cgImage]];
  }
  return faces;
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

      CGImageRef cgImage = [self orientedCGImageFromPath:path];
      if (cgImage == NULL) {
        dispatch_async(dispatch_get_main_queue(), ^{
          reject(@"EIMAGE", @"Unable to decode image", nil);
        });
        return;
      }

      size_t imageWidth = CGImageGetWidth(cgImage);
      size_t imageHeight = CGImageGetHeight(cgImage);
      NSArray<VNFaceObservation *> *rectFaces = [self collectFaceRectanglesFromCGImage:cgImage];
      if (rectFaces.count == 0) {
        CGImageRelease(cgImage);
        dispatch_async(dispatch_get_main_queue(), ^{
          resolve(@[]);
        });
        return;
      }

      VNImageRequestHandler *handler =
          [[VNImageRequestHandler alloc] initWithCGImage:cgImage options:@{}];
      NSArray *faces = [self buildFaceResultsFromRectObservations:rectFaces
                                                          handler:handler
                                                       imageWidth:imageWidth
                                                      imageHeight:imageHeight
                                                          cgImage:cgImage];
      CGImageRelease(cgImage);

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

      NSDictionary *dimensions = [self orientedImageDimensionsAtPath:path];
      if (dimensions == nil) {
        UIImage *image = [UIImage imageWithContentsOfFile:path];
        if (image == nil) {
          dispatch_async(dispatch_get_main_queue(), ^{
            reject(@"EIMAGE", @"Unable to read image", nil);
          });
          return;
        }

        CGSize size = image.size;
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
