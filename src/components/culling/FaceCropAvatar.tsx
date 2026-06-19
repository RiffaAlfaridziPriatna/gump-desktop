import {
  CullingBoundingBox,
  getFaceCropImageStyle,
} from '@lib/cullingFaceCrop';
import { colors } from '@lib/colors';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Image, ImageLoadEvent, StyleSheet, View } from 'react-native';

type FaceCropAvatarProps = {
  uri: string;
  boundingBox: CullingBoundingBox;
  size: number;
};

// Inline utility for extracting image dimensions from event
const getImageDimensions = (event: ImageLoadEvent) => {
  const { width, height } = event.nativeEvent.source ?? {};
  return width && height ? { width, height } : null;
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

    Image.getSize(
      uri,
      (width, height) => {
        if (!cancelled) setImageSize({ width, height });
      },
      () => {
        // getSize often fails on macOS file:// URIs; fallback to onLoad
      },
    );

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

  // Stable callback
  const handleLoad = useCallback((event: ImageLoadEvent) => {
    const dim = getImageDimensions(event);
    if (dim) setImageSize(dim);
  }, []);

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
      <Image
        source={{ uri }}
        style={cropStyle ?? styles.hiddenMeasure}
        onLoad={handleLoad}
        onError={() => setImageSize(null)}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: colors.border,
  },
  hiddenMeasure: {
    width: 1,
    height: 1,
    opacity: 0,
  },
});
