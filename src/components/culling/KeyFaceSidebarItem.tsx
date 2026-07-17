import {FaceCropAvatar} from '@components/culling/FaceCropAvatar';
import {FaceStatusIconBadge} from '@components/culling/FaceStatusIconBadge';
import {type KeyFaceTooltipAnchor} from '@components/culling/FaceStatusTooltip';
import {CullingBoundingBox} from '@lib/culling/cullingFaceCrop';
import {
  getEyeStatusMeta,
  getFocusStatusMeta,
} from '@lib/culling/faceStatus';
import {useMeasuredTooltipHover} from '@hooks/useMeasuredTooltipHover';
import {colors} from '@lib/ui/colors';
import {ImageDimensions} from '@lib/media/imageDimensions';
import {APIResponse} from '@services/api';
import {memo, useCallback} from 'react';
import {Pressable} from '@components/ui';
import {StyleSheet, View} from 'react-native';

type KeyFaceSidebarItemProps = {
  cropUri?: string;
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

export const KeyFaceSidebarItem = memo(
  function KeyFaceSidebarItem({
    cropUri,
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
  const eyeMeta = getEyeStatusMeta(eyeStatus);
  const focusMeta = getFocusStatusMeta(focusLevel);
  const hasCrop = Boolean(cropUri);
  const hasTransformCrop = Boolean(uri && boundingBox);

  const buildAnchor = useCallback(
    (x: number, y: number, measuredWidth: number, measuredHeight: number) => ({
      centerX: x + measuredWidth / 2,
      bottomY: y + measuredHeight,
      eyeMeta: getEyeStatusMeta(eyeStatus),
      focusMeta: getFocusStatusMeta(focusLevel),
    }),
    [eyeStatus, focusLevel],
  );

  const {targetRef: avatarRef, onHoverIn, onHoverOut} = useMeasuredTooltipHover(
    onTooltipAnchorChange,
    buildAnchor,
  );

  return (
    <Pressable
      style={[styles.container, {width, height: width}]}
      onPress={onPress}
      onHoverIn={onHoverIn}
      onHoverOut={onHoverOut}>
      <View style={[styles.root, {width, height: width}]}>
        <View
          ref={avatarRef}
          style={[styles.avatarWrap, {width, height: width}]}>
          {hasCrop ? (
            <FaceCropAvatar cropUri={cropUri} size={width} />
          ) : hasTransformCrop ? (
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
  },
  (prev, next) =>
    prev.cropUri === next.cropUri &&
    prev.uri === next.uri &&
    prev.boundingBox === next.boundingBox &&
    prev.eyeStatus === next.eyeStatus &&
    prev.focusLevel === next.focusLevel &&
    prev.width === next.width &&
    prev.selected === next.selected &&
    prev.imageSize === next.imageSize,
);

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    overflow: 'hidden',
  },
  root: {
    position: 'relative',
    overflow: 'hidden',
  },
  avatarWrap: {
    overflow: 'hidden',
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
