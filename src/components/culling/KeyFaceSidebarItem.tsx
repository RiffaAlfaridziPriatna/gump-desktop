import { FaceCropAvatar } from '@components/culling/FaceCropAvatar';
import { FaceStatusIconBadge } from '@components/culling/FaceStatusIconBadge';
import { type KeyFaceTooltipAnchor } from '@components/culling/FaceStatusTooltip';
import { type FrostedBackdrop } from '@components/ui/frosted';
import { CullingBoundingBox } from '@lib/cullingFaceCrop';
import {
  getEyeStatusMeta,
  getFocusStatusMeta,
} from '@lib/culling/faceStatus';
import { colors } from '@lib/colors';
import { APIResponse } from '@services/api';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

type KeyFaceSidebarItemProps = {
  uri?: string;
  boundingBox?: CullingBoundingBox;
  eyeStatus: APIResponse.CullingEyeStatus;
  focusLevel: APIResponse.CullingFocusLevel;
  width: number;
  selected?: boolean;
  onPress?: () => void;
  onTooltipAnchorChange?: (anchor: KeyFaceTooltipAnchor | null) => void;
};

export function KeyFaceSidebarItem({
  uri,
  boundingBox,
  eyeStatus,
  focusLevel,
  width,
  selected = false,
  onPress,
  onTooltipAnchorChange,
}: KeyFaceSidebarItemProps) {
  const [avatarBackdrop, setAvatarBackdrop] = useState<
    FrostedBackdrop | undefined
  >();
  const avatarRef = useRef<View>(null);
  const eyeMeta = getEyeStatusMeta(eyeStatus);
  const focusMeta = getFocusStatusMeta(focusLevel);

  const syncAvatarBackdrop = useCallback(() => {
    if (!uri) {
      setAvatarBackdrop(undefined);
      return;
    }

    avatarRef.current?.measureInWindow(
      (x, y, measuredWidth, measuredHeight) => {
        setAvatarBackdrop({
          uri,
          coverWidth: measuredWidth,
          coverHeight: measuredHeight,
          coverX: x,
          coverY: y,
        });
      },
    );
  }, [uri]);

  const handleHoverIn = useCallback(() => {
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
  }, [eyeMeta, focusMeta, onTooltipAnchorChange]);

  const handleHoverOut = useCallback(() => {
    onTooltipAnchorChange?.(null);
  }, [onTooltipAnchorChange]);

  return (
    <Pressable
      style={[
        styles.container,
        {width, height: width},
        onPress ? styles.pressable : null,
      ]}
      onPress={onPress}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
    >
      <View style={[styles.root, {width, height: width}]}>
        <View
          ref={avatarRef}
          style={[styles.avatarWrap, {width, height: width}]}
          onLayout={syncAvatarBackdrop}
        >
          {uri && boundingBox ? (
            <FaceCropAvatar uri={uri} boundingBox={boundingBox} size={width} />
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
          <FaceStatusIconBadge meta={eyeMeta} backdrop={avatarBackdrop} />
          <FaceStatusIconBadge meta={focusMeta} backdrop={avatarBackdrop} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    overflow: 'visible',
  },
  pressable: {
    cursor: 'pointer',
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
