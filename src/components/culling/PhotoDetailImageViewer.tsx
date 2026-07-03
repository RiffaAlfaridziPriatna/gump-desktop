import {FaceStatusIconBadge} from '@components/culling/FaceStatusIconBadge';
import type {KeyFaceTooltipAnchor} from '@components/culling/FaceStatusTooltip';
import {
  boundingBoxToDisplayRect,
  DisplayRect,
  getContainedImageLayout,
  getFaceZoomImageLayout,
} from '@lib/cullingFaceCrop';
import {
  getEyeStatusMeta,
  getFocusStatusMeta,
} from '@lib/culling/faceStatus';
import {isScrollAwareTooltipLocked, useScrollAwareTooltipStore} from '@lib/scrollAwareTooltip';
import {getCachedImageDimensions, ImageDimensions} from '@lib/imageDimensions';
import {preloadImage} from '@lib/imagePreload';
import {colors} from '@lib/colors';
import {APIResponse} from '@services/api';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Image, StyleSheet, View} from 'react-native';

type PhotoDetailImageViewerProps = {
  uri: string;
  faces: APIResponse.CullingFace[];
  zoomFaceIndex: number | null;
  imageSize?: ImageDimensions | null;
  onTooltipAnchorChange?: (anchor: KeyFaceTooltipAnchor | null) => void;
  onImageReady?: () => void;
};

type FaceOverlayMode = 'attached' | 'fixedBottom';

type FaceOverlayProps = {
  face: APIResponse.CullingFace;
  displayRect?: DisplayRect;
  mode: FaceOverlayMode;
  onTooltipAnchorChange?: (anchor: KeyFaceTooltipAnchor | null) => void;
};

function FaceStatusOverlay({
  face,
  displayRect,
  mode,
  onTooltipAnchorChange,
}: FaceOverlayProps) {
  const overlayRef = useRef<View>(null);
  const scrollAwareTooltipStore = useScrollAwareTooltipStore();
  const eyeMeta = getEyeStatusMeta(face.eyeStatus);
  const focusMeta = getFocusStatusMeta(face.focusLevel);

  const showTooltip = useCallback(() => {
    if (isScrollAwareTooltipLocked(scrollAwareTooltipStore)) {
      return;
    }

    overlayRef.current?.measureInWindow((x, y, measuredWidth, measuredHeight) => {
      onTooltipAnchorChange?.({
        centerX: x + measuredWidth / 2,
        bottomY: y + measuredHeight,
        eyeMeta,
        focusMeta,
        backgroundColor: `${colors.textDark}E5`,
      });
    });
  }, [eyeMeta, focusMeta, onTooltipAnchorChange, scrollAwareTooltipStore]);

  const hideTooltip = useCallback(() => {
    if (isScrollAwareTooltipLocked(scrollAwareTooltipStore)) {
      return;
    }

    onTooltipAnchorChange?.(null);
  }, [onTooltipAnchorChange, scrollAwareTooltipStore]);

  const tooltipEnabled = mode === 'attached';

  const badges = (
    <View style={styles.faceStatusBadges}>
      <FaceStatusIconBadge
        meta={eyeMeta}
        onHoverIn={tooltipEnabled ? showTooltip : undefined}
        onHoverOut={tooltipEnabled ? hideTooltip : undefined}
        size="large"
      />
      <FaceStatusIconBadge
        meta={focusMeta}
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
  imageSize: imageSizeProp,
  onTooltipAnchorChange,
  onImageReady,
}: PhotoDetailImageViewerProps) {
  const [containerSize, setContainerSize] = useState({width: 0, height: 0});
  const [loadedImageSize, setLoadedImageSize] = useState<ImageDimensions | null>(
    () => getCachedImageDimensions(uri) ?? null,
  );
  const [imageDecoded, setImageDecoded] = useState(false);
  const imageReadyNotifiedRef = useRef(false);
  const imageSize = imageSizeProp ?? loadedImageSize;
  const isZoomed = zoomFaceIndex !== null;

  useEffect(() => {
    setImageDecoded(false);
    imageReadyNotifiedRef.current = false;
  }, [uri]);

  useEffect(() => {
    if (zoomFaceIndex !== null) {
      onTooltipAnchorChange?.(null);
    }
  }, [zoomFaceIndex, onTooltipAnchorChange]);

  useEffect(() => {
    if (imageSizeProp) {
      return;
    }

    const cached = getCachedImageDimensions(uri);
    if (cached) {
      setLoadedImageSize(cached);
      return;
    }

    let cancelled = false;

    preloadImage(uri).then(() => {
      if (!cancelled) {
        setLoadedImageSize(getCachedImageDimensions(uri) ?? null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [imageSizeProp, uri]);

  useEffect(() => {
    preloadImage(uri).catch(() => undefined);
  }, [uri]);

  const handleImageLoad = useCallback(() => {
    setImageDecoded(true);
    if (!imageReadyNotifiedRef.current) {
      imageReadyNotifiedRef.current = true;
      onImageReady?.();
    }
  }, [onImageReady]);

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

    return getContainedImageLayout(
      containerSize.width,
      containerSize.height,
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

  const canRenderOverlays = imageDecoded && imageLayout !== null;

  return (
    <View
      style={styles.container}
      onLayout={event => {
        const {width, height} = event.nativeEvent.layout;
        setContainerSize({width, height});
      }}
    >
      <View style={styles.imageFrame}>
        {imageLayout ? (
          <Image
            source={{uri}}
            style={{
              position: 'absolute',
              width: imageLayout.width,
              height: imageLayout.height,
              left: imageLayout.left,
              top: imageLayout.top,
            }}
            onLoad={handleImageLoad}
          />
        ) : null}

        {!imageDecoded || !imageLayout ? (
          <View pointerEvents="none" style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : null}
      </View>

      {canRenderOverlays ? (
        <View
          pointerEvents="box-none"
          style={[
            styles.overlayLayer,
            {
              width: containerSize.width,
              height: containerSize.height,
            },
          ]}
        >
          {isZoomed && visibleFaces[0] ? (
            <FaceStatusOverlay
              key={`zoom-${visibleFaces[0].index}`}
              face={visibleFaces[0].face}
              mode="fixedBottom"
              onTooltipAnchorChange={onTooltipAnchorChange}
            />
          ) : (
            faceDisplayRects.map(({face, index, displayRect}) => (
              <FaceStatusOverlay
                key={index}
                face={face}
                displayRect={displayRect}
                mode="attached"
                onTooltipAnchorChange={onTooltipAnchorChange}
              />
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    position: 'relative',
  },
  imageFrame: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.cardBackgroundSecondary,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardBackgroundSecondary,
  },
  overlayLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
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
