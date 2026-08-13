import { LookPreviewImage } from '@components/look/LookPreviewImage';
import { getContainedImageLayout } from '@lib/culling/cullingFaceCrop';
import type { LookId } from '@lib/look/types';
import {
  getCachedImageDimensions,
  loadImageDimensions,
  putCachedImageDimensions,
  type ImageDimensions,
} from '@lib/media/imageDimensions';
import { colors } from '@lib/ui/colors';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  StyleSheet,
  View,
  type ImageLoadEventData,
  type NativeSyntheticEvent,
} from 'react-native';

type ContainedLookImageProps = {
  uri: string;
  width: number;
  height: number;
  lookId?: LookId | null;
  lookIntensity?: number | null;
  isTransparent?: boolean;
  borderRadius?: number;
};

/**
 * Fixed frame + contain-fit image (same approach as CulledAlbumPhotoThumbnail).
 * Look overlays wrap only the photo bounds — letterbox bars stay unfiltered.
 */
export const ContainedLookImage = memo(function ContainedLookImage({
  uri,
  width,
  height,
  lookId,
  lookIntensity,
  isTransparent = true,
  borderRadius = 8,
}: ContainedLookImageProps) {
  const [imageSize, setImageSize] = useState<ImageDimensions | null>(
    () => (uri ? getCachedImageDimensions(uri) ?? null : null),
  );
  const [isLoaded, setIsLoaded] = useState(() =>
    Boolean(uri && getCachedImageDimensions(uri)),
  );
  const displayedUriRef = useRef(uri);

  useEffect(() => {
    if (displayedUriRef.current === uri) {
      return;
    }
    displayedUriRef.current = uri;
    const cached = uri ? getCachedImageDimensions(uri) ?? null : null;
    setImageSize(cached);
    setIsLoaded(Boolean(cached));
  }, [uri]);

  useEffect(() => {
    if (!uri) {
      return;
    }
    const cached = getCachedImageDimensions(uri);
    if (cached) {
      setImageSize(cached);
      return;
    }

    let cancelled = false;
    loadImageDimensions(uri).then(dimensions => {
      if (!cancelled && dimensions) {
        setImageSize(dimensions);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  const imageLayout = useMemo(() => {
    if (!imageSize) {
      return null;
    }
    return getContainedImageLayout(
      width,
      height,
      imageSize.width,
      imageSize.height,
    );
  }, [height, imageSize, width]);

  const handleLoad = useCallback(
    (event: NativeSyntheticEvent<ImageLoadEventData>) => {
      setIsLoaded(true);
      const {width: loadedWidth, height: loadedHeight} = event.nativeEvent.source;
      if (loadedWidth <= 0 || loadedHeight <= 0) {
        return;
      }
      setImageSize(current => {
        if (current) {
          return current;
        }
        const dimensions = {width: loadedWidth, height: loadedHeight};
        putCachedImageDimensions(uri, dimensions);
        return dimensions;
      });
    },
    [uri],
  );

  const handleError = useCallback(() => {
    setIsLoaded(true);
  }, []);

  if (width <= 0 || height <= 0) {
    return null;
  }

  return (
    <View
      style={[
        styles.frame,
        {width, height, borderRadius},
        !isTransparent && styles.frameNotTransparent,
      ]}>
      {uri ? (
        imageLayout ? (
          <LookPreviewImage
            uri={uri}
            lookId={lookId}
            lookIntensity={lookIntensity}
            onLoad={handleLoad}
            onError={handleError}
            style={[
              styles.photoBounds,
              {
                width: imageLayout.width,
                height: imageLayout.height,
                left: imageLayout.left,
                top: imageLayout.top,
                opacity: isLoaded ? 1 : 0,
              },
            ]}
          />
        ) : (
          <Image
            source={{uri}}
            onLoad={handleLoad}
            onError={handleError}
            style={styles.imageHidden}
          />
        )
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  frameNotTransparent: {
    backgroundColor: colors.cardGrayLight,
  },
  photoBounds: {
    position: 'absolute',
    overflow: 'hidden',
  },
  imageHidden: {
    position: 'absolute',
    width: 0,
    height: 0,
    opacity: 0,
  },
});
