import {FaceStatusIconBadge} from '@components/culling/FaceStatusIconBadge';
import type {KeyFaceTooltipAnchor} from '@components/culling/FaceStatusTooltip';
import {FrostedBackdrop} from '@components/ui/frosted';
import {
  boundingBoxToDisplayRect,
  DisplayRect,
  getFaceZoomImageLayout,
  getTopAlignedFullWidthImageLayout,
} from '@lib/cullingFaceCrop';
import {
  getEyeStatusMeta,
  getFocusStatusMeta,
} from '@lib/culling/faceStatus';
import {loadImageDimensions} from '@lib/imageDimensions';
import {colors} from '@lib/colors';
import {APIResponse} from '@services/api';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Image, StyleSheet, View} from 'react-native';

type PhotoDetailImageViewerProps = {
  uri: string;
  faces: APIResponse.CullingFace[];
  zoomFaceIndex: number | null;
  onTooltipAnchorChange?: (anchor: KeyFaceTooltipAnchor | null) => void;
};

type FaceOverlayMode = 'attached' | 'fixedBottom';

type FaceOverlayProps = {
  face: APIResponse.CullingFace;
  displayRect?: DisplayRect;
  mode: FaceOverlayMode;
  imageBackdrop?: FrostedBackdrop;
  onTooltipAnchorChange?: (anchor: KeyFaceTooltipAnchor | null) => void;
};

function FaceStatusOverlay({
  face,
  displayRect,
  mode,
  imageBackdrop,
  onTooltipAnchorChange,
}: FaceOverlayProps) {
  const overlayRef = useRef<View>(null);
  const eyeMeta = getEyeStatusMeta(face.eyeStatus);
  const focusMeta = getFocusStatusMeta(face.focusLevel);

  const showTooltip = useCallback(() => {
    overlayRef.current?.measureInWindow((x, y, measuredWidth, measuredHeight) => {
      onTooltipAnchorChange?.({
        centerX: x + measuredWidth / 2,
        bottomY: y + measuredHeight,
        eyeMeta,
        focusMeta,
        backgroundColor: `${colors.textDark}E5`,
      });
    });
  }, [eyeMeta, focusMeta, onTooltipAnchorChange]);

  const hideTooltip = useCallback(() => {
    onTooltipAnchorChange?.(null);
  }, [onTooltipAnchorChange]);

  const tooltipEnabled = mode === 'attached';

  const badges = (
    <View style={styles.faceStatusBadges}>
      <FaceStatusIconBadge
        meta={eyeMeta}
        backdrop={imageBackdrop}
        onHoverIn={tooltipEnabled ? showTooltip : undefined}
        onHoverOut={tooltipEnabled ? hideTooltip : undefined}
        size="large"
      />
      <FaceStatusIconBadge
        meta={focusMeta}
        backdrop={imageBackdrop}
        onHoverIn={tooltipEnabled ? showTooltip : undefined}
        onHoverOut={tooltipEnabled ? hideTooltip : undefined}
        size="large"
      />
    </View>
  );

  if (mode === 'fixedBottom') {
    return (
      <View
        ref={overlayRef}
        pointerEvents="box-none"
        style={styles.faceOverlayFixedBottom}
      >
        {badges}
      </View>
    );
  }

  if (!displayRect) {
    return null;
  }

  return (
    <View
      ref={overlayRef}
      pointerEvents="box-none"
      style={[
        styles.faceOverlayAttached,
        {
          left: displayRect.left,
          top: displayRect.top + displayRect.height,
          width: displayRect.width,
        },
      ]}
    >
      {badges}
    </View>
  );
}

export function PhotoDetailImageViewer({
  uri,
  faces,
  zoomFaceIndex,
  onTooltipAnchorChange,
}: PhotoDetailImageViewerProps) {
  const [containerSize, setContainerSize] = useState({width: 0, height: 0});
  const [imageSize, setImageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [imageBackdrop, setImageBackdrop] = useState<
    FrostedBackdrop | undefined
  >();
  const imageWrapRef = useRef<View>(null);

  useEffect(() => {
    if (zoomFaceIndex !== null) {
      onTooltipAnchorChange?.(null);
    }
  }, [zoomFaceIndex, onTooltipAnchorChange]);

  useEffect(() => {
    let cancelled = false;
    setImageSize(null);

    loadImageDimensions(uri).then(dimensions => {
      if (!cancelled && dimensions) {
        setImageSize(dimensions);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [uri]);

  const syncImageBackdrop = useCallback(() => {
    imageWrapRef.current?.measureInWindow((x, y, measuredWidth, measuredHeight) => {
      setImageBackdrop({
        uri,
        coverWidth: measuredWidth,
        coverHeight: measuredHeight,
        coverX: x,
        coverY: y,
      });
    });
  }, [uri]);

  const imageLayout = useMemo(() => {
    if (!imageSize || containerSize.width <= 0 || containerSize.height <= 0) {
      return null;
    }

    const zoomFace =
      zoomFaceIndex !== null ? faces[zoomFaceIndex] : undefined;

    if (zoomFace) {
      return getFaceZoomImageLayout(
        containerSize.width,
        containerSize.height,
        imageSize.width,
        imageSize.height,
        zoomFace.boundingBox,
      );
    }

    return getTopAlignedFullWidthImageLayout(
      containerSize.width,
      imageSize.width,
      imageSize.height,
    );
  }, [containerSize, faces, imageSize, zoomFaceIndex]);

  const visibleFaces = useMemo(() => {
    if (zoomFaceIndex === null) {
      return faces.map((face, index) => ({face, index}));
    }

    const face = faces[zoomFaceIndex];
    return face ? [{face, index: zoomFaceIndex}] : [];
  }, [faces, zoomFaceIndex]);

  const isZoomed = zoomFaceIndex !== null;

  const faceDisplayRects = useMemo(() => {
    if (!imageLayout) {
      return [];
    }

    return visibleFaces.map(({face, index}) => ({
      index,
      face,
      displayRect: boundingBoxToDisplayRect(face.boundingBox, imageLayout),
    }));
  }, [imageLayout, visibleFaces]);

  return (
    <View
      style={styles.container}
      onLayout={event => {
        const {width, height} = event.nativeEvent.layout;
        setContainerSize({width, height});
      }}
    >
      {imageLayout && imageSize ? (
        <View
          style={[
            styles.stage,
            {
              width: containerSize.width,
              height: containerSize.height,
            },
          ]}
        >
          <View
            ref={imageWrapRef}
            style={[
              styles.imageWrap,
              {
                width: containerSize.width,
                height: containerSize.height,
              },
            ]}
            onLayout={syncImageBackdrop}
          >
            <Image
              source={{uri}}
              style={{
                position: 'absolute',
                width: imageLayout.width,
                height: imageLayout.height,
                left: imageLayout.left,
                top: imageLayout.top,
              }}
              resizeMode="cover"
            />
          </View>

          <View pointerEvents="box-none" style={styles.overlayLayer}>
            {isZoomed && visibleFaces[0] ? (
              <FaceStatusOverlay
                key={`zoom-${visibleFaces[0].face.rekognitionFaceId ?? visibleFaces[0].index}`}
                face={visibleFaces[0].face}
                mode="fixedBottom"
                imageBackdrop={imageBackdrop}
                onTooltipAnchorChange={onTooltipAnchorChange}
              />
            ) : (
              faceDisplayRects.map(({face, index, displayRect}) => (
                <FaceStatusOverlay
                  key={`${face.rekognitionFaceId ?? index}`}
                  face={face}
                  displayRect={displayRect}
                  mode="attached"
                  imageBackdrop={imageBackdrop}
                  onTooltipAnchorChange={onTooltipAnchorChange}
                />
              ))
            )}
          </View>
        </View>
      ) : (
        <View style={styles.loadingPlaceholder} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'flex-start',
  },
  stage: {
    position: 'relative',
  },
  imageWrap: {
    position: 'relative',
    overflow: 'hidden',
  },
  overlayLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  loadingPlaceholder: {
    flex: 1,
    backgroundColor: colors.cardBackgroundSecondary,
  },
  faceOverlayAttached: {
    position: 'absolute',
    alignItems: 'center',
    marginTop: 4,
  },
  faceOverlayFixedBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 24,
    alignItems: 'center',
  },
  faceStatusBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
});
