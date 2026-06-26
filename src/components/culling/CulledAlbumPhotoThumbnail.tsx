import {
  CULLED_ALBUM_THUMBNAIL_ASPECT_RATIO,
  getCulledAlbumThumbnailLayout,
  ImageDimensions,
  loadImageDimensions,
} from '@lib/imageDimensions';
import {colors} from '@lib/colors';
import React, {useEffect, useMemo, useState} from 'react';
import {Image, StyleSheet, View} from 'react-native';

type CulledAlbumPhotoThumbnailProps = {
  uri: string;
  width: number;
  imageSize?: ImageDimensions;
  usePreloadedDimensions?: boolean;
};

export const CulledAlbumPhotoThumbnail = React.memo(
  function CulledAlbumPhotoThumbnail({
    uri,
    width,
    imageSize,
    usePreloadedDimensions = false,
  }: CulledAlbumPhotoThumbnailProps) {
    const [loadedImageSize, setLoadedImageSize] =
      useState<ImageDimensions | null>(null);

    useEffect(() => {
      if (usePreloadedDimensions) {
        return;
      }

      let cancelled = false;
      setLoadedImageSize(null);

      loadImageDimensions(uri).then(dimensions => {
        if (!cancelled && dimensions) {
          setLoadedImageSize(dimensions);
        }
      });

      return () => {
        cancelled = true;
      };
    }, [uri, usePreloadedDimensions]);

    const resolvedImageSize = usePreloadedDimensions
      ? imageSize ?? null
      : loadedImageSize;

    const imageLayout = useMemo(() => {
      const containerHeight = width / CULLED_ALBUM_THUMBNAIL_ASPECT_RATIO;

      if (!resolvedImageSize) {
        return {
          width,
          height: containerHeight,
          left: 0,
          top: 0,
        };
      }

      return getCulledAlbumThumbnailLayout(
        width,
        resolvedImageSize.width,
        resolvedImageSize.height,
      );
    }, [resolvedImageSize, width]);

    if (width <= 0) {
      return null;
    }

    return (
      <View style={[styles.container, {width}]}>
        <Image
          source={{uri}}
          style={[
            styles.image,
            {
              width: imageLayout.width,
              height: imageLayout.height,
              left: imageLayout.left,
              top: imageLayout.top,
            },
          ]}
        />
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
});
