import {
  CULLED_ALBUM_THUMBNAIL_ASPECT_RATIO,
  getCulledAlbumThumbnailLayout,
  loadImageDimensions,
} from '@lib/imageDimensions';
import {colors} from '@lib/colors';
import React, {useEffect, useMemo, useState} from 'react';
import {Image, StyleSheet, View} from 'react-native';

type CulledAlbumPhotoThumbnailProps = {
  uri: string;
  width: number;
};

export const CulledAlbumPhotoThumbnail = React.memo(
  function CulledAlbumPhotoThumbnail({
    uri,
    width,
  }: CulledAlbumPhotoThumbnailProps) {
    const [imageSize, setImageSize] = useState<{
      width: number;
      height: number;
    } | null>(null);

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

    const imageLayout = useMemo(() => {
      const containerHeight = width / CULLED_ALBUM_THUMBNAIL_ASPECT_RATIO;

      if (!imageSize) {
        return {
          width,
          height: containerHeight,
          left: 0,
          top: 0,
        };
      }

      return getCulledAlbumThumbnailLayout(
        width,
        imageSize.width,
        imageSize.height,
      );
    }, [imageSize, width]);

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
