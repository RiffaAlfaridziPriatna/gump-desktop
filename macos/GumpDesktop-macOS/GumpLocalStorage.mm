#import "GumpLocalStorage.h"
#import "GumpSharedFaceDetection.h"

#import <AppKit/AppKit.h>
#import <ImageIO/ImageIO.h>
#import <Vision/Vision.h>

#include "DifferenceHash.h"
#include "ExifDateTime.h"
#include "MediaDerivatives.h"

#include <string>
#include <sys/clonefile.h>

// Same-volume APFS clone is effectively instant. Other volumes / filesystems
// fail with EXDEV (or similar) and we fall back to a real copy.
static BOOL CopyOrCloneRegularFile(NSString *sourcePath, NSString *destPath, NSError **outError) {
  if (sourcePath.length == 0 || destPath.length == 0) {
    if (outError != nil) {
      *outError = [NSError errorWithDomain:NSPOSIXErrorDomain
                                      code:EINVAL
                                  userInfo:nil];
    }
    return NO;
  }

  if (clonefile(sourcePath.fileSystemRepresentation, destPath.fileSystemRepresentation, 0) == 0) {
    return YES;
  }

  return [[NSFileManager defaultManager] copyItemAtPath:sourcePath
                                                 toPath:destPath
                                                  error:outError];
}

@implementation GumpLocalStorage

RCT_EXPORT_MODULE();

// New thumbs are 1280. Existing 1920 .v4.jpg files stay reusable so
// opening a current album does not regenerate thousands of JPEGs.
static const NSUInteger THUMBNAIL_GENERATE_MAX_PIXEL_SIZE = 1280;
static const NSUInteger THUMBNAIL_REUSABLE_MAX_PIXEL_SIZE =
    MediaDerivatives::kThumbnailMaxPixelSize;
static const CGFloat THUMBNAIL_JPEG_QUALITY = MediaDerivatives::kThumbnailJpegQuality;
static const NSUInteger DETAIL_MAX_PIXEL_SIZE = MediaDerivatives::kDetailMaxPixelSize;
static const CGFloat DETAIL_JPEG_QUALITY = MediaDerivatives::kDetailJpegQuality;
// Keep in lockstep with FaceDetection::kAnalysisMaxPixelSize and Windows.
static const NSUInteger kGumpAnalysisMaxPixelSize =
    (NSUInteger)FaceDetection::kAnalysisMaxPixelSize;
static const NSUInteger kGumpScrfdAnalysisMaxPixelSize =
    (NSUInteger)FaceDetection::kAnalysisMaxPixelSize;
static const NSUInteger kFaceCropOutputPixelSize = MediaDerivatives::kFaceCropOutputPixelSize;

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

  NSMutableArray<NSValue *> *sorted = [NSMutableArray arrayWithCapacity:region.pointCount];
  for (NSUInteger i = 0; i < region.pointCount; i++) {
    [sorted addObject:[NSValue valueWithPoint:points[i]]];
  }
  [sorted sortUsingComparator:^NSComparisonResult(NSValue *left, NSValue *right) {
    CGFloat leftX = left.pointValue.x;
    CGFloat rightX = right.pointValue.x;
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
    CGFloat regionMinY = sorted[start].pointValue.y;
    CGFloat regionMaxY = regionMinY;
    for (NSUInteger i = start + 1; i < end; i++) {
      CGFloat y = sorted[i].pointValue.y;
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

- (CGFloat)sharpnessFromPixelBytes:(const uint8_t *)bytes
                       bytesPerRow:(size_t)bytesPerRow
                         imageWidth:(size_t)imageWidth
                        imageHeight:(size_t)imageHeight
                               left:(NSInteger)left
                                top:(NSInteger)top
                              right:(NSInteger)right
                         bottomPixel:(NSInteger)bottomPixel
{
  left = MAX(0, MIN((NSInteger)imageWidth - 1, left));
  top = MAX(0, MIN((NSInteger)imageHeight - 1, top));
  right = MAX(left + 2, MIN((NSInteger)imageWidth, right));
  bottomPixel = MAX(top + 2, MIN((NSInteger)imageHeight, bottomPixel));

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
    return 30.0f;
  }

  double mean = sum / (double)count;
  double variance = (sumSquared / (double)count) - mean * mean;
  CGFloat normalized = (CGFloat)(log(variance + 1.0) / log(1000.0) * 100.0);
  return fminf(100.0f, fmaxf(0.0f, normalized));
}

- (BOOL)pixelRectForLandmarkRegion:(VNFaceLandmarkRegion2D *)region
                            faceBox:(CGRect)box
                         imageWidth:(size_t)imageWidth
                        imageHeight:(size_t)imageHeight
                               left:(NSInteger *)outLeft
                                top:(NSInteger *)outTop
                              right:(NSInteger *)outRight
                         bottomPixel:(NSInteger *)outBottom
{
  if (region == nil || region.pointCount == 0) {
    return NO;
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

  const CGFloat padX = MAX(0.02f, (maxX - minX) * 0.15f);
  const CGFloat padY = MAX(0.02f, (maxY - minY) * 0.15f);
  minX = MAX(0.0f, minX - padX);
  maxX = MIN(1.0f, maxX + padX);
  minY = MAX(0.0f, minY - padY);
  maxY = MIN(1.0f, maxY + padY);

  const CGFloat visionLeft = box.origin.x + minX * box.size.width;
  const CGFloat visionRight = box.origin.x + maxX * box.size.width;
  const CGFloat visionBottom = box.origin.y + minY * box.size.height;
  const CGFloat visionTop = box.origin.y + maxY * box.size.height;

  const NSInteger left = (NSInteger)lround(visionLeft * (CGFloat)imageWidth);
  const NSInteger right = (NSInteger)lround(visionRight * (CGFloat)imageWidth);
  const NSInteger bottom = (NSInteger)lround(visionBottom * (CGFloat)imageHeight);
  const NSInteger topVision = (NSInteger)lround(visionTop * (CGFloat)imageHeight);
  const NSInteger top = (NSInteger)imageHeight - topVision;
  const NSInteger bottomPixel = (NSInteger)imageHeight - bottom;

  if (right - left < 3 || bottomPixel - top < 3) {
    return NO;
  }

  *outLeft = left;
  *outTop = top;
  *outRight = right;
  *outBottom = bottomPixel;
  return YES;
}

- (CGFloat)sharpnessFromCGImage:(CGImageRef)cgImage faceBox:(CGRect)box
{
  size_t imageWidth = CGImageGetWidth(cgImage);
  size_t imageHeight = CGImageGetHeight(cgImage);
  if (imageWidth < 3 || imageHeight < 3) {
    return 30.0f;
  }

  NSInteger left = (NSInteger)lround(box.origin.x * (CGFloat)imageWidth);
  NSInteger bottom = (NSInteger)lround(box.origin.y * (CGFloat)imageHeight);
  NSInteger faceWidth = (NSInteger)lround(box.size.width * (CGFloat)imageWidth);
  NSInteger faceHeight = (NSInteger)lround(box.size.height * (CGFloat)imageHeight);
  NSInteger top = (NSInteger)imageHeight - bottom - faceHeight;
  NSInteger right = left + faceWidth;
  NSInteger bottomPixel = top + faceHeight;

  CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
  size_t bytesPerRow = imageWidth * 4;
  NSMutableData *pixelData = [NSMutableData dataWithLength:bytesPerRow * imageHeight];
  CGContextRef context = CGBitmapContextCreate(
      pixelData.mutableBytes, imageWidth, imageHeight, 8, bytesPerRow, colorSpace,
      kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big);
  CGColorSpaceRelease(colorSpace);
  if (context == NULL) {
    return 30.0f;
  }

  CGContextDrawImage(context, CGRectMake(0, 0, imageWidth, imageHeight), cgImage);
  CGContextRelease(context);

  return [self sharpnessFromPixelBytes:(const uint8_t *)pixelData.bytes
                           bytesPerRow:bytesPerRow
                             imageWidth:imageWidth
                            imageHeight:imageHeight
                                   left:left
                                    top:top
                                  right:right
                             bottomPixel:bottomPixel];
}

- (CGFloat)sharpnessFromLandmarkRegion:(VNFaceLandmarkRegion2D *)region
                               faceBox:(CGRect)box
                                 bytes:(const uint8_t *)bytes
                           bytesPerRow:(size_t)bytesPerRow
                            imageWidth:(size_t)imageWidth
                           imageHeight:(size_t)imageHeight
{
  NSInteger left = 0;
  NSInteger top = 0;
  NSInteger right = 0;
  NSInteger bottomPixel = 0;
  if (![self pixelRectForLandmarkRegion:region
                                faceBox:box
                             imageWidth:imageWidth
                            imageHeight:imageHeight
                                   left:&left
                                    top:&top
                                  right:&right
                             bottomPixel:&bottomPixel]) {
    return -1.0f;
  }

  return [self sharpnessFromPixelBytes:bytes
                           bytesPerRow:bytesPerRow
                             imageWidth:imageWidth
                            imageHeight:imageHeight
                                   left:left
                                    top:top
                                  right:right
                             bottomPixel:bottomPixel];
}

- (CGFloat)combineEyeSharpness:(CGFloat)leftEye
                      rightEye:(CGFloat)rightEye
                     reference:(CGFloat)reference
{
  CGFloat eyeSharp = -1.0f;
  if (leftEye >= 0.0f && rightEye >= 0.0f) {
    eyeSharp = MIN(leftEye, rightEye);
  } else if (leftEye >= 0.0f) {
    eyeSharp = leftEye;
  } else if (rightEye >= 0.0f) {
    eyeSharp = rightEye;
  }

  if (eyeSharp < 0.0f) {
    return -1.0f;
  }

  if (reference >= 0.0f) {
    const CGFloat ratio = eyeSharp / MAX(reference, 1.0f);
    static const CGFloat kMinEyeToReferenceRatio = 1.15f;
    if (ratio < kMinEyeToReferenceRatio) {
      eyeSharp *= ratio / kMinEyeToReferenceRatio;
    }
  }

  return eyeSharp;
}

- (CGFloat)sharpnessFromObservation:(VNFaceObservation *)face cgImage:(CGImageRef)cgImage
{
  if (cgImage == NULL) {
    return 30.0f;
  }

  const size_t imageWidth = CGImageGetWidth(cgImage);
  const size_t imageHeight = CGImageGetHeight(cgImage);
  if (imageWidth < 3 || imageHeight < 3) {
    return 30.0f;
  }

  CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
  const size_t bytesPerRow = imageWidth * 4;
  NSMutableData *pixelData = [NSMutableData dataWithLength:bytesPerRow * imageHeight];
  CGContextRef context = CGBitmapContextCreate(
      pixelData.mutableBytes, imageWidth, imageHeight, 8, bytesPerRow, colorSpace,
      kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big);
  CGColorSpaceRelease(colorSpace);
  if (context == NULL) {
    return 30.0f;
  }

  CGContextDrawImage(context, CGRectMake(0, 0, imageWidth, imageHeight), cgImage);
  CGContextRelease(context);

  const uint8_t *bytes = (const uint8_t *)pixelData.bytes;
  const CGRect box = face.boundingBox;
  VNFaceLandmarks2D *landmarks = face.landmarks;
  if (landmarks != nil) {
    const CGFloat leftEye =
        [self sharpnessFromLandmarkRegion:landmarks.leftEye
                                  faceBox:box
                                    bytes:bytes
                              bytesPerRow:bytesPerRow
                               imageWidth:imageWidth
                              imageHeight:imageHeight];
    const CGFloat rightEye =
        [self sharpnessFromLandmarkRegion:landmarks.rightEye
                                  faceBox:box
                                    bytes:bytes
                              bytesPerRow:bytesPerRow
                               imageWidth:imageWidth
                              imageHeight:imageHeight];
    const CGFloat nose =
        [self sharpnessFromLandmarkRegion:landmarks.nose
                                  faceBox:box
                                    bytes:bytes
                              bytesPerRow:bytesPerRow
                               imageWidth:imageWidth
                              imageHeight:imageHeight];
    const CGFloat eyeSharp = [self combineEyeSharpness:leftEye rightEye:rightEye reference:nose];
    if (eyeSharp >= 0.0f) {
      return eyeSharp;
    }
  }

  const CGFloat inset = 0.15f;
  const CGRect insetBox = CGRectMake(
      box.origin.x + box.size.width * inset,
      box.origin.y + box.size.height * inset,
      box.size.width * (1.0f - inset * 2.0f),
      box.size.height * (1.0f - inset * 2.0f));
  return [self sharpnessFromCGImage:cgImage faceBox:insetBox];
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

- (BOOL)hasPlausibleFaceContourSpan:(VNFaceLandmarkRegion2D *)contour
{
  if (contour == nil || contour.pointCount < 8) {
    return NO;
  }

  const CGPoint *points = contour.normalizedPoints;
  CGFloat minX = points[0].x;
  CGFloat maxX = points[0].x;
  CGFloat minY = points[0].y;
  CGFloat maxY = points[0].y;
  for (NSUInteger i = 1; i < contour.pointCount; i++) {
    minX = MIN(minX, points[i].x);
    maxX = MAX(maxX, points[i].x);
    minY = MIN(minY, points[i].y);
    maxY = MAX(maxY, points[i].y);
  }

  CGFloat width = maxX - minX;
  CGFloat height = maxY - minY;
  if (width < 0.35f || height < 0.45f) {
    return NO;
  }

  CGFloat aspect = width / MAX(height, 1e-5f);
  if (aspect < 0.40f || aspect > 1.50f) {
    return NO;
  }

  return YES;
}

- (BOOL)hasPlausibleLandmarkLayout:(VNFaceLandmarks2D *)landmarks
{
  CGPoint leftEyeRaw = [self centroidOfLandmarkRegion:landmarks.leftEye];
  CGPoint rightEyeRaw = [self centroidOfLandmarkRegion:landmarks.rightEye];
  CGPoint nose = [self centroidOfLandmarkRegion:landmarks.nose];
  VNFaceLandmarkRegion2D *mouthRegion = landmarks.outerLips ?: landmarks.innerLips;
  CGPoint mouth = [self centroidOfLandmarkRegion:mouthRegion];
  BOOL hasMouth = mouth.x >= 0;

  if (leftEyeRaw.x < 0 || rightEyeRaw.x < 0 || nose.x < 0) {
    return NO;
  }

  if (landmarks.faceContour == nil || landmarks.faceContour.pointCount < 8) {
    return NO;
  }

  if (landmarks.leftEyebrow == nil || landmarks.leftEyebrow.pointCount < 2 ||
      landmarks.rightEyebrow == nil || landmarks.rightEyebrow.pointCount < 2) {
    return NO;
  }

  BOOL eyesSwapped = leftEyeRaw.x > rightEyeRaw.x;
  CGPoint leftEye = eyesSwapped ? rightEyeRaw : leftEyeRaw;
  CGPoint rightEye = eyesSwapped ? leftEyeRaw : rightEyeRaw;
  VNFaceLandmarkRegion2D *leftEyeRegion =
      eyesSwapped ? landmarks.rightEye : landmarks.leftEye;
  VNFaceLandmarkRegion2D *rightEyeRegion =
      eyesSwapped ? landmarks.leftEye : landmarks.rightEye;

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
  BOOL invertedVertical = NO;
  if (hasMouth) {
    BOOL normalOrder = eyesY + 0.02f >= nose.y && nose.y + 0.02f >= mouth.y;
    BOOL invertedOrder = eyesY <= nose.y + 0.02f && nose.y <= mouth.y + 0.02f;
    if (normalOrder) {
      invertedVertical = NO;
    } else if (invertedOrder) {
      invertedVertical = YES;
    } else {
      return NO;
    }
  } else if (eyesY + 0.10f < nose.y) {
    invertedVertical = YES;
  }

  if (!invertedVertical) {
    if (eyesY < 0.36f) {
      return NO;
    }
    if (hasMouth && mouth.y > 0.68f) {
      return NO;
    }
  } else {
    if (eyesY > 0.64f) {
      return NO;
    }
    if (hasMouth && mouth.y < 0.32f) {
      return NO;
    }
  }

  CGFloat eyeToNose = fabs(eyesY - nose.y);
  if (eyeToNose < 0.08f || eyeToNose > 0.50f) {
    return NO;
  }
  if (hasMouth) {
    CGFloat noseToMouth = fabs(nose.y - mouth.y);
    if (noseToMouth < 0.05f || noseToMouth > 0.40f) {
      return NO;
    }
  }

  CGFloat leftEyeWidth = [self landmarkHorizontalSpan:leftEyeRegion];
  CGFloat rightEyeWidth = [self landmarkHorizontalSpan:rightEyeRegion];
  if (leftEyeWidth < 0.06f || leftEyeWidth > 0.40f ||
      rightEyeWidth < 0.06f || rightEyeWidth > 0.40f) {
    return NO;
  }
  if (hasMouth) {
    CGFloat mouthWidth = [self landmarkHorizontalSpan:mouthRegion];
    if (mouthWidth < eyeDistance * 0.55f) {
      return NO;
    }
  }

  CGFloat eyeWidthAvg = (leftEyeWidth + rightEyeWidth) * 0.5f;
  if (eyeWidthAvg > 1e-5f &&
      fabs(leftEyeWidth - rightEyeWidth) / eyeWidthAvg > 0.55f) {
    return NO;
  }

  CGFloat leftEAR = [self eyeAspectRatioFromRegion:leftEyeRegion];
  CGFloat rightEAR = [self eyeAspectRatioFromRegion:rightEyeRegion];
  if (leftEAR >= 0.0f && rightEAR >= 0.0f) {
    CGFloat earAvg = (leftEAR + rightEAR) * 0.5f;
    if (earAvg > 1e-5f && fabs(leftEAR - rightEAR) / earAvg > 0.75f) {
      return NO;
    }
  }

  if (hasMouth) {
    CGFloat eyeToMouth = fabs(eyesY - mouth.y);
    if (eyeToMouth < eyeDistance * 0.55f || eyeToMouth > eyeDistance * 2.20f) {
      return NO;
    }
  }

  if (![self hasPlausibleFaceContourSpan:landmarks.faceContour]) {
    return NO;
  }

  return YES;
}

- (CGFloat)pupilRelativeYInEye:(VNFaceLandmarkRegion2D *)eye
                         pupil:(VNFaceLandmarkRegion2D *)pupil
{
  if (eye == nil || eye.pointCount < 4 || pupil == nil || pupil.pointCount == 0) {
    return -1.0f;
  }

  const CGPoint *points = eye.normalizedPoints;
  CGFloat minY = points[0].y;
  CGFloat maxY = points[0].y;
  for (NSUInteger i = 1; i < eye.pointCount; i++) {
    minY = MIN(minY, points[i].y);
    maxY = MAX(maxY, points[i].y);
  }
  CGFloat height = maxY - minY;
  if (height < 1e-5f) {
    return -1.0f;
  }

  CGPoint pupilPoint = pupil.normalizedPoints[0];
  return (pupilPoint.y - minY) / height;
}

- (NSDictionary *)eyesOpenFromLandmarks:(VNFaceLandmarks2D *)landmarks
                                  pitch:(NSNumber *)pitch
                               faceArea:(CGFloat)faceArea
{
  static const CGFloat kOpenAvgThreshold = 0.18f;
  static const CGFloat kOpenMinThreshold = 0.14f;
  static const CGFloat kClosedMaxThreshold = 0.14f;
  static const CGFloat kClosedAvgThreshold = 0.12f;
  static const CGFloat kStrongOpenAvgThreshold = 0.24f;
  static const CGFloat kDownGazeClosedThreshold = 0.35f;
  static const CGFloat kDownGazePartialThreshold = 0.48f;
  static const CGFloat kMinFaceAreaForPupilGaze = 0.008f;

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

  if (faceArea >= kMinFaceAreaForPupilGaze) {
    CGFloat leftPupilY =
        [self pupilRelativeYInEye:landmarks.leftEye pupil:landmarks.leftPupil];
    CGFloat rightPupilY =
        [self pupilRelativeYInEye:landmarks.rightEye pupil:landmarks.rightPupil];
    CGFloat pupilRelY = -1.0f;
    if (leftPupilY >= 0.0f && rightPupilY >= 0.0f) {
      pupilRelY = (leftPupilY + rightPupilY) / 2.0f;
    } else if (leftPupilY >= 0.0f) {
      pupilRelY = leftPupilY;
    } else if (rightPupilY >= 0.0f) {
      pupilRelY = rightPupilY;
    }

    // Pupil low in the eye socket => looking down / lids covering iris.
    // Only demote open/ambiguous EAR results — never promote a clear blink to open.
    BOOL earLooksOpen =
        avgRatio >= kOpenAvgThreshold && minRatio >= kOpenMinThreshold;
    BOOL earLooksClosed =
        maxRatio <= kClosedMaxThreshold || avgRatio <= kClosedAvgThreshold;
    if (pupilRelY >= 0.0f && pupilRelY < kDownGazeClosedThreshold &&
        !earLooksClosed) {
      return @{@"value" : @NO, @"confidence" : @(90.0f)};
    }
    if (pupilRelY >= 0.0f && pupilRelY < kDownGazePartialThreshold &&
        earLooksOpen) {
      return @{@"value" : @YES, @"confidence" : @(72.0f)};
    }
  }

  BOOL lookingDown = NO;
  if (pitch != nil) {
    CGFloat pitchValue = pitch.floatValue;
    if (fabs(pitchValue) > (CGFloat)M_PI + 0.01f) {
      pitchValue = (pitchValue * (CGFloat)M_PI) / 180.0f;
    }
    lookingDown = pitchValue < -0.12f;
  }
  if (!lookingDown && landmarks.leftEye != nil && landmarks.rightEye != nil) {
    CGPoint leftEye = [self centroidOfLandmarkRegion:landmarks.leftEye];
    CGPoint rightEye = [self centroidOfLandmarkRegion:landmarks.rightEye];
    CGFloat eyesY = (leftEye.y + rightEye.y) * 0.5f;
    lookingDown = eyesY < 0.52f && eyesY >= 0.36f;
  }

  if (lookingDown && avgRatio < kStrongOpenAvgThreshold) {
    return @{@"value" : @YES, @"confidence" : @(72.0f)};
  }

  if (avgRatio >= kOpenAvgThreshold && minRatio >= kOpenMinThreshold) {
    CGFloat confidence = MIN(98.0f, 86.0f + (avgRatio - kOpenAvgThreshold) * 250.0f);
    if (lookingDown) {
      confidence = MIN(confidence, 78.0f);
    }
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

  CGFloat sharpness = 30.0f;
  if (cgImage != NULL) {
    sharpness = [self sharpnessFromObservation:face cgImage:cgImage];
  }
  (void)captureQuality;

  NSDictionary *eyesOpen = [self eyesOpenFromLandmarks:face.landmarks
                                                 pitch:face.pitch
                                              faceArea:(width * height)];

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

static const CGFloat kGumpFaceBoxIoUThreshold = 0.42f;
static const CGFloat kGumpFaceBoxIoSThreshold = 0.50f;
static const CGFloat kGumpFaceBoxProximityIoUThreshold = 0.18f;
static const CGFloat kGumpFaceBoxProximityCenterFactor = 0.48f;
static const CGFloat kGumpFaceBoxProximityMinAreaRatio = 1.8f;
static const CGFloat kGumpTileOverlapFraction = 0.25f;
static const NSUInteger kGumpMinFacesToSkipTiling = 10;
static const NSUInteger kGumpDenseGroupAlwaysTileBelowCount = 36;
static const CGFloat kGumpDenseGroupMaxFaceArea = 0.0025f;
static const NSUInteger kGumpMinPixelsForTiling = 2000000;
static const NSUInteger kGumpTileDetectMaxConcurrency = 3;
static const CGFloat kGumpMinKeepFaceArea = 0.0004f;
static const CGFloat kGumpMinSoftFaceArea = 0.012f;
static const CGFloat kGumpRelativeTinyFaceArea = 0.00075f;
static const CGFloat kGumpRelativeTinyFaceMaxRatio = 0.50f;
static const CGFloat kGumpRelativeTinyDeferMediaRatio = 8.0f;
static const CGFloat kGumpDisplayedMediaMinArea = 0.0035f;
static const CGFloat kGumpDisplayedMediaMaxArea = 0.16f;
static const CGFloat kGumpDisplayedMediaMinPersonArea = 0.0004f;
static const NSUInteger kGumpDisplayedMediaSideSimilarMaxFaces = 6;
static const CGFloat kGumpFocusGoodThreshold = 62.0f;
static const CGFloat kGumpFocusSoftThreshold = 40.0f;
static const CGFloat kGumpEyeConfidenceThreshold = 85.0f;

- (CGFloat)intersectionAreaForBoxA:(CGRect)a boxB:(CGRect)b
{
  CGFloat intersectLeft = MAX(a.origin.x, b.origin.x);
  CGFloat intersectBottom = MAX(a.origin.y, b.origin.y);
  CGFloat intersectRight = MIN(CGRectGetMaxX(a), CGRectGetMaxX(b));
  CGFloat intersectTop = MIN(CGRectGetMaxY(a), CGRectGetMaxY(b));
  CGFloat intersectWidth = MAX(0.0f, intersectRight - intersectLeft);
  CGFloat intersectHeight = MAX(0.0f, intersectTop - intersectBottom);
  return intersectWidth * intersectHeight;
}

- (CGFloat)intersectionOverUnionForBoxA:(CGRect)a boxB:(CGRect)b
{
  CGFloat intersection = [self intersectionAreaForBoxA:a boxB:b];
  if (intersection <= 0.0f) {
    return 0.0f;
  }

  CGFloat unionArea = a.size.width * a.size.height + b.size.width * b.size.height - intersection;
  if (unionArea <= 0.0f) {
    return 0.0f;
  }
  return intersection / unionArea;
}

- (BOOL)faceBox:(CGRect)a isRedundantWithBox:(CGRect)b
{
  CGFloat iou = [self intersectionOverUnionForBoxA:a boxB:b];
  if (iou >= kGumpFaceBoxIoUThreshold) {
    return YES;
  }

  CGFloat intersection = [self intersectionAreaForBoxA:a boxB:b];
  CGFloat minArea = MIN(a.size.width * a.size.height, b.size.width * b.size.height);
  CGFloat maxArea = MAX(a.size.width * a.size.height, b.size.width * b.size.height);
  CGFloat areaRatio = maxArea / MAX(minArea, 1e-8f);
  if (minArea > 1e-8f &&
      areaRatio >= kGumpFaceBoxProximityMinAreaRatio &&
      (intersection / minArea) >= kGumpFaceBoxIoSThreshold) {
    return YES;
  }

  if (areaRatio < kGumpFaceBoxProximityMinAreaRatio) {
    return NO;
  }

  CGFloat aCenterX = a.origin.x + a.size.width * 0.5f;
  CGFloat aCenterY = a.origin.y + a.size.height * 0.5f;
  CGFloat bCenterX = b.origin.x + b.size.width * 0.5f;
  CGFloat bCenterY = b.origin.y + b.size.height * 0.5f;
  CGFloat centerDistance = hypot(aCenterX - bCenterX, aCenterY - bCenterY);
  CGFloat minDiagonal = MIN(hypot(a.size.width, a.size.height), hypot(b.size.width, b.size.height));
  if (iou >= kGumpFaceBoxProximityIoUThreshold &&
      centerDistance < kGumpFaceBoxProximityCenterFactor * minDiagonal) {
    return YES;
  }

  return NO;
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
        CGFloat leftArea = left.boundingBox.size.width * left.boundingBox.size.height;
        CGFloat rightArea = right.boundingBox.size.width * right.boundingBox.size.height;
        if (leftArea > rightArea) {
          return NSOrderedAscending;
        }
        if (leftArea < rightArea) {
          return NSOrderedDescending;
        }
        return NSOrderedSame;
      }];

  NSMutableArray<VNFaceObservation *> *kept = [NSMutableArray array];
  for (VNFaceObservation *candidate in sorted) {
    BOOL overlapsExisting = NO;
    for (VNFaceObservation *existing in kept) {
      if ([self faceBox:candidate.boundingBox isRedundantWithBox:existing.boundingBox]) {
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
  NSObject *mergedLock = [[NSObject alloc] init];
  dispatch_group_t group = dispatch_group_create();
  dispatch_queue_t queue =
      dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0);
  dispatch_semaphore_t concurrency =
      dispatch_semaphore_create((long)kGumpTileDetectMaxConcurrency);

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
      dispatch_group_async(group, queue, ^{
        dispatch_semaphore_wait(concurrency, DISPATCH_TIME_FOREVER);
        CGImageRef tileImage = CGImageCreateWithImageInRect(cgImage, tileCrop);
        if (tileImage == NULL) {
          dispatch_semaphore_signal(concurrency);
          return;
        }

        NSArray<VNFaceObservation *> *tileFaces =
            [self detectRectanglesInCGImage:tileImage revision:revision];
        CGImageRelease(tileImage);

        NSMutableArray<VNFaceObservation *> *mappedFaces = [NSMutableArray array];
        for (VNFaceObservation *tileFace in tileFaces) {
          CGRect mappedBox = [self mapTileBoundingBox:tileFace.boundingBox
                                         tileCropRect:tileCrop
                                           imageWidth:imageWidth
                                          imageHeight:imageHeight];
          VNFaceObservation *mappedFace = [self faceObservationWithBoundingBox:mappedBox];
          if (mappedFace != nil) {
            [mappedFaces addObject:mappedFace];
          }
        }

        @synchronized(mergedLock) {
          [merged addObjectsFromArray:mappedFaces];
        }
        dispatch_semaphore_signal(concurrency);
      });
    }
  }

  dispatch_group_wait(group, DISPATCH_TIME_FOREVER);
  return [self deduplicateFaceObservations:merged];
}

- (CGFloat)maxFaceAreaInObservations:(NSArray<VNFaceObservation *> *)observations
{
  CGFloat maxArea = 0.0f;
  for (VNFaceObservation *face in observations) {
    CGFloat area = face.boundingBox.size.width * face.boundingBox.size.height;
    if (area > maxArea) {
      maxArea = area;
    }
  }
  return maxArea;
}

- (BOOL)shouldSkipFurtherTilingForFaces:(NSArray<VNFaceObservation *> *)faces
{
  if (faces.count == 0) {
    return NO;
  }
  if (faces.count >= kGumpDenseGroupAlwaysTileBelowCount) {
    return YES;
  }
  CGFloat maxArea = [self maxFaceAreaInObservations:faces];
  if (maxArea > 0.0f && maxArea < kGumpDenseGroupMaxFaceArea) {
    return NO;
  }
  return faces.count >= kGumpMinFacesToSkipTiling;
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
  if (pixelCount < kGumpMinPixelsForTiling ||
      [self shouldSkipFurtherTilingForFaces:bestFullFrame]) {
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
  if ([self shouldSkipFurtherTilingForFaces:deduped]) {
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
  if (facePixelWidth < 24.0f || facePixelHeight < 24.0f) {
    return NO;
  }

  CGFloat faceAreaFraction =
      (box.size.width * box.size.height * (CGFloat)imageWidth * (CGFloat)imageHeight) /
      ((CGFloat)imageWidth * (CGFloat)imageHeight);
  if (faceAreaFraction < 0.00035f) {
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

  BOOL hasLeftEye = landmarks.leftEye != nil && landmarks.leftEye.pointCount >= 4;
  BOOL hasRightEye = landmarks.rightEye != nil && landmarks.rightEye.pointCount >= 4;
  if (!hasLeftEye && !hasRightEye) {
    return NO;
  }

  BOOL hasMouth = (landmarks.outerLips != nil && landmarks.outerLips.pointCount >= 3) ||
                  (landmarks.innerLips != nil && landmarks.innerLips.pointCount >= 3);
  if (hasMouth) {
    return YES;
  }
  return hasLeftEye && hasRightEye;
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

  if (eyesY + 0.10f < nose.y || nose.y + 0.10f < mouth.y) {
    BOOL inverted = eyesY <= nose.y + 0.02f && nose.y <= mouth.y + 0.02f;
    if (!inverted) {
      return NO;
    }
  }

  CGFloat eyeToMouth = fabs(eyesY - mouth.y);
  if (eyeToMouth < 0.12f || eyeToMouth > 0.70f) {
    return NO;
  }

  if (landmarks.faceContour != nil && landmarks.faceContour.pointCount >= 8 &&
      ![self hasPlausibleFaceContourSpan:landmarks.faceContour]) {
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
  if (effectiveQuality != nil && effectiveQuality.floatValue < 0.12f) {
    return NO;
  }

  if (effectiveQuality == nil && face.confidence < 0.80f) {
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
  if (effectiveQuality != nil && effectiveQuality.floatValue < 0.10f) {
    return NO;
  }

  if (effectiveQuality == nil && face.confidence < 0.76f) {
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

- (CGImageRef)orientedCGImageFromPath:(NSString *)path
                         maxPixelSize:(NSUInteger)maxPixelSize CF_RETURNS_RETAINED
{
  NSURL *url = [NSURL fileURLWithPath:path isDirectory:NO];
  CGImageSourceRef imageSource = CGImageSourceCreateWithURL((__bridge CFURLRef)url, NULL);
  if (imageSource == NULL) {
    return NULL;
  }

  NSMutableDictionary *options = [NSMutableDictionary dictionaryWithDictionary:@{
    (NSString *)kCGImageSourceCreateThumbnailFromImageAlways : @YES,
    (NSString *)kCGImageSourceCreateThumbnailWithTransform : @YES,
    (NSString *)kCGImageSourceShouldCacheImmediately : @YES,
  }];
  if (maxPixelSize > 0) {
    options[(NSString *)kCGImageSourceThumbnailMaxPixelSize] = @(maxPixelSize);
  }
  CGImageRef image = CGImageSourceCreateThumbnailAtIndex(imageSource, 0,
                                                         (__bridge CFDictionaryRef)options);
  CFRelease(imageSource);
  return image;
}

- (CGImageRef)orientedCGImageFromPath:(NSString *)path CF_RETURNS_RETAINED
{
  return [self orientedCGImageFromPath:path maxPixelSize:0];
}

- (CGFloat)faceDictionaryArea:(NSDictionary *)face
{
  NSDictionary *box = face[@"boundingBox"];
  if (![box isKindOfClass:[NSDictionary class]]) {
    return 0;
  }
  CGFloat width = [box[@"width"] floatValue];
  CGFloat height = [box[@"height"] floatValue];
  return MAX(0.0f, width) * MAX(0.0f, height);
}

- (CGPoint)faceDictionaryCenter:(NSDictionary *)face
{
  NSDictionary *box = face[@"boundingBox"];
  if (![box isKindOfClass:[NSDictionary class]]) {
    return CGPointMake(0.5f, 0.5f);
  }
  CGFloat left = [box[@"left"] floatValue];
  CGFloat top = [box[@"top"] floatValue];
  CGFloat width = [box[@"width"] floatValue];
  CGFloat height = [box[@"height"] floatValue];
  return CGPointMake(left + width * 0.5f, top + height * 0.5f);
}

- (CGFloat)faceDictionaryAbsYawRadians:(NSDictionary *)face
{
  NSDictionary *pose = face[@"pose"];
  CGFloat yaw = [pose[@"yaw"] floatValue];
  CGFloat value = fabs(yaw);
  if (value > (CGFloat)M_PI + 0.01f) {
    return (value * (CGFloat)M_PI) / 180.0f;
  }
  return value;
}

- (NSArray *)reindexFaceDictionaries:(NSArray *)faces
{
  NSMutableArray *reindexed = [NSMutableArray arrayWithCapacity:faces.count];
  for (NSInteger index = 0; index < (NSInteger)faces.count; index++) {
    NSDictionary *face = faces[index];
    if (![face isKindOfClass:[NSDictionary class]]) {
      continue;
    }
    NSMutableDictionary *copy = [face mutableCopy];
    copy[@"faceId"] = [NSString stringWithFormat:@"local-face-%ld", (long)index];
    [reindexed addObject:copy];
  }
  return reindexed;
}

- (CGFloat)upperHalfMeanFaceAreaFromDictionaries:(NSArray *)faces
{
  NSMutableArray<NSNumber *> *areas = [NSMutableArray arrayWithCapacity:faces.count];
  for (NSDictionary *face in faces) {
    if (![face isKindOfClass:[NSDictionary class]]) {
      continue;
    }
    CGFloat area = [self faceDictionaryArea:face];
    if (area > 0.0f) {
      [areas addObject:@(area)];
    }
  }
  if (areas.count == 0) {
    return 0.0f;
  }
  [areas sortUsingSelector:@selector(compare:)];
  NSUInteger start = areas.count / 2;
  CGFloat sum = 0.0f;
  NSUInteger count = 0;
  for (NSUInteger index = start; index < areas.count; index++) {
    sum += areas[index].floatValue;
    count += 1;
  }
  return count > 0 ? sum / (CGFloat)count : 0.0f;
}

- (NSArray *)rejectLikelyNonFaceArtifactDictionaries:(NSArray *)faces
{
  if (faces.count == 0) {
    return faces;
  }

  CGFloat referenceArea = [self upperHalfMeanFaceAreaFromDictionaries:faces];

  NSMutableArray *kept = [NSMutableArray arrayWithCapacity:faces.count];
  for (NSDictionary *face in faces) {
    if (![face isKindOfClass:[NSDictionary class]]) {
      continue;
    }
    CGFloat area = [self faceDictionaryArea:face];
    if (area < kGumpMinKeepFaceArea) {
      continue;
    }
    if (faces.count >= 2 &&
        referenceArea > 0.0f &&
        area < kGumpRelativeTinyFaceArea &&
        area < referenceArea * kGumpRelativeTinyFaceMaxRatio) {
      CGFloat sizeRatio = referenceArea / MAX(area, 1e-8f);
      BOOL deferToMediaFilter = NO;
      if (sizeRatio >= kGumpRelativeTinyDeferMediaRatio) {
        CGPoint center = [self faceDictionaryCenter:face];
        for (NSDictionary *other in faces) {
          if (![other isKindOfClass:[NSDictionary class]]) {
            continue;
          }
          CGFloat otherArea = [self faceDictionaryArea:other];
          if (otherArea < referenceArea * 0.85f) {
            continue;
          }
          CGPoint otherCenter = [self faceDictionaryCenter:other];
          if (otherCenter.y + 0.03f < center.y) {
            deferToMediaFilter = YES;
            break;
          }
        }
      }
      if (!deferToMediaFilter) {
        continue;
      }
    }

    CGFloat sharpness = [face[@"sharpness"] floatValue];
    NSDictionary *eyesOpen = face[@"eyesOpen"];
    BOOL openConfident =
        [eyesOpen[@"value"] boolValue] &&
        [eyesOpen[@"confidence"] floatValue] >= kGumpEyeConfidenceThreshold;

    if (openConfident && sharpness < kGumpFocusSoftThreshold) {
      continue;
    }
    if (faces.count >= 2 &&
        sharpness >= kGumpFocusSoftThreshold &&
        sharpness < kGumpFocusGoodThreshold &&
        area < kGumpMinSoftFaceArea) {
      if (!(referenceArea > 0.0f &&
            area >= referenceArea * kGumpRelativeTinyFaceMaxRatio)) {
        continue;
      }
    }
    [kept addObject:face];
  }
  return kept;
}

- (NSArray *)rejectLikelyDisplayedMediaFaceDictionaries:(NSArray *)faces
{
  if (faces.count < 2) {
    return faces;
  }

  NSUInteger count = faces.count;
  NSMutableArray<NSNumber *> *areas = [NSMutableArray arrayWithCapacity:count];
  NSMutableArray<NSNumber *> *centerXs = [NSMutableArray arrayWithCapacity:count];
  NSMutableArray<NSNumber *> *centerYs = [NSMutableArray arrayWithCapacity:count];
  NSMutableArray<NSNumber *> *yaws = [NSMutableArray arrayWithCapacity:count];
  for (NSDictionary *face in faces) {
    CGPoint center = [self faceDictionaryCenter:face];
    [areas addObject:@([self faceDictionaryArea:face])];
    [centerXs addObject:@(center.x)];
    [centerYs addObject:@(center.y)];
    [yaws addObject:@([self faceDictionaryAbsYawRadians:face])];
  }

  NSMutableIndexSet *reject = [NSMutableIndexSet indexSet];
  for (NSUInteger candidate = 0; candidate < count; candidate++) {
    CGFloat candidateArea = areas[candidate].floatValue;
    CGFloat candidateCenterY = centerYs[candidate].floatValue;
    CGFloat candidateCenterX = centerXs[candidate].floatValue;
    CGFloat candidateYaw = yaws[candidate].floatValue;

    BOOL oversizedAbove = NO;
    if (candidateArea >= kGumpDisplayedMediaMinArea &&
        candidateArea <= kGumpDisplayedMediaMaxArea) {
      for (NSUInteger other = 0; other < count; other++) {
        if (other == candidate) {
          continue;
        }
        CGFloat otherArea = areas[other].floatValue;
        if (otherArea < kGumpDisplayedMediaMinPersonArea || otherArea >= candidateArea) {
          continue;
        }
        if (centerYs[other].floatValue <= candidateCenterY + 0.04f) {
          continue;
        }
        if (candidateArea / MAX(otherArea, 1e-8f) >= 3.0f) {
          oversizedAbove = YES;
          break;
        }
      }
    }
    if (oversizedAbove) {
      [reject addIndex:candidate];
      continue;
    }

    BOOL onSide = candidateCenterX <= 0.38f || candidateCenterX >= 0.62f;
    if (count <= kGumpDisplayedMediaSideSimilarMaxFaces &&
        (candidateCenterX <= 0.32f || candidateCenterX >= 0.68f) &&
        candidateArea >= kGumpDisplayedMediaMinArea &&
        candidateArea <= kGumpDisplayedMediaMaxArea) {
      BOOL sidePanelNearPerson = NO;
      for (NSUInteger other = 0; other < count; other++) {
        if (other == candidate) {
          continue;
        }
        CGFloat otherArea = areas[other].floatValue;
        CGFloat otherCenterX = centerXs[other].floatValue;
        CGFloat otherCenterY = centerYs[other].floatValue;
        if (otherArea < kGumpDisplayedMediaMinArea * 0.5f) {
          continue;
        }
        CGFloat areaRatio = candidateArea / MAX(otherArea, 1e-8f);
        if (areaRatio < 0.40f || areaRatio > 2.50f) {
          continue;
        }
        CGFloat candidateEdge = fabs(candidateCenterX - 0.5f);
        CGFloat otherEdge = fabs(otherCenterX - 0.5f);
        if (candidateEdge < otherEdge + 0.20f) {
          continue;
        }
        if (candidateCenterY > otherCenterY + 0.06f) {
          continue;
        }
        sidePanelNearPerson = YES;
        break;
      }
      if (sidePanelNearPerson) {
        [reject addIndex:candidate];
        continue;
      }
    }

    if (candidateYaw >= 0.4f && onSide) {
      NSDictionary *candidateFace = faces[candidate];
      CGFloat candidateSharpness = [candidateFace[@"sharpness"] floatValue];
      if (candidateSharpness < 48.0f) {
        BOOL hasFrontalPerson = NO;
        for (NSUInteger other = 0; other < count; other++) {
          if (other == candidate) {
            continue;
          }
          if (yaws[other].floatValue <= 0.35f &&
              areas[other].floatValue >= kGumpMinKeepFaceArea) {
            hasFrontalPerson = YES;
            break;
          }
        }
        if (hasFrontalPerson) {
          [reject addIndex:candidate];
          continue;
        }
      }
    }

    if (candidateArea >= 0.015f && onSide) {
      BOOL hasMoreCenteredSmaller = NO;
      for (NSUInteger other = 0; other < count; other++) {
        if (other == candidate) {
          continue;
        }
        CGFloat otherArea = areas[other].floatValue;
        if (otherArea < kGumpMinKeepFaceArea || otherArea >= candidateArea * 0.85f) {
          continue;
        }
        if (fabs(centerXs[other].floatValue - 0.5f) < fabs(candidateCenterX - 0.5f)) {
          hasMoreCenteredSmaller = YES;
          break;
        }
      }
      if (hasMoreCenteredSmaller) {
        [reject addIndex:candidate];
      }
    }
  }

  if (reject.count == 0) {
    return faces;
  }

  NSMutableArray *kept = [NSMutableArray arrayWithCapacity:count - reject.count];
  for (NSUInteger index = 0; index < count; index++) {
    if (![reject containsIndex:index]) {
      [kept addObject:faces[index]];
    }
  }
  return kept;
}

- (NSArray *)rejectLikelyBackdropBillboardFaceDictionaries:(NSArray *)faces
{
  if (faces.count <= 1) {
    return faces;
  }

  NSMutableIndexSet *stageIndexes = [NSMutableIndexSet indexSet];
  NSMutableIndexSet *billboardIndexes = [NSMutableIndexSet indexSet];
  for (NSUInteger index = 0; index < faces.count; index++) {
    NSDictionary *face = faces[index];
    CGFloat area = [self faceDictionaryArea:face];
    CGPoint center = [self faceDictionaryCenter:face];
    if (area >= kGumpMinKeepFaceArea && center.y >= 0.45f && center.y <= 0.88f) {
      [stageIndexes addIndex:index];
    }
    if (area >= 0.012f && center.y < 0.40f) {
      [billboardIndexes addIndex:index];
    }
  }

  if (stageIndexes.count == 0 || billboardIndexes.count == 0) {
    return faces;
  }

  NSMutableArray *kept = [NSMutableArray arrayWithCapacity:faces.count];
  for (NSUInteger index = 0; index < faces.count; index++) {
    if ([billboardIndexes containsIndex:index]) {
      continue;
    }
    [kept addObject:faces[index]];
  }
  return kept.count > 0 ? kept : faces;
}

- (NSArray *)postProcessFaceDictionaries:(NSArray *)faces
{
  NSArray *filtered = [self rejectLikelyNonFaceArtifactDictionaries:faces];
  filtered = [self rejectLikelyDisplayedMediaFaceDictionaries:filtered];
  filtered = [self rejectLikelyBackdropBillboardFaceDictionaries:filtered];
  return [self reindexFaceDictionaries:filtered];
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
  if ([handler performRequests:@[ landmarksRequest ] error:&error] &&
      landmarksRequest.results.count > 0) {
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

  NSMutableArray<VNFaceObservation *> *acceptedFaces =
      [NSMutableArray arrayWithCapacity:analysisFaces.count];
  for (NSInteger index = 0; index < (NSInteger)analysisFaces.count; index++) {
    VNFaceObservation *face = analysisFaces[index];
    NSNumber *captureQuality = qualityByFaceId[face.uuid];
    if (captureQuality == nil && qualityFaces != nil &&
        index < (NSInteger)qualityFaces.count) {
      captureQuality = qualityFaces[index].faceCaptureQuality;
    }
    if (captureQuality != nil) {
      qualityByFaceId[face.uuid] = captureQuality;
    }
    if (![self isAcceptableFaceObservation:face
                                imageWidth:imageWidth
                               imageHeight:imageHeight
                            captureQuality:captureQuality]) {
      continue;
    }
    [acceptedFaces addObject:face];
  }

  NSArray<VNFaceObservation *> *dedupedAccepted =
      [self deduplicateFaceObservations:acceptedFaces];

  NSMutableArray *faces = [NSMutableArray arrayWithCapacity:dedupedAccepted.count];
  for (NSInteger index = 0; index < (NSInteger)dedupedAccepted.count; index++) {
    VNFaceObservation *face = dedupedAccepted[index];
    NSNumber *captureQuality = qualityByFaceId[face.uuid];
    [faces addObject:[self faceDictionaryFromObservation:face
                                                   index:index
                                         captureQuality:captureQuality
                                                cgImage:cgImage]];
  }
  return [self postProcessFaceDictionaries:faces];
}

/// Preserved Apple Vision path (gold-standard reference / fallback).
/// Live culling defaults to shared SCRFD+OCEC via GumpSharedFaceDetection.
- (NSArray *)facesFromCGImageUsingVision:(CGImageRef)cgImage
{
  if (cgImage == NULL) {
    return @[];
  }

  size_t imageWidth = CGImageGetWidth(cgImage);
  size_t imageHeight = CGImageGetHeight(cgImage);
  NSArray<VNFaceObservation *> *rectFaces = [self collectFaceRectanglesFromCGImage:cgImage];
  if (rectFaces.count == 0) {
    return @[];
  }

  VNImageRequestHandler *handler =
      [[VNImageRequestHandler alloc] initWithCGImage:cgImage options:@{}];
  return [self buildFaceResultsFromRectObservations:rectFaces
                                            handler:handler
                                         imageWidth:imageWidth
                                        imageHeight:imageHeight
                                            cgImage:cgImage];
}

- (BOOL)shouldUseVisionFaceEngine
{
  NSString *env = [[[NSProcessInfo processInfo] environment] objectForKey:@"GUMP_FACE_ENGINE"];
  if (env.length == 0) {
    return NO;
  }
  env = env.lowercaseString;
  return [env isEqualToString:@"vision"] || [env isEqualToString:@"macos"] ||
         [env isEqualToString:@"apple"];
}

- (NSUInteger)faceAnalysisMaxPixelSize
{
  return [self shouldUseVisionFaceEngine] ? kGumpAnalysisMaxPixelSize
                                          : kGumpScrfdAnalysisMaxPixelSize;
}

- (NSArray *)facesFromCGImage:(CGImageRef)cgImage
{
  if (cgImage == NULL) {
    return @[];
  }

  // Opt-in only. Production parity with Windows requires SCRFD+OCEC — never
  // silently fall back to Apple Vision when SCRFD fails to load.
  if ([self shouldUseVisionFaceEngine]) {
    NSLog(@"[GumpLocalStorage] face engine=vision (GUMP_FACE_ENGINE)");
    return [self facesFromCGImageUsingVision:cgImage];
  }

  if ([GumpSharedFaceDetection isReady]) {
    NSArray *faces = [GumpSharedFaceDetection facesFromCGImage:cgImage];
    NSLog(@"[GumpLocalStorage] face engine=scrfd faces=%lu", (unsigned long)faces.count);
    return faces;
  }

  NSLog(@"[GumpLocalStorage] SCRFD unavailable (%@) — returning no faces (no Vision fallback)",
        [GumpSharedFaceDetection lastError]);
  return @[];
}

- (NSDictionary *)analyzePhotoPayloadFromPath:(NSString *)path
{
  CGImageRef cgImage =
      [self orientedCGImageFromPath:path maxPixelSize:[self faceAnalysisMaxPixelSize]];
  if (cgImage == NULL) {
    return nil;
  }

  NSNumber *capturedAt = [self captureTimestampMillisFromPath:path];
  NSArray *faces = nil;
  NSString *perceptualHash = nil;

  if ([self shouldUseVisionFaceEngine]) {
    // Debug escape hatch only — hash still uses shared C++ dHash for consistency.
    faces = [self facesFromCGImageUsingVision:cgImage];
    perceptualHash = [GumpSharedFaceDetection perceptualHashFromCGImage:cgImage];
  } else {
    NSDictionary *analyzed = [GumpSharedFaceDetection analyzeCGImage:cgImage];
    faces = analyzed[@"faces"];
    id hashValue = analyzed[@"perceptualHash"];
    perceptualHash = [hashValue isKindOfClass:[NSString class]] ? hashValue : nil;
    NSLog(@"[GumpLocalStorage] face engine=scrfd faces=%lu", (unsigned long)faces.count);
  }
  CGImageRelease(cgImage);

  return @{
    @"faces" : faces ?: @[],
    @"perceptualHash" : perceptualHash ?: [NSNull null],
    @"capturedAt" : capturedAt ?: [NSNull null],
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

      CGImageRef cgImage =
          [self orientedCGImageFromPath:path maxPixelSize:[self faceAnalysisMaxPixelSize]];
      if (cgImage == NULL) {
        dispatch_async(dispatch_get_main_queue(), ^{
          reject(@"EIMAGE", @"Unable to decode image", nil);
        });
        return;
      }

      NSArray *faces = [self facesFromCGImage:cgImage];
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

RCT_EXPORT_METHOD(analyzePhotoForCulling:(NSString *)uri
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

      NSDictionary *payload = [self analyzePhotoPayloadFromPath:path];
      if (payload == nil) {
        dispatch_async(dispatch_get_main_queue(), ^{
          reject(@"EIMAGE", @"Unable to decode image", nil);
        });
        return;
      }

      dispatch_async(dispatch_get_main_queue(), ^{
        resolve(payload);
      });
    } @catch (NSException *exception) {
      dispatch_async(dispatch_get_main_queue(), ^{
        reject(@"EANALYZE", exception.reason ?: @"Photo analysis failed", nil);
      });
    }
  });
}

- (NSString *)thumbnailDirectory:(NSString *)albumId
{
  return [[self cullingAlbumDirectory:albumId] stringByAppendingPathComponent:@"thumbs"];
}

- (NSString *)thumbnailPathForAlbum:(NSString *)albumId photoId:(NSString *)photoId
{
  return [[self thumbnailDirectory:albumId]
      stringByAppendingPathComponent:[NSString stringWithFormat:@"%@.v4.jpg", photoId]];
}

// Writes an EXIF-oriented JPEG so both platforms render the same pixels without
// relying on the renderer honouring orientation metadata.
- (NSString *)writeOrientedJpegFromPath:(NSString *)sourcePath
                                 toPath:(NSString *)destPath
                           maxPixelSize:(NSUInteger)maxPixelSize
                            jpegQuality:(CGFloat)jpegQuality
{
  NSError *dirError = nil;
  [[NSFileManager defaultManager] createDirectoryAtPath:[destPath stringByDeletingLastPathComponent]
                            withIntermediateDirectories:YES
                                             attributes:nil
                                                  error:&dirError];
  if (dirError != nil) {
    return nil;
  }

  NSURL *sourceURL = [NSURL fileURLWithPath:sourcePath isDirectory:NO];
  CGImageSourceRef source = CGImageSourceCreateWithURL((__bridge CFURLRef)sourceURL, NULL);
  if (source == NULL) {
    return nil;
  }

  NSDictionary *options = @{
    (NSString *)kCGImageSourceCreateThumbnailFromImageAlways : @YES,
    (NSString *)kCGImageSourceThumbnailMaxPixelSize : @(maxPixelSize),
    (NSString *)kCGImageSourceCreateThumbnailWithTransform : @YES,
  };
  CGImageRef oriented =
      CGImageSourceCreateThumbnailAtIndex(source, 0, (__bridge CFDictionaryRef)options);
  CFRelease(source);
  if (oriented == NULL) {
    return nil;
  }

  NSURL *destURL = [NSURL fileURLWithPath:destPath isDirectory:NO];
  CGImageDestinationRef destination =
      CGImageDestinationCreateWithURL((__bridge CFURLRef)destURL, CFSTR("public.jpeg"), 1, NULL);
  if (destination == NULL) {
    CGImageRelease(oriented);
    return nil;
  }

  NSDictionary *properties = @{
    (NSString *)kCGImageDestinationLossyCompressionQuality : @(jpegQuality),
  };
  CGImageDestinationAddImage(destination, oriented, (__bridge CFDictionaryRef)properties);
  BOOL saved = CGImageDestinationFinalize(destination);
  CGImageRelease(oriented);
  CFRelease(destination);

  return saved ? destPath : nil;
}

- (BOOL)jpegPixelSizeAtPath:(NSString *)jpegPath
                      width:(NSUInteger *)outWidth
                     height:(NSUInteger *)outHeight
{
  if (outWidth) {
    *outWidth = 0;
  }
  if (outHeight) {
    *outHeight = 0;
  }
  if (jpegPath.length == 0 ||
      ![[NSFileManager defaultManager] fileExistsAtPath:jpegPath]) {
    return NO;
  }

  NSURL *url = [NSURL fileURLWithPath:jpegPath isDirectory:NO];
  CGImageSourceRef source = CGImageSourceCreateWithURL((__bridge CFURLRef)url, NULL);
  if (source == NULL) {
    return NO;
  }

  NSDictionary *properties = (__bridge_transfer NSDictionary *)
      CGImageSourceCopyPropertiesAtIndex(source, 0, NULL);
  CFRelease(source);

  NSUInteger width =
      [properties[(NSString *)kCGImagePropertyPixelWidth] unsignedIntegerValue];
  NSUInteger height =
      [properties[(NSString *)kCGImagePropertyPixelHeight] unsignedIntegerValue];
  if (width == 0 || height == 0) {
    return NO;
  }
  if (outWidth) {
    *outWidth = width;
  }
  if (outHeight) {
    *outHeight = height;
  }
  return YES;
}

- (NSDictionary *)thumbnailPayloadForPath:(NSString *)thumbPath
{
  if (thumbPath.length == 0) {
    return @{@"thumbnailUri" : [NSNull null]};
  }

  NSUInteger width = 0;
  NSUInteger height = 0;
  [self jpegPixelSizeAtPath:thumbPath width:&width height:&height];
  NSMutableDictionary *payload = [@{
    @"thumbnailUri" : [NSString stringWithFormat:@"file://%@", thumbPath],
  } mutableCopy];
  if (width > 0 && height > 0) {
    payload[@"thumbnailWidth"] = @(width);
    payload[@"thumbnailHeight"] = @(height);
  }
  return payload;
}

- (BOOL)isReusableOrientedJpegAtPath:(NSString *)jpegPath
                        maxPixelSize:(NSUInteger)maxPixelSize
{
  NSUInteger width = 0;
  NSUInteger height = 0;
  if (![self jpegPixelSizeAtPath:jpegPath width:&width height:&height]) {
    return NO;
  }
  return width <= maxPixelSize && height <= maxPixelSize;
}

- (NSString *)generateThumbnailAtPath:(NSString *)sourcePath
                              albumId:(NSString *)albumId
                              photoId:(NSString *)photoId
{
  NSString *thumbPath = [self thumbnailPathForAlbum:albumId photoId:photoId];

  NSString *legacyThumbPath = [[self thumbnailDirectory:albumId]
      stringByAppendingPathComponent:[NSString stringWithFormat:@"%@.jpg", photoId]];
  if ([[NSFileManager defaultManager] fileExistsAtPath:legacyThumbPath]) {
    [[NSFileManager defaultManager] removeItemAtPath:legacyThumbPath error:nil];
  }

  if ([self isReusableOrientedJpegAtPath:thumbPath
                            maxPixelSize:THUMBNAIL_REUSABLE_MAX_PIXEL_SIZE]) {
    return thumbPath;
  }

  if ([[NSFileManager defaultManager] fileExistsAtPath:thumbPath]) {
    [[NSFileManager defaultManager] removeItemAtPath:thumbPath error:nil];
  }

  return [self writeOrientedJpegFromPath:sourcePath
                                  toPath:thumbPath
                            maxPixelSize:THUMBNAIL_GENERATE_MAX_PIXEL_SIZE
                             jpegQuality:THUMBNAIL_JPEG_QUALITY];
}

- (NSString *)detailDirectory:(NSString *)albumId
{
  return [[self cullingAlbumDirectory:albumId] stringByAppendingPathComponent:@"details"];
}

- (NSString *)detailPathForAlbum:(NSString *)albumId photoId:(NSString *)photoId
{
  return [[self detailDirectory:albumId]
      stringByAppendingPathComponent:[NSString stringWithFormat:@"%@.d1.jpg", photoId]];
}

- (NSString *)generateDetailAtPath:(NSString *)sourcePath
                           albumId:(NSString *)albumId
                           photoId:(NSString *)photoId
{
  NSString *detailPath = [self detailPathForAlbum:albumId photoId:photoId];
  if ([self isReusableOrientedJpegAtPath:detailPath
                            maxPixelSize:DETAIL_MAX_PIXEL_SIZE]) {
    return detailPath;
  }

  return [self writeOrientedJpegFromPath:sourcePath
                                  toPath:detailPath
                            maxPixelSize:DETAIL_MAX_PIXEL_SIZE
                             jpegQuality:DETAIL_JPEG_QUALITY];
}

- (NSString *)faceCropDirectory:(NSString *)albumId
{
  return [[self cullingAlbumDirectory:albumId] stringByAppendingPathComponent:@"face-thumbs"];
}

- (NSString *)faceCropPathForAlbum:(NSString *)albumId
                           photoId:(NSString *)photoId
                         faceIndex:(NSInteger)faceIndex
{
  return [[self faceCropDirectory:albumId]
      stringByAppendingPathComponent:[NSString stringWithFormat:@"%@-%ld.jpg", photoId, (long)faceIndex]];
}

- (CGRect)paddedFaceCropRectForImageWidth:(CGFloat)imageWidth
                              imageHeight:(CGFloat)imageHeight
                             boundingBox:(NSDictionary *)box
{
  CGFloat left = [box[@"left"] doubleValue];
  CGFloat top = [box[@"top"] doubleValue];
  CGFloat width = [box[@"width"] doubleValue];
  CGFloat height = [box[@"height"] doubleValue];

  MediaDerivatives::FaceCropRect rect = MediaDerivatives::ComputePaddedFaceCropRect(
      (int)imageWidth,
      (int)imageHeight,
      (float)left,
      (float)top,
      (float)width,
      (float)height);

  return CGRectMake(rect.left, rect.top, rect.width, rect.height);
}

// Keep aspect by center-cropping the padded rect to a square before scaling
// into the output thumbnail.
- (CGRect)squareCoverCropRect:(CGRect)rect
{
  MediaDerivatives::FaceCropRect input{
      (int)rect.origin.x,
      (int)rect.origin.y,
      (int)rect.size.width,
      (int)rect.size.height,
  };
  MediaDerivatives::FaceCropRect result = MediaDerivatives::MakeSquareCoverCrop(input);
  return CGRectMake(result.left, result.top, result.width, result.height);
}

- (BOOL)writeFaceCropImage:(CGImageRef)sourceImage
               boundingBox:(NSDictionary *)box
                   albumId:(NSString *)albumId
                   photoId:(NSString *)photoId
                 faceIndex:(NSInteger)faceIndex
{
  if (sourceImage == NULL || box == nil) {
    return NO;
  }

  NSString *faceCropDir = [self faceCropDirectory:albumId];
  NSError *dirError = nil;
  [[NSFileManager defaultManager] createDirectoryAtPath:faceCropDir
                            withIntermediateDirectories:YES
                                             attributes:nil
                                                  error:&dirError];
  if (dirError != nil) {
    return NO;
  }

  NSString *cropPath = [self faceCropPathForAlbum:albumId photoId:photoId faceIndex:faceIndex];
  if ([[NSFileManager defaultManager] fileExistsAtPath:cropPath]) {
    [[NSFileManager defaultManager] removeItemAtPath:cropPath error:nil];
  }

  size_t imageWidth = CGImageGetWidth(sourceImage);
  size_t imageHeight = CGImageGetHeight(sourceImage);
  if (imageWidth == 0 || imageHeight == 0) {
    return NO;
  }

  CGRect viewRect = [self paddedFaceCropRectForImageWidth:imageWidth
                                              imageHeight:imageHeight
                                             boundingBox:box];
  viewRect = [self squareCoverCropRect:viewRect];

  CGImageRef cropped = CGImageCreateWithImageInRect(sourceImage, viewRect);
  if (cropped == NULL) {
    return NO;
  }

  const size_t outputSize = kFaceCropOutputPixelSize;
  CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
  CGContextRef context = CGBitmapContextCreate(NULL,
                                                 outputSize,
                                                 outputSize,
                                                 8,
                                                 outputSize * 4,
                                                 colorSpace,
                                                 kCGImageAlphaPremultipliedLast);
  CGColorSpaceRelease(colorSpace);
  if (context == NULL) {
    CGImageRelease(cropped);
    return NO;
  }

  CGContextSetInterpolationQuality(context, kCGInterpolationHigh);
  CGContextDrawImage(context, CGRectMake(0, 0, outputSize, outputSize), cropped);
  CGImageRelease(cropped);

  CGImageRef outputImage = CGBitmapContextCreateImage(context);
  CGContextRelease(context);
  if (outputImage == NULL) {
    return NO;
  }

  NSURL *destURL = [NSURL fileURLWithPath:cropPath isDirectory:NO];
  CGImageDestinationRef destination =
      CGImageDestinationCreateWithURL((__bridge CFURLRef)destURL, CFSTR("public.jpeg"), 1, NULL);
  if (destination == NULL) {
    CGImageRelease(outputImage);
    return NO;
  }

  NSDictionary *properties = @{
    (NSString *)kCGImageDestinationLossyCompressionQuality : @(0.85),
  };
  CGImageDestinationAddImage(destination, outputImage, (__bridge CFDictionaryRef)properties);
  BOOL saved = CGImageDestinationFinalize(destination);
  CGImageRelease(outputImage);
  CFRelease(destination);

  return saved;
}

- (NSArray *)generateFaceCropsAtPath:(NSString *)sourcePath
                             albumId:(NSString *)albumId
                             photoId:(NSString *)photoId
                               faces:(NSArray *)faces
{
  if (sourcePath.length == 0 || faces.count == 0) {
    return @[];
  }

  NSMutableArray *cropUris = [NSMutableArray arrayWithCapacity:faces.count];
  CGImageRef sourceImage = NULL;
  for (NSDictionary *face in faces) {
    NSNumber *faceIndexValue = face[@"faceIndex"];
    NSDictionary *boundingBox = face[@"boundingBox"];
    if (faceIndexValue == nil || boundingBox == nil) {
      [cropUris addObject:[NSNull null]];
      continue;
    }

    NSInteger faceIndex = faceIndexValue.integerValue;
    NSString *cropPath = [self faceCropPathForAlbum:albumId photoId:photoId faceIndex:faceIndex];

    if ([[NSFileManager defaultManager] fileExistsAtPath:cropPath]) {
      [cropUris addObject:[NSString stringWithFormat:@"file://%@", cropPath]];
      continue;
    }

    if (sourceImage == NULL) {
      sourceImage =
          [self orientedCGImageFromPath:sourcePath maxPixelSize:kGumpAnalysisMaxPixelSize];
      if (sourceImage == NULL) {
        [cropUris addObject:[NSNull null]];
        continue;
      }
    }

    BOOL saved = [self writeFaceCropImage:sourceImage
                              boundingBox:boundingBox
                                  albumId:albumId
                                  photoId:photoId
                                faceIndex:faceIndex];

    if (!saved) {
      [cropUris addObject:[NSNull null]];
      continue;
    }

    [cropUris addObject:[NSString stringWithFormat:@"file://%@", cropPath]];
  }

  if (sourceImage != NULL) {
    CGImageRelease(sourceImage);
  }

  return cropUris;
}

- (void)deleteFaceCropsForPhotoId:(NSString *)photoId inAlbumDir:(NSString *)albumDir
{
  NSString *faceCropDir = [albumDir stringByAppendingPathComponent:@"face-thumbs"];
  NSArray<NSString *> *entries =
      [[NSFileManager defaultManager] contentsOfDirectoryAtPath:faceCropDir error:nil];
  if (entries.count == 0) {
    return;
  }

  NSString *prefix = [NSString stringWithFormat:@"%@-", photoId];
  for (NSString *entry in entries) {
    if ([entry hasPrefix:prefix]) {
      [[NSFileManager defaultManager]
          removeItemAtPath:[faceCropDir stringByAppendingPathComponent:entry]
                     error:nil];
    }
  }
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
      if (!CopyOrCloneRegularFile(sourcePath, destPath, &copyError)) {
        dispatch_async(dispatch_get_main_queue(), ^{
          reject(@"ECOPY", copyError.localizedDescription, copyError);
        });
        return;
      }

      NSString *thumbPath =
          [self generateThumbnailAtPath:destPath albumId:albumId photoId:destId];
      if (thumbPath.length == 0) {
        [[NSFileManager defaultManager] removeItemAtPath:destPath error:nil];
        dispatch_async(dispatch_get_main_queue(), ^{
          reject(@"ETHUMB", @"Failed to generate thumbnail for local photo copy", nil);
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
      NSMutableDictionary *payload = [result mutableCopy];
      [payload addEntriesFromDictionary:[self thumbnailPayloadForPath:thumbPath]];

      dispatch_async(dispatch_get_main_queue(), ^{
        resolve(payload);
      });
    } @catch (NSException *exception) {
      dispatch_async(dispatch_get_main_queue(), ^{
        reject(@"EUNKNOWN", exception.reason, nil);
      });
    }
  });
}

RCT_EXPORT_METHOD(ensureThumbnail:(NSString *)albumId
                  sourceUri:(NSString *)sourceUri
                  photoId:(NSString *)photoId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
    @try {
      NSString *sourcePath = [self pathFromUri:sourceUri];
      if (sourcePath.length == 0 ||
          ![[NSFileManager defaultManager] fileExistsAtPath:sourcePath]) {
        dispatch_async(dispatch_get_main_queue(), ^{
          resolve(@{@"thumbnailUri" : [NSNull null]});
        });
        return;
      }

      NSString *generatedPath =
          [self generateThumbnailAtPath:sourcePath albumId:albumId photoId:photoId];
      dispatch_async(dispatch_get_main_queue(), ^{
        resolve([self thumbnailPayloadForPath:generatedPath]);
      });
    } @catch (NSException *exception) {
      dispatch_async(dispatch_get_main_queue(), ^{
        reject(@"ETHUMB", exception.reason ?: @"Thumbnail generation failed", nil);
      });
    }
  });
}

RCT_EXPORT_METHOD(ensureDetail:(NSString *)albumId
                  sourceUri:(NSString *)sourceUri
                  photoId:(NSString *)photoId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
    @try {
      NSString *sourcePath = [self pathFromUri:sourceUri];
      if (sourcePath.length == 0 ||
          ![[NSFileManager defaultManager] fileExistsAtPath:sourcePath]) {
        dispatch_async(dispatch_get_main_queue(), ^{
          resolve(@{@"detailUri" : [NSNull null]});
        });
        return;
      }

      NSString *generatedPath =
          [self generateDetailAtPath:sourcePath albumId:albumId photoId:photoId];
      dispatch_async(dispatch_get_main_queue(), ^{
        if (generatedPath.length > 0) {
          resolve(@{
            @"detailUri" : [NSString stringWithFormat:@"file://%@", generatedPath],
          });
        } else {
          resolve(@{@"detailUri" : [NSNull null]});
        }
      });
    } @catch (NSException *exception) {
      dispatch_async(dispatch_get_main_queue(), ^{
        reject(@"EDETAIL", exception.reason ?: @"Detail generation failed", nil);
      });
    }
  });
}

RCT_EXPORT_METHOD(ensureFaceCrops:(NSString *)albumId
                  sourceUri:(NSString *)sourceUri
                  photoId:(NSString *)photoId
                  faces:(NSArray *)faces
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
    @try {
      NSString *sourcePath = [self pathFromUri:sourceUri];
      if (sourcePath.length == 0 ||
          ![[NSFileManager defaultManager] fileExistsAtPath:sourcePath]) {
        dispatch_async(dispatch_get_main_queue(), ^{
          resolve(@{@"cropUris" : @[]});
        });
        return;
      }

      NSArray *cropUris = [self generateFaceCropsAtPath:sourcePath
                                                albumId:albumId
                                                photoId:photoId
                                                  faces:faces];
      dispatch_async(dispatch_get_main_queue(), ^{
        resolve(@{@"cropUris" : cropUris});
      });
    } @catch (NSException *exception) {
      dispatch_async(dispatch_get_main_queue(), ^{
        reject(@"EFACECROP", exception.reason ?: @"Face crop generation failed", nil);
      });
    }
  });
}

RCT_EXPORT_METHOD(getThumbnailUri:(NSString *)albumId
                  photoId:(NSString *)photoId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    NSString *thumbPath = [self thumbnailPathForAlbum:albumId photoId:photoId];
    NSString *thumbnailUri = nil;
    if (thumbPath.length > 0 &&
        [[NSFileManager defaultManager] fileExistsAtPath:thumbPath]) {
      thumbnailUri = [NSString stringWithFormat:@"file://%@", thumbPath];
    }
    dispatch_async(dispatch_get_main_queue(), ^{
      if (thumbnailUri.length > 0) {
        resolve(thumbnailUri);
      } else {
        resolve([NSNull null]);
      }
    });
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
      if ([entry hasPrefix:@"."] || [entry isEqualToString:@"thumbs"] ||
          [entry isEqualToString:@"details"] || [entry isEqualToString:@"previews"] ||
          [entry isEqualToString:@"face-thumbs"]) {
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

    NSString *fileName = [path lastPathComponent];
    NSString *photoId = [fileName stringByDeletingPathExtension];
    NSString *albumDir = [path stringByDeletingLastPathComponent];
    NSString *thumbPath =
        [albumDir stringByAppendingPathComponent:
                       [NSString stringWithFormat:@"thumbs/%@.v4.jpg", photoId]];
    if ([[NSFileManager defaultManager] fileExistsAtPath:thumbPath]) {
      [[NSFileManager defaultManager] removeItemAtPath:thumbPath error:nil];
    }
    NSString *legacyThumbPath =
        [albumDir stringByAppendingPathComponent:
                       [NSString stringWithFormat:@"thumbs/%@.jpg", photoId]];
    if ([[NSFileManager defaultManager] fileExistsAtPath:legacyThumbPath]) {
      [[NSFileManager defaultManager] removeItemAtPath:legacyThumbPath error:nil];
    }
    NSString *detailPath =
        [albumDir stringByAppendingPathComponent:
                       [NSString stringWithFormat:@"details/%@.d1.jpg", photoId]];
    if ([[NSFileManager defaultManager] fileExistsAtPath:detailPath]) {
      [[NSFileManager defaultManager] removeItemAtPath:detailPath error:nil];
    }

    [self deleteFaceCropsForPhotoId:photoId inAlbumDir:albumDir];

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

  // EXIF DateTime has no timezone — interpret as UTC on both platforms.
  const auto millis = FaceDetection::parseExifDateTimeToUnixMillisUtc(
      std::string(dateString.UTF8String));
  if (!millis.has_value()) {
    return nil;
  }
  return @((long long)*millis);
}

- (NSString *)differenceHashHexFromCGImage:(CGImageRef)image
{
  return [GumpSharedFaceDetection perceptualHashFromCGImage:image];
}

- (NSString *)differenceHashHexFromPath:(NSString *)path
{
  // Same analysis max size as face detect / unified analyze (not 256 / thumbs).
  CGImageRef image =
      [self orientedCGImageFromPath:path maxPixelSize:kGumpScrfdAnalysisMaxPixelSize];
  if (image == NULL) {
    return nil;
  }
  NSString *hash = [self differenceHashHexFromCGImage:image];
  CGImageRelease(image);
  return hash;
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
