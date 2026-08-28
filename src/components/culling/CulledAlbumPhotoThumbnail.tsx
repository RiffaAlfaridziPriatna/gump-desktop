import {useCulledAlbumPhoto} from '@context/culledAlbum';
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
import {resolveGridDisplayUri} from '@lib/storage/localStorage';
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
};

function resolveThumbnailSize(
  file: {thumbnailWidth?: number | null; thumbnailHeight?: number | null} | undefined,
  uri: string,
): ImageDimensions | null {
  const stored = file ? getFileThumbnailDimensions(file) : null;
  if (stored) {
    putCachedImageDimensions(uri, stored);
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
}: CulledAlbumPhotoThumbnailProps) {
  const photo = useCulledAlbumPhoto(albumId, photoId);
  const file = photo?.file;
  const uri = file ? resolveGridDisplayUri(file) ?? '' : '';
  const height = width / THUMBNAIL_ASPECT_RATIO;
  const [imageSize, setImageSize] = useState<ImageDimensions | null>(() =>
    resolveThumbnailSize(file, uri),
  );
  const [isLoaded, setIsLoaded] = useState(() => hasWarmThumbnail(uri));
  const displayedUriRef = useRef(uri);

  useEffect(() => {
    if (displayedUriRef.current === uri) {
      return;
    }
    displayedUriRef.current = uri;
    setImageSize(resolveThumbnailSize(file, uri));
    setIsLoaded(hasWarmThumbnail(uri));
  }, [file, uri]);

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
    const stored = file ? getFileThumbnailDimensions(file) : null;
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
  }, [albumId, file, photoId, uri]);

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
        persistThumbnailDimensions(albumId, photoId, dimensions);
        return dimensions;
      });
    },
    [albumId, photoId, uri],
  );

  const handleError = useCallback(() => {
    setIsLoaded(true);
  }, []);

  if (width <= 0) {
    return null;
  }

  return (
    <View style={[styles.container, {width, height}]} pointerEvents="box-none">
      {uri && imageLayout ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Image
            source={{uri}}
            onLoad={handleLoad}
            onError={handleError}
            style={[
              styles.containedImage,
              {
                width: imageLayout.width,
                height: imageLayout.height,
                left: imageLayout.left,
                top: imageLayout.top,
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
