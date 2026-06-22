import {
  CullingBoundingBox,
  getFaceCropImageStyle,
} from '@lib/cullingFaceCrop';
import { loadImageDimensions } from '@lib/imageDimensions';
import { colors } from '@lib/colors';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

type FaceCropAvatarProps = {
  uri: string;
  boundingBox: CullingBoundingBox;
  size: number;
};

export const FaceCropAvatar = React.memo(function FaceCropAvatar({
  uri,
  boundingBox,
  size,
}: FaceCropAvatarProps) {
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
