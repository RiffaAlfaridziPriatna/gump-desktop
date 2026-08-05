import {FaceStatusIconBadge} from '@components/culling/FaceStatusIconBadge';
import type {KeyFaceTooltipAnchor} from '@components/culling/FaceStatusTooltip';
import {
  boundingBoxToDisplayRect,
  DisplayRect,
  getContainedImageLayout,
  getFaceZoomImageLayout,
} from '@lib/culling/cullingFaceCrop';
import {
  getEyeStatusMeta,
  getFocusStatusMeta,
} from '@lib/culling/faceStatus';
import {useMeasuredTooltipHover} from '@hooks/useMeasuredTooltipHover';
import {getCachedImageDimensions, ImageDimensions, putCachedImageDimensions} from '@lib/media/imageDimensions';
import {preloadImage} from '@lib/media/imagePreload';
import {colors} from '@lib/ui/colors';
import {APIResponse} from '@services/api';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  type ImageLoadEventData,
  Platform,
  StyleSheet,
  View,
  type NativeSyntheticEvent,
} from 'react-native';

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
  const eyeMeta = getEyeStatusMeta(face.eyeStatus);
  const focusMeta = getFocusStatusMeta(face.focusLevel);

  const buildAnchor = useCallback(
    (x: number, y: number, measuredWidth: number, measuredHeight: number) => ({
      centerX: x + measuredWidth / 2,
      topY: y,
      bottomY: y + measuredHeight,
      // Zoomed badges sit at the bottom edge, so open the tooltip upward.
      placement: mode === 'fixedBottom' ? ('above' as const) : ('below' as const),
      eyeMeta: getEyeStatusMeta(face.eyeStatus),
      focusMeta: getFocusStatusMeta(face.focusLevel),
      backgroundColor: `${colors.textDark}E5`,
    }),
    [face.eyeStatus, face.focusLevel, mode],
  );

  const {targetRef: overlayRef, onHoverIn, onHoverOut} = useMeasuredTooltipHover(
    onTooltipAnchorChange,
    buildAnchor,
  );

  const badges = (
    <View style={styles.faceStatusBadges}>
      <FaceStatusIconBadge
        meta={eyeMeta}
        onHoverIn={onHoverIn}
        onHoverOut={onHoverOut}
        size="large"
      />
      <FaceStatusIconBadge
        meta={focusMeta}
        onHoverIn={onHoverIn}
        onHoverOut={onHoverOut}
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
  const [loadFailed, setLoadFailed] = useState(false);
  const imageReadyNotifiedRef = useRef(false);
  const imageSize = imageSizeProp ?? loadedImageSize;
  const isZoomed = zoomFaceIndex !== null;

  useEffect(() => {
    setImageDecoded(false);
    setLoadFailed(false);
    imageReadyNotifiedRef.current = false;
    setLoadedImageSize(getCachedImageDimensions(uri) ?? null);
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
        const dimensions = getCachedImageDimensions(uri) ?? null;
        setLoadedImageSize(dimensions);
        if (!dimensions) {
          setLoadFailed(true);
          setImageDecoded(true);
          if (!imageReadyNotifiedRef.current) {
            imageReadyNotifiedRef.current = true;
            onImageReady?.();
          }
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [imageSizeProp, onImageReady, uri]);

  useEffect(() => {
    preloadImage(uri).catch(() => undefined);
  }, [uri]);

  const handleImageLoad = useCallback(
    (event: NativeSyntheticEvent<ImageLoadEventData>) => {
      const source = event.nativeEvent?.source;
      const width = source?.width ?? 0;
      const height = source?.height ?? 0;
      if (width > 0 && height > 0 && !imageSizeProp) {
        setLoadedImageSize(current => {
          if (current) {
            return current;
          }
          const dimensions = {width, height};
          if (!getCachedImageDimensions(uri)) {
            putCachedImageDimensions(uri, dimensions);
          }
          return dimensions;
        });
      }

      setLoadFailed(false);
      setImageDecoded(true);
      if (!imageReadyNotifiedRef.current) {
        imageReadyNotifiedRef.current = true;
        onImageReady?.();
      }
    },
    [imageSizeProp, onImageReady, uri],
  );

  const handleImageError = useCallback(() => {
    setLoadFailed(true);
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

  const canRenderOverlays = imageDecoded && !loadFailed && imageLayout !== null;
  const showLoadingOverlay = !imageDecoded && !loadFailed;

  const fallbackImage = (
    <Image
      source={{uri}}
      resizeMode="contain"
      style={StyleSheet.absoluteFill}
      onLoad={handleImageLoad}
      onError={handleImageError}
    />
  );

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
            resizeMode="contain"
            style={{
              position: 'absolute',
              width: imageLayout.width,
              height: imageLayout.height,
              left: imageLayout.left,
              top: imageLayout.top,
            }}
            onLoad={handleImageLoad}
            onError={handleImageError}
          />
        ) : (
          fallbackImage
        )}

        {showLoadingOverlay ? (
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
