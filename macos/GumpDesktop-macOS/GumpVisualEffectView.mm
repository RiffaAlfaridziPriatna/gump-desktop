#import "GumpVisualEffectView.h"

#import <AppKit/AppKit.h>

#import <React/RCTConvert.h>
#import <React/RCTViewManager.h>
#import <React/UIView+React.h>

static NSVisualEffectMaterial GumpMaterialFromString(NSString *value)
{
  if ([value isEqualToString:@"hudWindow"]) {
    return NSVisualEffectMaterialHUDWindow;
  }
  if ([value isEqualToString:@"menu"]) {
    return NSVisualEffectMaterialMenu;
  }
  if ([value isEqualToString:@"popover"]) {
    return NSVisualEffectMaterialPopover;
  }
  if ([value isEqualToString:@"sidebar"]) {
    return NSVisualEffectMaterialSidebar;
  }
  if ([value isEqualToString:@"titlebar"]) {
    return NSVisualEffectMaterialTitlebar;
  }
  if ([value isEqualToString:@"headerView"]) {
    return NSVisualEffectMaterialHeaderView;
  }
  if ([value isEqualToString:@"sheet"]) {
    return NSVisualEffectMaterialSheet;
  }
  if ([value isEqualToString:@"windowBackground"]) {
    return NSVisualEffectMaterialWindowBackground;
  }
  if ([value isEqualToString:@"contentBackground"]) {
    return NSVisualEffectMaterialContentBackground;
  }
  if ([value isEqualToString:@"underWindowBackground"]) {
    return NSVisualEffectMaterialUnderWindowBackground;
  }
  if ([value isEqualToString:@"underPageBackground"]) {
    return NSVisualEffectMaterialUnderPageBackground;
  }

  return NSVisualEffectMaterialHUDWindow;
}

static NSVisualEffectBlendingMode GumpBlendingModeFromString(NSString *value)
{
  if ([value isEqualToString:@"behindWindow"]) {
    return NSVisualEffectBlendingModeBehindWindow;
  }

  return NSVisualEffectBlendingModeWithinWindow;
}

static NSImage *GumpMaskImageWithCornerRadius(CGFloat cornerRadius, NSSize size)
{
  if (size.width <= 0 || size.height <= 0) {
    return nil;
  }

  CGFloat radius = MIN(cornerRadius, MIN(size.width, size.height) / 2.0);
  if (radius <= 0) {
    return nil;
  }

  NSImage *image = [[NSImage alloc] initWithSize:size];
  [image lockFocus];
  [[NSColor whiteColor] setFill];
  NSBezierPath *path = [NSBezierPath bezierPathWithRoundedRect:NSMakeRect(0, 0, size.width, size.height)
                                                       xRadius:radius
                                                       yRadius:radius];
  [path fill];
  [image unlockFocus];

  return image;
}

@implementation GumpVisualEffectView {
  NSView *_tintOverlay;
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    self.material = NSVisualEffectMaterialHUDWindow;
    self.blendingMode = NSVisualEffectBlendingModeWithinWindow;
    self.state = NSVisualEffectStateActive;

    _tintOverlay = [[NSView alloc] initWithFrame:NSZeroRect];
    _tintOverlay.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    _tintOverlay.wantsLayer = YES;
    [self addSubview:_tintOverlay];
  }

  return self;
}

- (BOOL)isFlipped
{
  return YES;
}

- (BOOL)isOpaque
{
  return NO;
}

- (void)viewDidMoveToWindow
{
  [super viewDidMoveToWindow];
  self.state = NSVisualEffectStateActive;
}

- (void)reactSetFrame:(CGRect)frame
{
  [super reactSetFrame:frame];
  _tintOverlay.frame = self.bounds;
  [self updateMaskImage];
}

- (void)updateTintOverlay
{
  if (self.tintColor == nil) {
    _tintOverlay.hidden = YES;
    return;
  }

  _tintOverlay.hidden = NO;
  _tintOverlay.layer.backgroundColor = self.tintColor.CGColor;
}

- (void)updateMaskImage
{
  if (self.cornerRadius <= 0) {
    self.maskImage = nil;
    return;
  }

  self.maskImage = GumpMaskImageWithCornerRadius(self.cornerRadius, self.bounds.size);
}

- (void)setTintColor:(NSColor *)tintColor
{
  _tintColor = tintColor;
  [self updateTintOverlay];
}

- (void)setCornerRadius:(CGFloat)cornerRadius
{
  _cornerRadius = cornerRadius;
  [self updateMaskImage];
}

- (NSView *)hitTest:(NSPoint)point
{
  NSView *hitView = [super hitTest:point];
  if (hitView != self) {
    return hitView;
  }

  for (NSView *subview in [self.subviews reverseObjectEnumerator]) {
    if (subview.isHidden || subview.alphaValue <= 0.01) {
      continue;
    }

    NSPoint convertedPoint = [self convertPoint:point toView:subview];
    if (![subview mouse:convertedPoint inRect:subview.bounds]) {
      continue;
    }

    NSView *subHit = [subview hitTest:convertedPoint];
    if (subHit != nil) {
      return subHit;
    }
  }

  return nil;
}

- (void)insertReactSubview:(NSView *)subview atIndex:(NSInteger)index
{
  [super insertReactSubview:subview atIndex:index];
  [subview removeFromSuperview];

  NSView *relativeView = index > 0 ? self.reactSubviews[index - 1] : _tintOverlay;
  [self addSubview:subview positioned:NSWindowAbove relativeTo:relativeView];
}

- (void)removeReactSubview:(NSView *)subview
{
  [super removeReactSubview:subview];
  [subview removeFromSuperview];
}

- (void)didUpdateReactSubviews
{
  for (NSView *subview in self.reactSubviews) {
    if (subview.superview != self) {
      [subview removeFromSuperview];
      [self addSubview:subview];
    }
  }

  for (NSInteger index = 0; index < (NSInteger)self.reactSubviews.count; index++) {
    NSView *subview = self.reactSubviews[index];
    NSView *relativeView = index > 0 ? self.reactSubviews[index - 1] : _tintOverlay;
    [self addSubview:subview positioned:NSWindowAbove relativeTo:relativeView];
  }
}

@end

@interface GumpVisualEffectViewManager : RCTViewManager
@end

@implementation GumpVisualEffectViewManager

RCT_EXPORT_MODULE(GumpVisualEffectView)

- (NSView *)view
{
  return [GumpVisualEffectView new];
}

RCT_CUSTOM_VIEW_PROPERTY(material, NSString, GumpVisualEffectView)
{
  NSString *value = json ? [RCTConvert NSString:json] : @"hudWindow";
  view.material = GumpMaterialFromString(value);
}

RCT_CUSTOM_VIEW_PROPERTY(blendingMode, NSString, GumpVisualEffectView)
{
  NSString *value = json ? [RCTConvert NSString:json] : @"withinWindow";
  view.blendingMode = GumpBlendingModeFromString(value);
}

RCT_CUSTOM_VIEW_PROPERTY(tintColor, NSColor, GumpVisualEffectView)
{
  view.tintColor = json ? [RCTConvert NSColor:json] : nil;
}

RCT_CUSTOM_VIEW_PROPERTY(cornerRadius, CGFloat, GumpVisualEffectView)
{
  view.cornerRadius = json != nil ? [RCTConvert CGFloat:json] : 0;
}

@end
