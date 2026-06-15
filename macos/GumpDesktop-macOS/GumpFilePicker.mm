#import "GumpFilePicker.h"

#import <AppKit/AppKit.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

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
