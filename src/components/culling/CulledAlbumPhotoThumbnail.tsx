import {getContainedImageLayout} from '@lib/culling/cullingFaceCrop';
import {
  getCachedImageDimensions,
  loadImageDimensions,
  type ImageDimensions,
} from '@lib/media/imageDimensions';
import {resolveGridDisplayUri} from '@lib/storage/localStorage';
import {colors} from '@lib/ui/colors';
import {FileAsset} from '@services/upload/types';
import {memo, useCallback, useEffect, useMemo, useState} from 'react';
import {
  Image,
  type ImageLoadEventData,
  StyleSheet,
  View,
  type NativeSyntheticEvent,
} from 'react-native';

const THUMBNAIL_ASPECT_RATIO = 3 / 2;

type CulledAlbumPhotoThumbnailProps = {
  file: FileAsset;
  width: number;
};

export const CulledAlbumPhotoThumbnail = memo(function CulledAlbumPhotoThumbnail({
  file,
  width,
}: CulledAlbumPhotoThumbnailProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const uri = resolveGridDisplayUri(file) ?? '';
  const height = width / THUMBNAIL_ASPECT_RATIO;
  const [imageSize, setImageSize] = useState<ImageDimensions | null>(
    () => (uri ? getCachedImageDimensions(uri) ?? null : null),
  );

  useEffect(() => {
    setIsLoaded(false);
    setImageSize(uri ? getCachedImageDimensions(uri) ?? null : null);
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

  const handleLoad = useCallback(
    (event: NativeSyntheticEvent<ImageLoadEventData>) => {
      const cached = getCachedImageDimensions(uri);
      if (cached) {
        setImageSize(cached);
      } else {
        const {width: loadedWidth, height: loadedHeight} = event.nativeEvent.source;

        if (loadedWidth > 0 && loadedHeight > 0) {
          setImageSize({width: loadedWidth, height: loadedHeight});
        }
      }

      setIsLoaded(true);
    },
    [uri],
  );

  const handleError = useCallback(() => {
    setIsLoaded(true);
  }, []);

  if (width <= 0) {
    return null;
  }

  return (
    <View style={[styles.container, {width, height}]}>
      {uri ? (
        <Image
          source={{uri}}
          onLoad={handleLoad}
          onError={handleError}
          style={
            imageLayout
              ? [
                  styles.containedImage,
                  {
                    width: imageLayout.width,
                    height: imageLayout.height,
                    left: imageLayout.left,
                    top: imageLayout.top,
                    opacity: isLoaded ? 1 : 0,
                  },
                ]
              : styles.imageHidden
          }
        />
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
  imageHidden: {
    position: 'absolute',
    width: 0,
    height: 0,
    opacity: 0,
  },
});
