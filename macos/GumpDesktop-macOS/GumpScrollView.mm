#import "GumpScrollView.h"

#import <AppKit/AppKit.h>
#import <React/RCTBridge.h>
#import <React/RCTEventDispatcherProtocol.h>
#import <React/RCTScrollEvent.h>
#import <React/RCTScrollView.h>
#import <React/RCTUIManager.h>
#import <React/RCTUIManagerUtils.h>

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

@implementation GumpScrollView

@synthesize bridge = _bridge;

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

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

#pragma mark - Synthetic scroll event

// Bypasses AppKit's bounds-change notification path entirely, so RCTScrollView's
// _disableScrollEvents gate cannot swallow it. Metrics mirror exactly what
// RCTScrollView.sendScrollEventWithName: would have sent.
static void GumpEmitScrollEvent(id<RCTEventDispatcherProtocol> dispatcher,
                                NSNumber *reactTag,
                                NSScrollView *scrollView)
{
  if (dispatcher == nil || scrollView == nil) {
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
