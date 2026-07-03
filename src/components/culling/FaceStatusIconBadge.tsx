import {FaceStatusMeta} from '@lib/culling/faceStatus';
import {Pressable} from '@components/ui';
import {StyleSheet, View} from 'react-native';

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
  size?: FaceStatusIconBadgeSize;
  onHoverIn?: () => void;
  onHoverOut?: () => void;
};

export function FaceStatusIconBadge({
  meta,
  size = 'small',
  onHoverIn,
  onHoverOut,
}: FaceStatusIconBadgeProps) {
  const {Icon} = meta;
  const {badge: badgeSize, icon: iconSize} = BADGE_SIZES[size];

  const badge = (
    <View
      style={[
        styles.badge,
        {
          width: badgeSize,
          height: badgeSize,
          borderRadius: badgeSize / 2,
        },
      ]}>
      <View
        style={[
          styles.badgeContent,
          {width: badgeSize, height: badgeSize},
        ]}>
        <Icon width={iconSize} height={iconSize} />
      </View>
    </View>
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
  badge: {
    backgroundColor: 'rgba(19, 20, 21, 0.75)',
  },
  badgeContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
