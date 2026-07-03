import {
  CullingBoundingBox,
  getFaceCropImageStyle,
} from '@lib/cullingFaceCrop';
import {
  getCachedImageDimensions,
  ImageDimensions,
} from '@lib/imageDimensions';
import {preloadImage} from '@lib/imagePreload';
import {colors} from '@lib/colors';
import React, {useEffect, useMemo, useState} from 'react';
import {Image, StyleSheet, View} from 'react-native';

type FaceCropAvatarProps = {
  uri: string;
  boundingBox: CullingBoundingBox;
  size: number;
  imageSize?: ImageDimensions | null;
};

export const FaceCropAvatar = React.memo(function FaceCropAvatar({
  uri,
  boundingBox,
  size,
  imageSize: imageSizeProp,
}: FaceCropAvatarProps) {
  const [loadedImageSize, setLoadedImageSize] = useState<ImageDimensions | null>(
    () => getCachedImageDimensions(uri) ?? null,
  );

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

  const imageSize = imageSizeProp ?? loadedImageSize;

  const cropStyle = useMemo(
    () =>
      imageSize
        ? getFaceCropImageStyle(
            imageSize.width,
            imageSize.height,
            boundingBox,
            size,
          )
        : null,
    [imageSize, boundingBox, size],
  );

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
    >
      {cropStyle ? (
        <Image
          source={{ uri }}
          style={[styles.cropImage, cropStyle]}
        />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: colors.border,
  },
  cropImage: {
    position: 'absolute',
  },
});
