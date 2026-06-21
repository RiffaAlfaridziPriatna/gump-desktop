import {FrostedView, type FrostedBackdrop} from '@components/ui/frosted';
import {FaceStatusMeta} from '@lib/culling/faceStatus';
import {Pressable, StyleSheet, View} from 'react-native';

export type FaceStatusIconBadgeSize = 'small' | 'large';

const BADGE_SIZES: Record<
  FaceStatusIconBadgeSize,
  {badge: number; icon: number}
> = {
  small: {badge: 16, icon: 10},
  large: {badge: 28, icon: 16},
};

type FaceStatusIconBadgeProps = {
  meta: FaceStatusMeta;
  backdrop?: FrostedBackdrop;
  size?: FaceStatusIconBadgeSize;
  onHoverIn?: () => void;
  onHoverOut?: () => void;
};

export function FaceStatusIconBadge({
  meta,
  backdrop,
  size = 'small',
  onHoverIn,
  onHoverOut,
}: FaceStatusIconBadgeProps) {
  const {Icon} = meta;
  const {badge: badgeSize, icon: iconSize} = BADGE_SIZES[size];

  const badge = (
    <FrostedView
      style={{
        width: badgeSize,
        height: badgeSize,
        borderRadius: badgeSize / 2,
      }}
      fallbackColor={'#131415BF'}
      backdrop={backdrop}
      blurAmount={2}
    >
      <View
        style={[
          styles.badgeContent,
          {width: badgeSize, height: badgeSize},
        ]}
      >
        <Icon width={iconSize} height={iconSize} />
      </View>
    </FrostedView>
  );

  if (!onHoverIn && !onHoverOut) {
    return badge;
  }

  return (
    <Pressable onHoverIn={onHoverIn} onHoverOut={onHoverOut}>
      {badge}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badgeContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
