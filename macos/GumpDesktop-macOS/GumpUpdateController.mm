#import "GumpUpdateController.h"

#import <AppKit/AppKit.h>
#import <Sparkle/Sparkle.h>

typedef NS_ENUM(NSInteger, GumpUpdateMenuState) {
  GumpUpdateMenuStateIdle = 0,
  GumpUpdateMenuStateChecking,
  GumpUpdateMenuStateDownloading,
  GumpUpdateMenuStateReady,
};

@interface GumpUpdateController () <SPUUpdaterDelegate>
@property (nonatomic, strong) SPUStandardUpdaterController *updaterController;
@property (nonatomic, copy) NSString *pendingVersion;
@property (nonatomic, copy) void (^immediateInstallBlock)(void);
@property (nonatomic, strong) NSMenuItem *updateMenuItem;
@property (nonatomic, assign) GumpUpdateMenuState menuState;
@end

@implementation GumpUpdateController

static GumpUpdateController *s_shared = nil;

+ (BOOL)isProdBuild
{
  NSString *buildId = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"GUMPAppBuildId"];
  if (![buildId isKindOfClass:[NSString class]] || buildId.length == 0) {
    return NO;
  }
  return [buildId isEqualToString:@"prod"];
}

+ (void)bootstrap
{
  dispatch_async(dispatch_get_main_queue(), ^{
    if (![self isProdBuild]) {
      NSLog(@"[GumpUpdateController] Auto-update disabled (GUMPAppBuildId=%@)",
            [[NSBundle mainBundle] objectForInfoDictionaryKey:@"GUMPAppBuildId"] ?: @"(missing)");
      return;
    }
    if (s_shared != nil) {
      [s_shared installMenuItemIfNeeded];
      return;
    }
    s_shared = [[GumpUpdateController alloc] init];
  });
}

- (instancetype)init
{
  if (self = [super init]) {
    _menuState = GumpUpdateMenuStateIdle;
    self.updaterController = [[SPUStandardUpdaterController alloc]
        initWithStartingUpdater:YES
                updaterDelegate:self
             userDriverDelegate:nil];
    [self installMenuItemIfNeeded];
  }
  return self;
}

- (void)installMenuItemIfNeeded
{
  if (self.updateMenuItem != nil) {
    return;
  }

  NSMenu *appMenu = [NSApp.mainMenu itemAtIndex:0].submenu;
  if (appMenu == nil) {
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.25 * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{
                     [self installMenuItemIfNeeded];
                   });
    return;
  }

  NSInteger insertIndex = 1;
  for (NSInteger i = 0; i < appMenu.numberOfItems; i++) {
    NSMenuItem *item = [appMenu itemAtIndex:i];
    if (item.isSeparatorItem) {
      insertIndex = i + 1;
      break;
    }
  }

  self.updateMenuItem =
      [[NSMenuItem alloc] initWithTitle:@"Check for Updates…"
                                 action:@selector(updateMenuAction:)
                          keyEquivalent:@""];
  self.updateMenuItem.target = self;

  [appMenu insertItem:self.updateMenuItem atIndex:insertIndex];
  [appMenu insertItem:[NSMenuItem separatorItem] atIndex:insertIndex + 1];
  [self refreshMenuItem];
}

- (void)setMenuState:(GumpUpdateMenuState)menuState
{
  if (_menuState == menuState) {
    [self refreshMenuItem];
    return;
  }
  _menuState = menuState;
  [self refreshMenuItem];
}

- (void)refreshMenuItem
{
  if (self.updateMenuItem == nil) {
    return;
  }

  switch (self.menuState) {
    case GumpUpdateMenuStateChecking:
      self.updateMenuItem.title = @"Checking for Updates…";
      self.updateMenuItem.enabled = NO;
      break;
    case GumpUpdateMenuStateDownloading:
      self.updateMenuItem.title = @"Downloading Update…";
      self.updateMenuItem.enabled = NO;
      break;
    case GumpUpdateMenuStateReady: {
      if (self.pendingVersion.length > 0) {
        self.updateMenuItem.title =
            [NSString stringWithFormat:@"Restart to Update (v%@)", self.pendingVersion];
      } else {
        self.updateMenuItem.title = @"Restart to Update";
      }
      self.updateMenuItem.enabled = YES;
      break;
    }
    case GumpUpdateMenuStateIdle:
    default:
      self.updateMenuItem.title = @"Check for Updates…";
      self.updateMenuItem.enabled = YES;
      break;
  }
}

- (void)updateMenuAction:(id)sender
{
  switch (self.menuState) {
    case GumpUpdateMenuStateReady:
      [self restartToUpdate];
      break;
    case GumpUpdateMenuStateIdle:
      [self checkForUpdates];
      break;
    default:
      break;
  }
}

- (void)checkForUpdates
{
  if (self.updaterController == nil || self.menuState != GumpUpdateMenuStateIdle) {
    return;
  }
  // Background check — status lives in the menu, not Sparkle's dialog.
  self.menuState = GumpUpdateMenuStateChecking;
  [self.updaterController.updater checkForUpdatesInBackground];
}

- (void)restartToUpdate
{
  if (self.immediateInstallBlock) {
    self.immediateInstallBlock();
    return;
  }
  [[NSApplication sharedApplication] terminate:nil];
}

- (void)resetToIdleUnlessReady
{
  if (self.menuState == GumpUpdateMenuStateReady) {
    return;
  }
  self.menuState = GumpUpdateMenuStateIdle;
}

#pragma mark - SPUUpdaterDelegate

- (void)updater:(SPUUpdater *)updater didFindValidUpdate:(SUAppcastItem *)item
{
  self.pendingVersion = item.displayVersionString;
  dispatch_async(dispatch_get_main_queue(), ^{
    if (self.menuState != GumpUpdateMenuStateReady) {
      self.menuState = GumpUpdateMenuStateDownloading;
    }
  });
}

- (void)updaterDidNotFindUpdate:(SPUUpdater *)updater
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [self resetToIdleUnlessReady];
  });
}

- (void)updater:(SPUUpdater *)updater
    willDownloadUpdate:(SUAppcastItem *)item
           withRequest:(NSMutableURLRequest *)request
{
  self.pendingVersion = item.displayVersionString;
  dispatch_async(dispatch_get_main_queue(), ^{
    self.menuState = GumpUpdateMenuStateDownloading;
  });
}

- (void)updater:(SPUUpdater *)updater didDownloadUpdate:(SUAppcastItem *)item
{
  self.pendingVersion = item.displayVersionString;
  // Keep "Downloading…" until install-on-quit is armed (extraction may still run).
}

- (BOOL)updater:(SPUUpdater *)updater
    willInstallUpdateOnQuit:(SUAppcastItem *)item
    immediateInstallationBlock:(void (^)(void))immediateInstallBlock
{
  self.pendingVersion = item.displayVersionString;
  self.immediateInstallBlock = [immediateInstallBlock copy];
  dispatch_async(dispatch_get_main_queue(), ^{
    self.menuState = GumpUpdateMenuStateReady;
  });
  // Take control so menu "Restart to Update" drives install/relaunch.
  return YES;
}

- (void)updater:(SPUUpdater *)updater
    failedToDownloadUpdate:(SUAppcastItem *)item
                     error:(NSError *)error
{
  dispatch_async(dispatch_get_main_queue(), ^{
    self.immediateInstallBlock = nil;
    self.menuState = GumpUpdateMenuStateIdle;
  });
}

- (void)updater:(SPUUpdater *)updater didAbortWithError:(NSError *)error
{
  if (error == nil) {
    return;
  }
  NSInteger code = error.code;
  if (code == 1001 /* SUNoUpdateError */ || code == 1002) {
    dispatch_async(dispatch_get_main_queue(), ^{
      [self resetToIdleUnlessReady];
    });
    return;
  }
  dispatch_async(dispatch_get_main_queue(), ^{
    if (self.menuState != GumpUpdateMenuStateReady) {
      self.menuState = GumpUpdateMenuStateIdle;
    }
  });
}

@end
