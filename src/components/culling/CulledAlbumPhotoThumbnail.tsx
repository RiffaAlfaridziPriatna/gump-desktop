import {useShouldLoadCulledAlbumImage} from '@components/culling/culledAlbumImageLoad';
import {persistThumbnailDimensions} from '@lib/culledAlbum/persistThumbnailDimensions';
import {
  getCachedImageDimensions,
  getCulledAlbumThumbnailLayout,
  getFileThumbnailDimensions,
  loadImageDimensions,
  putCachedImageDimensions,
  type ImageDimensions,
} from '@lib/media/imageDimensions';
import {isImagePrefetched} from '@lib/media/imagePreload';
import {colors} from '@lib/ui/colors';
import {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Image,
  type ImageLoadEventData,
  StyleSheet,
  View,
  type NativeSyntheticEvent,
} from 'react-native';

const THUMBNAIL_ASPECT_RATIO = 3 / 2;

type CulledAlbumPhotoThumbnailProps = {
  albumId: string;
  photoId: string;
  width: number;
  uri: string;
  thumbnailWidth?: number | null;
  thumbnailHeight?: number | null;
  deferHeavyMediaWork?: boolean;
};

function resolveThumbnailSize(
  file: {thumbnailWidth?: number | null; thumbnailHeight?: number | null},
  uri: string,
): ImageDimensions | null {
  const stored = getFileThumbnailDimensions(file);
  if (stored) {
    if (uri) {
      putCachedImageDimensions(uri, stored);
    }
    return stored;
  }
  return uri ? getCachedImageDimensions(uri) ?? null : null;
}

function hasWarmThumbnail(uri: string): boolean {
  return Boolean(uri) && (isImagePrefetched(uri) || Boolean(getCachedImageDimensions(uri)));
}

export const CulledAlbumPhotoThumbnail = memo(function CulledAlbumPhotoThumbnail({
  albumId,
  photoId,
  width,
  uri,
  thumbnailWidth,
  thumbnailHeight,
  deferHeavyMediaWork = false,
}: CulledAlbumPhotoThumbnailProps) {
  const fileDims = {thumbnailWidth, thumbnailHeight};
  const shouldLoadImage = useShouldLoadCulledAlbumImage(photoId);
  const height = width / THUMBNAIL_ASPECT_RATIO;
  const [imageSize, setImageSize] = useState<ImageDimensions | null>(() =>
    resolveThumbnailSize(fileDims, uri),
  );
  const [isLoaded, setIsLoaded] = useState(() => hasWarmThumbnail(uri));
  const displayedUriRef = useRef(uri);

  useEffect(() => {
    if (displayedUriRef.current === uri) {
      return;
    }
    displayedUriRef.current = uri;
    setImageSize(resolveThumbnailSize(fileDims, uri));
    setIsLoaded(hasWarmThumbnail(uri));
  }, [fileDims.thumbnailHeight, fileDims.thumbnailWidth, uri]);

  const imageLayout = useMemo(() => {
    if (!imageSize) {
      return null;
    }

    return getCulledAlbumThumbnailLayout(
      width,
      height,
      imageSize.width,
      imageSize.height,
    );
  }, [height, imageSize, width]);

  useEffect(() => {
    if (deferHeavyMediaWork || !shouldLoadImage) {
      return;
    }

    const stored = getFileThumbnailDimensions(fileDims);
    if (stored) {
      if (uri) {
        putCachedImageDimensions(uri, stored);
      }
      setImageSize(stored);
      return;
    }

    if (!uri) {
      return;
    }

    const cached = getCachedImageDimensions(uri);
    if (cached) {
      setImageSize(cached);
      persistThumbnailDimensions(albumId, photoId, cached);
      return;
    }

    let cancelled = false;

    loadImageDimensions(uri).then(dimensions => {
      if (cancelled || !dimensions) {
        return;
      }
      setImageSize(dimensions);
      persistThumbnailDimensions(albumId, photoId, dimensions);
    });

    return () => {
      cancelled = true;
    };
  }, [
    albumId,
    deferHeavyMediaWork,
    fileDims.thumbnailHeight,
    fileDims.thumbnailWidth,
    photoId,
    shouldLoadImage,
    uri,
  ]);

  const handleLoad = useCallback(
    (event: NativeSyntheticEvent<ImageLoadEventData>) => {
      setIsLoaded(true);

      if (deferHeavyMediaWork) {
        return;
      }

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
        persistThumbnailDimensions(albumId, photoId, dimensions);
        return dimensions;
      });
    },
    [albumId, deferHeavyMediaWork, photoId, uri],
  );

  const handleError = useCallback(() => {
    setIsLoaded(true);
  }, []);

  if (width <= 0) {
    return null;
  }

  const showImage = Boolean(uri) && (shouldLoadImage || isLoaded);

  return (
    <View style={[styles.container, {width, height}]} pointerEvents="box-none">
      {showImage ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Image
            source={{uri}}
            onLoad={handleLoad}
            onError={handleError}
            style={[
              styles.containedImage,
              imageLayout
                ? {
                    width: imageLayout.width,
                    height: imageLayout.height,
                    left: imageLayout.left,
                    top: imageLayout.top,
                  }
                : {
                    width,
                    height,
                    left: 0,
                    top: 0,
                  },
              {
                opacity: isLoaded ? 1 : 0,
              },
            ]}
          />
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: colors.cardBackgroundSecondary,
  },
  containedImage: {
    position: 'absolute',
  },
});
