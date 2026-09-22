#import "GumpUpdateController.h"

#import <AppKit/AppKit.h>
#import <Sparkle/Sparkle.h>

typedef NS_ENUM(NSInteger, GumpUpdateMenuState) {
  GumpUpdateMenuStateIdle = 0,
  GumpUpdateMenuStateChecking,
  GumpUpdateMenuStateDownloading,
  GumpUpdateMenuStateReady,
  GumpUpdateMenuStateInstalling,
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
    // Silent download → extract → willInstallUpdateOnQuit (menu Restart).
    self.updaterController.updater.automaticallyDownloadsUpdates = YES;
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

  // Clearing `action` is required: AppKit menu validation re-enables items that
  // still have a valid target/action when the menu is reopened (enabled=NO alone
  // is not enough — matches "disabled after click, enabled after reopen").
  switch (self.menuState) {
    case GumpUpdateMenuStateChecking:
      self.updateMenuItem.title = @"Checking for Updates…";
      self.updateMenuItem.action = nil;
      self.updateMenuItem.enabled = NO;
      break;
    case GumpUpdateMenuStateDownloading:
      self.updateMenuItem.title = @"Downloading Update…";
      self.updateMenuItem.action = nil;
      self.updateMenuItem.enabled = NO;
      break;
    case GumpUpdateMenuStateReady: {
      self.updateMenuItem.title = @"Restart to Update";
      self.updateMenuItem.action = @selector(updateMenuAction:);
      self.updateMenuItem.enabled = YES;
      break;
    }
    case GumpUpdateMenuStateInstalling:
      self.updateMenuItem.title = @"Installing Update…";
      self.updateMenuItem.action = nil;
      self.updateMenuItem.enabled = NO;
      break;
    case GumpUpdateMenuStateIdle:
    default:
      self.updateMenuItem.title = @"Check for Updates…";
      self.updateMenuItem.action = @selector(updateMenuAction:);
      self.updateMenuItem.enabled = YES;
      break;
  }
}

- (BOOL)validateMenuItem:(NSMenuItem *)menuItem
{
  if (menuItem != self.updateMenuItem) {
    return YES;
  }
  return self.menuState == GumpUpdateMenuStateIdle ||
         self.menuState == GumpUpdateMenuStateReady;
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
  // Menu-driven status only — no Sparkle dialogs.
  self.menuState = GumpUpdateMenuStateChecking;
  [self.updaterController.updater checkForUpdatesInBackground];
}

- (void)restartToUpdate
{
  // Must invoke Sparkle's block (from willInstallUpdateOnQuit). Bare terminate
  // closes the app without installing/relaunching when we returned YES there.
  if (self.immediateInstallBlock == nil) {
    NSLog(@"[GumpUpdateController] Restart ignored — install block not armed yet");
    return;
  }
  void (^install)(void) = self.immediateInstallBlock;
  self.immediateInstallBlock = nil;
  install();
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
    if (self.menuState != GumpUpdateMenuStateReady &&
        self.menuState != GumpUpdateMenuStateInstalling) {
      self.menuState = GumpUpdateMenuStateDownloading;
    }
  });
}

- (void)updaterDidNotFindUpdate:(SPUUpdater *)updater
{
  NSLog(@"[GumpUpdateController] No update found");
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
    if (self.menuState == GumpUpdateMenuStateReady ||
        self.menuState == GumpUpdateMenuStateInstalling) {
      return;
    }
    self.menuState = GumpUpdateMenuStateDownloading;
  });
}

- (void)updater:(SPUUpdater *)updater didDownloadUpdate:(SUAppcastItem *)item
{
  self.pendingVersion = item.displayVersionString;
  NSLog(@"[GumpUpdateController] Download finished (v%@) — extracting next",
        item.displayVersionString ?: @"?");
  // Stay on Downloading until willExtractUpdate; that is the real pre-Restart work.
  dispatch_async(dispatch_get_main_queue(), ^{
    if (self.menuState != GumpUpdateMenuStateReady &&
        self.menuState != GumpUpdateMenuStateInstalling) {
      self.menuState = GumpUpdateMenuStateDownloading;
    }
  });
}

- (void)updater:(SPUUpdater *)updater willExtractUpdate:(SUAppcastItem *)item
{
  self.pendingVersion = item.displayVersionString;
  NSLog(@"[GumpUpdateController] Extracting update (v%@)", item.displayVersionString ?: @"?");
  dispatch_async(dispatch_get_main_queue(), ^{
    if (self.menuState != GumpUpdateMenuStateReady) {
      self.menuState = GumpUpdateMenuStateInstalling;
    }
  });
}

- (void)updater:(SPUUpdater *)updater didExtractUpdate:(SUAppcastItem *)item
{
  self.pendingVersion = item.displayVersionString;
  NSLog(@"[GumpUpdateController] Extract finished (v%@) — waiting for install arm",
        item.displayVersionString ?: @"?");
  dispatch_async(dispatch_get_main_queue(), ^{
    if (self.menuState != GumpUpdateMenuStateReady) {
      self.menuState = GumpUpdateMenuStateInstalling;
    }
  });
}

- (BOOL)updater:(SPUUpdater *)updater
    willInstallUpdateOnQuit:(SUAppcastItem *)item
    immediateInstallationBlock:(void (^)(void))immediateInstallBlock
{
  self.pendingVersion = item.displayVersionString;
  self.immediateInstallBlock = [immediateInstallBlock copy];
  NSLog(@"[GumpUpdateController] Install armed (v%@) — Restart will install + relaunch",
        item.displayVersionString ?: @"?");
  // Avoid sudden termination killing the process before Sparkle's installer runs.
  [[NSProcessInfo processInfo] disableSuddenTermination];
  dispatch_async(dispatch_get_main_queue(), ^{
    self.menuState = GumpUpdateMenuStateReady;
  });
  // YES = we own install timing; must call immediateInstallBlock on Restart.
  return YES;
}

- (void)updater:(SPUUpdater *)updater
    failedToDownloadUpdate:(SUAppcastItem *)item
                     error:(NSError *)error
{
  NSLog(@"[GumpUpdateController] Download failed: %@", error);
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
  NSLog(@"[GumpUpdateController] Update aborted: %@", error);
  NSLog(@"[GumpUpdateController] Update aborted detail: %@ | %@",
        error.localizedDescription ?: @"(nil)",
        error.localizedFailureReason ?: @"(nil)");
  NSLog(@"[GumpUpdateController] Update aborted userInfo: %@", error.userInfo);
  NSInteger code = error.code;
  if (code == 1001 /* SUNoUpdateError */ || code == 1002) {
    dispatch_async(dispatch_get_main_queue(), ^{
      [self resetToIdleUnlessReady];
    });
    return;
  }
  dispatch_async(dispatch_get_main_queue(), ^{
    // Clear Checking/Downloading/Installing on real failures — previously
    // Installing was protected and could stick forever after an abort.
    if (self.menuState != GumpUpdateMenuStateReady) {
      self.immediateInstallBlock = nil;
      self.menuState = GumpUpdateMenuStateIdle;
    }
  });
}

@end
