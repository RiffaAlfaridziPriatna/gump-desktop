#import "GumpFilePicker.h"

#import <AppKit/AppKit.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

static NSMutableDictionary<NSString *, NSURL *> *GumpScopedURLMap(void)
{
  static NSMutableDictionary<NSString *, NSURL *> *urls;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    urls = [NSMutableDictionary dictionary];
  });
  return urls;
}

static NSString *GumpNormalizedFilePath(NSString *path)
{
  if (path.length == 0) {
    return @"";
  }
  return path.stringByStandardizingPath ?: path;
}

static void GumpStoreScopedURL(NSString *path, NSURL *url)
{
  if (path.length == 0 || url == nil) {
    return;
  }
  GumpScopedURLMap()[path] = url;
}

void GumpRetainSecurityScopedFileURL(NSURL *url)
{
  if (url == nil) {
    return;
  }

  NSString *path = url.path;
  NSString *normalized = GumpNormalizedFilePath(path);
  if (normalized.length == 0) {
    return;
  }

  @synchronized(GumpScopedURLMap()) {
    NSURL *existing = GumpScopedURLMap()[normalized] ?: GumpScopedURLMap()[path ?: @""];
    if (existing != nil) {
      return;
    }
    [url startAccessingSecurityScopedResource];
    GumpStoreScopedURL(normalized, url);
    if (path.length > 0 && ![path isEqualToString:normalized]) {
      GumpStoreScopedURL(path, url);
    }
  }
}

BOOL GumpHasSecurityScopedFilePath(NSString *path)
{
  NSString *normalized = GumpNormalizedFilePath(path);
  @synchronized(GumpScopedURLMap()) {
    return GumpScopedURLMap()[normalized] != nil ||
           (path.length > 0 && GumpScopedURLMap()[path] != nil);
  }
}

void GumpReleaseSecurityScopedFilePath(NSString *path)
{
  NSString *normalized = GumpNormalizedFilePath(path);
  @synchronized(GumpScopedURLMap()) {
    NSURL *url = GumpScopedURLMap()[normalized];
    if (url == nil && path.length > 0) {
      url = GumpScopedURLMap()[path];
    }
    if (url == nil) {
      return;
    }
    [url stopAccessingSecurityScopedResource];
    NSArray<NSString *> *keys = [GumpScopedURLMap() allKeysForObject:url];
    if (keys.count > 0) {
      [GumpScopedURLMap() removeObjectsForKeys:keys];
    }
  }
}

@implementation GumpFilePicker

RCT_EXPORT_MODULE();

RCT_EXPORT_METHOD(pickImages:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    NSOpenPanel *panel = [NSOpenPanel openPanel];
    panel.canChooseFiles = YES;
    panel.canChooseDirectories = NO;
    panel.allowsMultipleSelection = YES;
    panel.allowsOtherFileTypes = NO;
    panel.allowedContentTypes = @[
      UTTypeJPEG,
      UTTypePNG,
      UTTypeGIF,
      UTTypeHEIC,
      UTTypeWebP,
      UTTypeTIFF,
    ];

    [panel beginWithCompletionHandler:^(NSInteger result) {
      if (result != NSModalResponseOK) {
        resolve(@[]);
        return;
      }

      NSMutableArray *files = [NSMutableArray array];
      for (NSURL *url in panel.URLs) {
        NSString *path = url.path;
        if (path == nil) {
          continue;
        }
        GumpRetainSecurityScopedFileURL(url);

        NSDictionary *attributes =
            [[NSFileManager defaultManager] attributesOfItemAtPath:path error:nil];
        NSNumber *fileSize = attributes[NSFileSize];
        NSString *fileName = url.lastPathComponent ?: @"image";
        NSString *uti = url.pathExtension.length > 0
                           ? [NSString stringWithFormat:@"public.%@", url.pathExtension.lowercaseString]
                           : @"image/jpeg";

        [files addObject:@{
          @"uri" : [NSString stringWithFormat:@"file://%@", path],
          @"name" : fileName,
          @"size" : fileSize ?: @(0),
          @"type" : uti,
        }];
      }

      resolve(files);
    }];
  });
}

@end
