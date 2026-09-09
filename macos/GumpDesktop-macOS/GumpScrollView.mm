#import "GumpScrollView.h"

#import <AppKit/AppKit.h>
#import <objc/runtime.h>

#import <React/RCTBridge.h>
#import <React/RCTEventDispatcherProtocol.h>
#import <React/RCTScrollEvent.h>
#import <React/RCTScrollView.h>
#import <React/RCTUIManager.h>
#import <React/RCTUIManagerUtils.h>
#import <React/RCTViewManager.h>
#import <React/UIView+React.h>

// Distinct coalescing keys keep our synthetic events from collapsing into one
// another. RCTScrollEvent.canCoalesce is YES and coalesceWithEvent: keeps the
// newer event, so same-key emissions inside one batch would be merged away.
static uint16_t GumpNextCoalescingKey(void)
{
  static uint16_t next = 0x4000;
  if (++next == 0) {
    next = 0x4000;
  }
  return next;
}

static __weak RCTBridge *GumpSharedBridge = nil;
static BOOL GumpScrollerTracking = NO;
static __weak NSScrollView *GumpTrackedScrollView = nil;
static id GumpLocalEventMonitor = nil;
static void (*GumpOrigScrollViewDidScroll)(id, SEL, id) = NULL;

#pragma mark - View resolution

static NSScrollView *GumpFindScrollViewDescending(NSView *view)
{
  if ([view isKindOfClass:[NSScrollView class]]) {
    return (NSScrollView *)view;
  }
  for (NSView *child in view.subviews) {
    NSScrollView *found = GumpFindScrollViewDescending(child);
    if (found != nil) {
      return found;
    }
  }
  return nil;
}

static NSScrollView *GumpFindScrollView(NSView *view)
{
  // Preferred: the react tag belongs to an RCTScrollView, which exposes the
  // underlying NSScrollView as a public readonly property.
  if ([view isKindOfClass:[RCTScrollView class]]) {
    NSScrollView *hosted = (NSScrollView *)[(RCTScrollView *)view scrollView];
    if (hosted != nil) {
      return hosted;
    }
  }
  NSScrollView *found = GumpFindScrollViewDescending(view);
  if (found != nil) {
    return found;
  }
  for (NSView *current = view.superview; current != nil; current = current.superview) {
    if ([current isKindOfClass:[NSScrollView class]]) {
      return (NSScrollView *)current;
    }
  }
  return nil;
}

static RCTScrollView *GumpHostForScrollView(NSScrollView *scrollView)
{
  if (scrollView == nil) {
    return nil;
  }
  for (NSView *current = scrollView; current != nil; current = current.superview) {
    if ([current isKindOfClass:[RCTScrollView class]]) {
      return (RCTScrollView *)current;
    }
  }
  return nil;
}

static void GumpCollectScrollViews(NSView *view, NSMutableArray<NSScrollView *> *out)
{
  if ([view isKindOfClass:[NSScrollView class]]) {
    [out addObject:(NSScrollView *)view];
  }
  for (NSView *child in view.subviews) {
    GumpCollectScrollViews(child, out);
  }
}

// The photo grid is the largest visible NSScrollView. Sidebar lists can have a
// taller document but a much smaller frame.
static NSScrollView *GumpLargestVisibleScrollView(NSWindow *window)
{
  if (window.contentView == nil) {
    return nil;
  }
  NSMutableArray<NSScrollView *> *found = [NSMutableArray array];
  GumpCollectScrollViews(window.contentView, found);
  NSScrollView *best = nil;
  CGFloat bestArea = 0;
  for (NSScrollView *candidate in found) {
    if ([candidate.documentView isKindOfClass:[NSTextView class]]) {
      continue;
    }
    CGFloat area = NSWidth(candidate.frame) * NSHeight(candidate.frame);
    if (area > bestArea) {
      bestArea = area;
      best = candidate;
    }
  }
  return best;
}

#pragma mark - Synthetic scroll event

// Bypasses AppKit's bounds-change notification path entirely, so RCTScrollView's
// _disableScrollEvents gate cannot swallow it. Metrics mirror exactly what
// RCTScrollView.sendScrollEventWithName: would have sent.
static void GumpEmitScrollEvent(id<RCTEventDispatcherProtocol> dispatcher,
                                NSNumber *reactTag,
                                NSScrollView *scrollView)
{
  if (dispatcher == nil || scrollView == nil || reactTag == nil) {
    return;
  }
  NSView *documentView = scrollView.documentView;
  CGSize contentSize = documentView != nil ? documentView.frame.size : CGSizeZero;
  if (contentSize.height <= 0) {
    // VirtualizedList early-returns when contentLength <= 0, which would make
    // the event a no-op. Skip rather than corrupt _scrollMetrics.
    return;
  }

  RCTScrollEvent *event =
      [[RCTScrollEvent alloc] initWithEventName:@"onScroll"
                                       reactTag:reactTag
                        scrollViewContentOffset:scrollView.documentVisibleRect.origin
                         scrollViewContentInset:UIEdgeInsetsZero
                          scrollViewContentSize:contentSize
                                scrollViewFrame:scrollView.frame
                            scrollViewZoomScale:1
                                       userData:nil
                                  coalescingKey:GumpNextCoalescingKey()];
  [dispatcher sendEvent:event];
}

static id<RCTEventDispatcherProtocol> GumpEventDispatcher(void)
{
  return GumpSharedBridge.eventDispatcher;
}

static void GumpEmitScrollEventsForScrollView(NSScrollView *scrollView)
{
  RCTScrollView *host = GumpHostForScrollView(scrollView);
  id<RCTEventDispatcherProtocol> dispatcher = GumpEventDispatcher();
  if (host == nil || dispatcher == nil) {
    return;
  }
  NSNumber *reactTag = host.reactTag;
  GumpEmitScrollEvent(dispatcher, reactTag, scrollView);
  dispatch_async(dispatch_get_main_queue(), ^{
    GumpEmitScrollEvent(dispatcher, reactTag, scrollView);
  });
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.064 * NSEC_PER_SEC)),
                 dispatch_get_main_queue(), ^{
                   GumpEmitScrollEvent(dispatcher, reactTag, scrollView);
                 });
}

#pragma mark - Clip view movement

// The RN document view is always flipped (RCTScrollContentView.isFlipped returns
// !inverted, and this grid is never inverted), so y grows downward and y = 0 is
// the top. There is deliberately no unflipped branch here.
static void GumpMoveClipView(NSScrollView *scrollView, CGFloat offsetY)
{
  NSClipView *clipView = scrollView.contentView;
  if (clipView == nil) {
    return;
  }
  NSPoint target = [clipView constrainScrollPoint:NSMakePoint(0, offsetY)];
  [clipView scrollToPoint:target];
  [scrollView reflectScrolledClipView:clipView];
}

#pragma mark - NSScroller tracking (drop RCT scroll events until mouse up)

static NSScroller *GumpEnclosingScroller(NSView *view)
{
  for (NSView *current = view; current != nil; current = current.superview) {
    if ([current isKindOfClass:[NSScroller class]]) {
      return (NSScroller *)current;
    }
  }
  return nil;
}

static void GumpFlushTrackedScroller(NSScrollView *scrollView)
{
  if (scrollView == nil) {
    return;
  }
  RCTScrollView *host = GumpHostForScrollView(scrollView);
  id<RCTEventDispatcherProtocol> dispatcher = GumpEventDispatcher();
  if (host == nil || dispatcher == nil) {
    return;
  }
  // One event on mouse-up so VirtualizedList can catch the new offset without
  // the 60fps flood that starved JS during knob tracking.
  GumpEmitScrollEvent(dispatcher, host.reactTag, scrollView);
  dispatch_async(dispatch_get_main_queue(), ^{
    GumpEmitScrollEvent(dispatcher, host.reactTag, scrollView);
  });
}

static void GumpHookedScrollViewDidScroll(id self, SEL _cmd, id scrollView)
{
  if (GumpScrollerTracking) {
    return;
  }
  if (GumpOrigScrollViewDidScroll != NULL) {
    GumpOrigScrollViewDidScroll(self, _cmd, scrollView);
  }
}

static void GumpInstallMacosScrollThrottle(void)
{
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    Class cls = NSClassFromString(@"RCTScrollView");
    Method method = class_getInstanceMethod(cls, @selector(scrollViewDidScroll:));
    if (method != NULL) {
      GumpOrigScrollViewDidScroll =
          (void (*)(id, SEL, id))method_getImplementation(method);
      method_setImplementation(method, (IMP)GumpHookedScrollViewDidScroll);
    }

    GumpLocalEventMonitor = [NSEvent
        addLocalMonitorForEventsMatchingMask:(NSEventMaskLeftMouseDown | NSEventMaskLeftMouseUp)
                                     handler:^NSEvent *(NSEvent *event) {
                                       if (event.type == NSEventTypeLeftMouseDown) {
                                         NSView *hit =
                                             [event.window.contentView hitTest:event.locationInWindow];
                                         NSScroller *scroller = GumpEnclosingScroller(hit);
                                         NSScrollView *scrollView = scroller.enclosingScrollView;
                                         if (scroller != nil && scrollView != nil &&
                                             scrollView.verticalScroller == scroller) {
                                           GumpScrollerTracking = YES;
                                           GumpTrackedScrollView = scrollView;
                                         }
                                       } else if (event.type == NSEventTypeLeftMouseUp &&
                                                  GumpScrollerTracking) {
                                         NSScrollView *tracked = GumpTrackedScrollView;
                                         GumpScrollerTracking = NO;
                                         GumpTrackedScrollView = nil;
                                         GumpFlushTrackedScroller(tracked);
                                       }
                                       return event;
                                     }];
  });
}

#pragma mark - Bridge module

@implementation GumpScrollView

@synthesize bridge = _bridge;

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

+ (void)initialize
{
  if (self == [GumpScrollView class]) {
    GumpInstallMacosScrollThrottle();
  }
}

- (void)setBridge:(RCTBridge *)bridge
{
  _bridge = bridge;
  GumpSharedBridge = bridge;
  GumpInstallMacosScrollThrottle();
}

#pragma mark - Exported method

RCT_EXPORT_METHOD(scrollToOffset:(nonnull NSNumber *)reactTag
                  offsetY:(double)offsetY
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  __weak GumpScrollView *weakSelf = self;
  // addUIBlock: asserts the UIManager queue. This module is not a view
  // manager, so RCT invokes it on the module queue (or main, if setup
  // requested that). Hop first; RCTExecuteOnUIManagerQueue runs inline
  // when we are already there.
  RCTExecuteOnUIManagerQueue(^{
    GumpScrollView *strongSelf = weakSelf;
    if (strongSelf == nil) {
      resolve(@{@"resolved" : @NO, @"reason" : @"native_view_not_found"});
      return;
    }
    GumpSharedBridge = strongSelf.bridge;
    RCTUIManager *uiManager = strongSelf.bridge.uiManager;
    [uiManager addUIBlock:^(__unused RCTUIManager *manager,
                            NSDictionary<NSNumber *, NSView *> *viewRegistry) {
    NSView *view = viewRegistry[reactTag];
    if (view == nil) {
      // Never reject: a rejection is indistinguishable from a thrown bridge
      // error on the JS side. Always resolve with a reason code.
      resolve(@{@"resolved" : @NO, @"reason" : @"native_view_not_found"});
      return;
    }

    NSString *viewClass = NSStringFromClass([view class]);
    NSScrollView *scrollView = GumpFindScrollView(view);
    if (scrollView == nil) {
      resolve(@{
        @"resolved" : @NO,
        @"reason" : @"scroll_view_not_found",
        @"viewClass" : viewClass,
      });
      return;
    }

    NSClipView *clipView = scrollView.contentView;
    NSView *documentView = scrollView.documentView;

    CGFloat beforeVisibleY = scrollView.documentVisibleRect.origin.y;
    CGFloat beforeClipY = clipView != nil ? clipView.bounds.origin.y : 0;

    GumpMoveClipView(scrollView, offsetY);

    CGFloat afterVisibleY = scrollView.documentVisibleRect.origin.y;
    CGFloat afterClipY = clipView != nil ? clipView.bounds.origin.y : 0;

    id<RCTEventDispatcherProtocol> dispatcher = weakSelf.bridge.eventDispatcher;

    // Emission 1: immediately, same runloop turn.
    GumpEmitScrollEvent(dispatcher, reactTag, scrollView);
    // Emission 2: next runloop turn, after any pending layout pass has run.
    dispatch_async(dispatch_get_main_queue(), ^{
      GumpEmitScrollEvent(dispatcher, reactTag, scrollView);
    });
    // Emission 3: ~4 frames later, after RN's own deferred re-dispatch.
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.064 * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{
      GumpEmitScrollEvent(dispatcher, reactTag, scrollView);
    });

    resolve(@{
      @"resolved" : @YES,
      @"reason" : @"ok",
      @"viewClass" : viewClass,
      @"beforeVisibleY" : @(beforeVisibleY),
      @"afterVisibleY" : @(afterVisibleY),
      @"beforeClipY" : @(beforeClipY),
      @"afterClipY" : @(afterClipY),
      @"documentHeight" : @(documentView != nil ? documentView.frame.size.height : 0),
      @"clipHeight" : @(clipView != nil ? clipView.bounds.size.height : 0),
      @"documentFlipped" : @(documentView != nil ? documentView.isFlipped : NO),
      @"clipFlipped" : @(clipView != nil ? clipView.isFlipped : NO),
      @"moved" : @(fabs(afterVisibleY - beforeVisibleY) > 1.0),
      @"atTarget" : @(fabs(afterVisibleY - offsetY) <= 2.0),
    });
    }];
  });
}

@end

#pragma mark - Native scroll-to-top button (mouseDown, no JS Pressable)

@interface GumpScrollToTopButton : NSButton
@property (nonatomic, copy) RCTDirectEventBlock onNativePress;
@property (nonatomic, weak) RCTBridge *bridge;
@end

@implementation GumpScrollToTopButton

- (instancetype)initWithFrame:(NSRect)frameRect
{
  if (self = [super initWithFrame:frameRect]) {
    self.bordered = NO;
    self.bezelStyle = NSBezelStyleRegularSquare;
    self.buttonType = NSButtonTypeMomentaryChange;
    self.imagePosition = NSImageOnly;
    self.wantsLayer = YES;
    self.layer.backgroundColor = [[NSColor colorWithWhite:0.29 alpha:1] CGColor];
    self.layer.cornerRadius = 8;
    self.layer.masksToBounds = YES;
    self.toolTip = @"Scroll to top";
    self.focusRingType = NSFocusRingTypeNone;
    if (@available(macOS 11.0, *)) {
      NSImage *symbol = [NSImage imageWithSystemSymbolName:@"chevron.up"
                                  accessibilityDescription:@"Scroll to top"];
      NSImageSymbolConfiguration *config =
          [NSImageSymbolConfiguration configurationWithPointSize:16
                                                          weight:NSFontWeightSemibold];
      self.image = [symbol imageWithSymbolConfiguration:config];
      self.contentTintColor = NSColor.whiteColor;
    }
  }
  return self;
}

- (BOOL)isFlipped
{
  return YES;
}

- (BOOL)acceptsFirstMouse:(NSEvent *)event
{
  (void)event;
  return YES;
}

- (BOOL)mouseDownCanMoveWindow
{
  return NO;
}

- (void)reactSetFrame:(CGRect)frame
{
  self.frame = NSRectFromCGRect(frame);
  self.layer.cornerRadius = 8;
}

- (void)mouseDown:(NSEvent *)event
{
  if (self.bridge != nil) {
    GumpSharedBridge = self.bridge;
  }
  NSScrollView *scrollView = GumpLargestVisibleScrollView(self.window);
  if (scrollView != nil) {
    GumpMoveClipView(scrollView, 0);
    GumpEmitScrollEventsForScrollView(scrollView);
  }
  if (self.onNativePress) {
    self.onNativePress(@{@"native" : @YES});
  }
  [super mouseDown:event];
}

- (void)mouseUp:(NSEvent *)event
{
  [super mouseUp:event];
}

@end

@interface GumpScrollToTopButtonManager : RCTViewManager
@end

@implementation GumpScrollToTopButtonManager

RCT_EXPORT_MODULE(GumpScrollToTopButton)

- (NSView *)view
{
  GumpInstallMacosScrollThrottle();
  GumpScrollToTopButton *button = [GumpScrollToTopButton new];
  button.bridge = self.bridge;
  GumpSharedBridge = self.bridge;
  return button;
}

RCT_EXPORT_VIEW_PROPERTY(onNativePress, RCTDirectEventBlock)

@end
