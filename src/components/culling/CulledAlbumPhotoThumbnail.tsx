import {
  CULLED_ALBUM_THUMBNAIL_ASPECT_RATIO,
  getCachedImageDimensions,
  getCulledAlbumThumbnailLayout,
  ImageDimensions,
  loadImageDimensions,
} from '@lib/imageDimensions';
import {colors} from '@lib/colors';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Image, StyleSheet, View} from 'react-native';

type CulledAlbumPhotoThumbnailProps = {
  uri: string;
  width: number;
};

export const CulledAlbumPhotoThumbnail = React.memo(
  function CulledAlbumPhotoThumbnail({uri, width}: CulledAlbumPhotoThumbnailProps) {
    const [imageSize, setImageSize] = useState<ImageDimensions | null>(() =>
      getCachedImageDimensions(uri) ?? null,
    );
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
      setIsLoaded(false);
      const cached = getCachedImageDimensions(uri);
      if (cached) {
        setImageSize(cached);
        return;
      }

      setImageSize(null);
      let cancelled = false;

      loadImageDimensions(uri).then(size => {
        if (!cancelled && size) {
          setImageSize(size);
        }
      });

      return () => {
        cancelled = true;
      };
    }, [uri]);

    const imageLayout = useMemo(() => {
      if (!imageSize || width <= 0) {
        return null;
      }

      return getCulledAlbumThumbnailLayout(
        width,
        imageSize.width,
        imageSize.height,
      );
    }, [imageSize, width]);

    const handleLoad = useCallback(() => {
      setIsLoaded(true);
    }, []);

    const handleError = useCallback(() => {
      setIsLoaded(true);
    }, []);

    if (width <= 0) {
      return null;
    }

    return (
      <View style={[styles.container, {width}]}>
        {imageLayout ? (
          <Image
            source={{uri}}
            onLoad={handleLoad}
            onError={handleError}
            style={[
              styles.image,
              {
                width: imageLayout.width,
                height: imageLayout.height,
                left: imageLayout.left,
                top: imageLayout.top,
              },
              !isLoaded && styles.imageHidden,
            ]}
          />
        ) : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    aspectRatio: CULLED_ALBUM_THUMBNAIL_ASPECT_RATIO,
    overflow: 'hidden',
    backgroundColor: colors.cardBackgroundSecondary,
  },
  image: {
    position: 'absolute',
  },
  imageHidden: {
    opacity: 0,
  },
});
