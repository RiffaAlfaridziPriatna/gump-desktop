#import "AppDelegate.h"

#import <CoreText/CoreText.h>
#import <React/RCTBundleURLProvider.h>
#import <ReactAppDependencyProvider/RCTAppDependencyProvider.h>

static void RegisterCustomFonts(void)
{
  NSMutableSet<NSURL *> *fontURLs = [NSMutableSet set];
  NSBundle *bundle = [NSBundle mainBundle];

  for (NSString *fontName in @[
         @"DMSerifDisplay-Regular",
         @"RedHatDisplay-Regular",
         @"RedHatDisplay-Medium",
         @"RedHatDisplay-Bold",
       ]) {
    NSString *fontPath = [bundle pathForResource:fontName ofType:@"ttf"];
    if (fontPath != nil) {
      [fontURLs addObject:[NSURL fileURLWithPath:fontPath]];
    } else {
      NSLog(@"[Fonts] Missing font file: %@.ttf", fontName);
    }
  }

  for (NSURL *fontURL in [bundle URLsForResourcesWithExtension:@"ttf" subdirectory:@"Fonts"]) {
    [fontURLs addObject:fontURL];
  }

  for (NSURL *fontURL in [bundle URLsForResourcesWithExtension:@"ttf" subdirectory:nil]) {
    [fontURLs addObject:fontURL];
  }

  for (NSURL *fontURL in fontURLs) {
    CFErrorRef error = NULL;
    if (!CTFontManagerRegisterFontsForURL(
            (__bridge CFURLRef)fontURL, kCTFontManagerScopeProcess, &error)) {
      if (error != NULL) {
        NSLog(@"[Fonts] Failed to register %@: %@", fontURL.lastPathComponent, (__bridge NSError *)error);
        CFRelease(error);
      }
    } else {
      NSLog(@"[Fonts] Registered %@", fontURL.lastPathComponent);
    }
  }
}

@implementation AppDelegate

+ (void)load
{
  RegisterCustomFonts();
}

- (void)configureMainWindow
{
  NSWindow *window = [[NSApplication sharedApplication] mainWindow];
  if (!window) {
    return;
  }

  // Desktop: enforce a minimum size relative to the current screen's usable area.
  static const CGFloat kMinSizeRatio = 0.60;
  NSScreen *screen = window.screen ?: [NSScreen mainScreen];
  if (screen) {
    NSRect visible = [screen visibleFrame];
    CGFloat minW = floor(visible.size.width * kMinSizeRatio);
    CGFloat minH = floor(visible.size.height * kMinSizeRatio);
    if (minW > 0 && minH > 0) {
      [window setMinSize:NSMakeSize(minW, minH)];

      // Default size: 100% of visible work area (but still resizable down to min).
      [window setFrame:visible display:YES];
    }
  }

  [window setTitle:@"GUMP - Cull Your Photos"];
  [window setAppearance:[NSAppearance appearanceNamed:NSAppearanceNameDarkAqua]];
}

- (void)applicationDidFinishLaunching:(NSNotification *)notification
{
  RegisterCustomFonts();

  self.moduleName = @"GumpDesktop";
  self.initialProps = @{};
  self.dependencyProvider = [RCTAppDependencyProvider new];

  [super applicationDidFinishLaunching:notification];

  dispatch_async(dispatch_get_main_queue(), ^{
    [self configureMainWindow];
  });
}

- (void)applicationDidBecomeActive:(NSNotification *)notification
{
  [self configureMainWindow];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

/// This method controls whether the `concurrentRoot`feature of React18 is turned on or off.
///
/// @see: https://reactjs.org/blog/2022/03/29/react-v18.html
/// @note: This requires to be rendering on Fabric (i.e. on the New Architecture).
/// @return: `true` if the `concurrentRoot` feature is enabled. Otherwise, it returns `false`.
- (BOOL)concurrentRootEnabled
{
#ifdef RN_FABRIC_ENABLED
  return true;
#else
  return false;
#endif
}

@end
