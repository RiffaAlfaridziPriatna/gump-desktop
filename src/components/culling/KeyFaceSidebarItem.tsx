import { FaceCropAvatar } from '@components/culling/FaceCropAvatar';
import { FrostedView, type FrostedBackdrop } from '@components/ui/frosted';
import { CullingBoundingBox } from '@lib/cullingFaceCrop';
import {
  FaceStatusMeta,
  getEyeStatusMeta,
  getFocusStatusMeta,
} from '@lib/culling/faceStatus';
import { colors } from '@lib/colors';
import { fonts } from '@lib/typography';
import { APIResponse } from '@services/api';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type KeyFaceSidebarItemProps = {
  uri?: string;
  boundingBox?: CullingBoundingBox;
  eyeStatus: APIResponse.CullingEyeStatus;
  focusLevel: APIResponse.CullingFocusLevel;
  width: number;
  onTooltipAnchorChange?: (anchor: KeyFaceTooltipAnchor | null) => void;
};

function StatusBadge({
  meta,
  backdrop,
}: {
  meta: FaceStatusMeta;
  backdrop?: FrostedBackdrop;
}) {
  const { Icon } = meta;

  return (
    <FrostedView
      style={styles.statusBadge}
      fallbackColor={'#131415BF'}
      backdrop={backdrop}
      blurAmount={2}
    >
      <View style={styles.statusBadgeContent}>
        <Icon width={10} height={10} />
      </View>
    </FrostedView>
  );
}

function StatusTooltipRow({ meta }: { meta: FaceStatusMeta }) {
  const { Icon, label } = meta;

  return (
    <View style={styles.tooltipRow}>
      <Icon width={10} height={10} />
      <Text style={styles.tooltipLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function FaceStatusTooltip({
  eyeMeta,
  focusMeta,
  backgroundColor = colors.divider + 'E5',
}: {
  eyeMeta: FaceStatusMeta;
  focusMeta: FaceStatusMeta;
  backgroundColor?: string;
}) {
  return (
    <View style={styles.tooltipWrap}>
      <View
        style={[styles.tooltipPointer, {borderBottomColor: backgroundColor}]}
      />
      <View style={[styles.tooltip, {backgroundColor}]}>
        <StatusTooltipRow meta={eyeMeta} />
        <StatusTooltipRow meta={focusMeta} />
      </View>
    </View>
  );
}

export type KeyFaceTooltipAnchor = {
  centerX: number;
  bottomY: number;
  eyeMeta: FaceStatusMeta;
  focusMeta: FaceStatusMeta;
  backgroundColor?: string;
};

export function KeyFaceSidebarItem({
  uri,
  boundingBox,
  eyeStatus,
  focusLevel,
  width,
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
      style={[styles.container, { width }]}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
    >
      <View
        ref={avatarRef}
        style={[styles.avatarWrap, { width, height: width }]}
        onLayout={syncAvatarBackdrop}
      >
        {uri && boundingBox ? (
          <FaceCropAvatar uri={uri} boundingBox={boundingBox} size={width} />
        ) : (
          <View
            style={[
              styles.placeholder,
              { width, height: width, borderRadius: width / 2 },
            ]}
          />
        )}

        <View style={styles.statusBadges}>
          <StatusBadge meta={eyeMeta} backdrop={avatarBackdrop} />
          <StatusBadge meta={focusMeta} backdrop={avatarBackdrop} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  avatarWrap: {
    position: 'relative',
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
  },
  statusBadge: {
    width: 16,
    height: 16,
    borderRadius: 16 / 2,
  },
  statusBadgeContent: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tooltipWrap: {
    alignItems: 'center',
  },
  tooltip: {
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 4,
  },
  tooltipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  tooltipLabel: {
    fontFamily: fonts.sans,
    fontSize: 10,
    lineHeight: 14,
    flexShrink: 0,
  },
  tooltipPointer: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginBottom: -1,
  },
});
