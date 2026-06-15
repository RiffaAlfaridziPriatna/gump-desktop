#import <AppKit/AppKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface GumpVisualEffectView : NSVisualEffectView

@property (nonatomic, strong, nullable) NSColor *tintColor;
@property (nonatomic, assign) CGFloat cornerRadius;

@end

NS_ASSUME_NONNULL_END
