import {FaceCropAvatar} from '@components/culling/FaceCropAvatar';
import {FaceStatusIconBadge} from '@components/culling/FaceStatusIconBadge';
import {type KeyFaceTooltipAnchor} from '@components/culling/FaceStatusTooltip';
import {CullingBoundingBox} from '@lib/culling/cullingFaceCrop';
import {
  getEyeStatusMeta,
  getFocusStatusMeta,
} from '@lib/culling/faceStatus';
import {
  isScrollAwareTooltipLocked,
  useScrollAwareTooltipStore,
} from '@lib/ui/scrollAwareTooltip';
import {colors} from '@lib/ui/colors';
import {ImageDimensions} from '@lib/media/imageDimensions';
import {APIResponse} from '@services/api';
import {memo, useCallback, useRef} from 'react';
import {Pressable} from '@components/ui';
import {StyleSheet, View} from 'react-native';

type KeyFaceSidebarItemProps = {
  uri?: string;
  boundingBox?: CullingBoundingBox;
  eyeStatus: APIResponse.CullingEyeStatus;
  focusLevel: APIResponse.CullingFocusLevel;
  width: number;
  imageSize?: ImageDimensions | null;
  selected?: boolean;
  onPress?: () => void;
  onTooltipAnchorChange?: (anchor: KeyFaceTooltipAnchor | null) => void;
};

export const KeyFaceSidebarItem = memo(function KeyFaceSidebarItem({
  uri,
  boundingBox,
  eyeStatus,
  focusLevel,
  width,
  imageSize,
  selected = false,
  onPress,
  onTooltipAnchorChange,
}: KeyFaceSidebarItemProps) {
  const avatarRef = useRef<View>(null);
  const scrollAwareTooltipStore = useScrollAwareTooltipStore();
  const eyeMeta = getEyeStatusMeta(eyeStatus);
  const focusMeta = getFocusStatusMeta(focusLevel);

  const handleHoverIn = useCallback(() => {
    if (isScrollAwareTooltipLocked(scrollAwareTooltipStore)) {
      return;
    }

    avatarRef.current?.measureInWindow(
      (x, y, measuredWidth, measuredHeight) => {
        onTooltipAnchorChange?.({
          centerX: x + measuredWidth / 2,
          bottomY: y + measuredHeight,
          eyeMeta,
          focusMeta,
        });
      },
    );
  }, [eyeMeta, focusMeta, onTooltipAnchorChange, scrollAwareTooltipStore]);

  const handleHoverOut = useCallback(() => {
    if (isScrollAwareTooltipLocked(scrollAwareTooltipStore)) {
      return;
    }

    onTooltipAnchorChange?.(null);
  }, [onTooltipAnchorChange, scrollAwareTooltipStore]);

  return (
    <Pressable
      style={[styles.container, {width, height: width}]}
      onPress={onPress}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}>
      <View style={[styles.root, {width, height: width}]}>
        <View
          ref={avatarRef}
          style={[styles.avatarWrap, {width, height: width}]}>
          {uri && boundingBox ? (
            <FaceCropAvatar
              uri={uri}
              boundingBox={boundingBox}
              size={width}
              imageSize={imageSize}
            />
          ) : (
            <View
              style={[
                styles.placeholder,
                {width, height: width, borderRadius: width / 2},
              ]}
            />
          )}
        </View>

        {selected ? (
          <View
            pointerEvents="none"
            style={[
              styles.selectedRing,
              {width, height: width, borderRadius: width / 2},
            ]}
          />
        ) : null}

        <View style={styles.statusBadges}>
          <FaceStatusIconBadge meta={eyeMeta} />
          <FaceStatusIconBadge meta={focusMeta} />
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    overflow: 'visible',
  },
  root: {
    position: 'relative',
    overflow: 'visible',
  },
  avatarWrap: {
    overflow: 'visible',
  },
  selectedRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  placeholder: {
    backgroundColor: colors.border,
  },
  statusBadges: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    zIndex: 1,
    overflow: 'visible',
  },
});
