#import "GumpLocalStorage.h"

#import <AppKit/AppKit.h>
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

- (NSString *)uniqueFileName:(NSString *)fileName
{
  NSString *base = [fileName stringByDeletingPathExtension];
  NSString *ext = [fileName pathExtension];
  NSString *uuid = [[NSUUID UUID] UUIDString];
  if (ext.length > 0) {
    return [NSString stringWithFormat:@"%@_%@.%@", base, uuid, ext];
  }
  return [NSString stringWithFormat:@"%@_%@", base, uuid];
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

- (NSDictionary *)faceDictionaryFromObservation:(VNFaceObservation *)face
                                          index:(NSInteger)index
                                captureQuality:(NSNumber *)captureQuality
{
  CGRect box = face.boundingBox;
  CGFloat left = box.origin.x;
  CGFloat top = 1.0 - box.origin.y - box.size.height;
  CGFloat width = box.size.width;
  CGFloat height = box.size.height;

  CGFloat sharpness = captureQuality != nil
                          ? captureQuality.floatValue * 100.0f
                          : face.confidence * 100.0f;

  BOOL hasBothEyes = face.landmarks.leftEye != nil && face.landmarks.rightEye != nil;
  BOOL eyesOpen = hasBothEyes;
  CGFloat eyeConfidence = hasBothEyes ? 92.0f : 60.0f;

  return @{
    @"boundingBox" : @{
      @"left" : @(left),
      @"top" : @(top),
      @"width" : @(width),
      @"height" : @(height),
    },
    @"eyesOpen" : @{
      @"value" : @(eyesOpen),
      @"confidence" : @(eyeConfidence),
    },
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

      NSMutableArray *faces = [NSMutableArray arrayWithCapacity:landmarkFaces.count];
      for (NSInteger index = 0; index < (NSInteger)landmarkFaces.count; index++) {
        VNFaceObservation *face = landmarkFaces[index];
        [faces addObject:[self faceDictionaryFromObservation:face
                                                       index:index
                                             captureQuality:nil]];
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

      NSString *destName = [self uniqueFileName:fileName ?: @"photo.jpg"];
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
      NSString *ext = destPath.pathExtension.lowercaseString;
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

@end
