#pragma once

#import <CoreGraphics/CoreGraphics.h>
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Shared SCRFD + OCEC face detection (C++ FaceDetectionPipeline).
/// Returns the same NSDictionary shape as the legacy Vision path so TS culling
/// can consume results without changes.
@interface GumpSharedFaceDetection : NSObject

/// YES once models load successfully.
+ (BOOL)isReady;

/// Last initialize / detect error (empty when healthy).
+ (NSString *)lastError;

/// Detect faces in an oriented CGImage (BGRA conversion happens internally).
+ (NSArray<NSDictionary *> *)facesFromCGImage:(CGImageRef)cgImage;

@end

NS_ASSUME_NONNULL_END
