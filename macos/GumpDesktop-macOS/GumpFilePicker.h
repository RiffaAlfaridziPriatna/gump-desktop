#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

@interface GumpFilePicker : NSObject <RCTBridgeModule>
@end

// NSOpenPanel access is tied to the NSURL, not the path string JS keeps.
// Hold the panel URLs until local copy finishes so sandbox reads still work.
void GumpRetainSecurityScopedFileURL(NSURL *url);
BOOL GumpHasSecurityScopedFilePath(NSString *path);
NSURL *GumpSecurityScopedFileURLForPath(NSString *path);
void GumpReleaseSecurityScopedFilePath(NSString *path);
