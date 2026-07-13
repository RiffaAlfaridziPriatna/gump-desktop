import {
  CullingBoundingBox,
  getFaceCropImageStyle,
} from '@lib/culling/cullingFaceCrop';
import {
  getCachedImageDimensions,
  ImageDimensions,
  loadImageDimensions,
} from '@lib/media/imageDimensions';
import {colors} from '@lib/ui/colors';
import React, {useEffect, useMemo, useState} from 'react';
import {Image, StyleSheet, View} from 'react-native';

type FaceCropAvatarProps = {
  uri?: string;
  cropUri?: string;
  boundingBox?: CullingBoundingBox;
  size: number;
  imageSize?: ImageDimensions | null;
};

const PreCroppedFaceAvatar = React.memo(function PreCroppedFaceAvatar({
  cropUri,
  size,
}: {
  cropUri: string;
  size: number;
}) {
  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}>
      <Image
        source={{uri: cropUri}}
        fadeDuration={0}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
        }}
      />
    </View>
  );
});

const TransformFaceCropAvatar = React.memo(function TransformFaceCropAvatar({
  uri,
  boundingBox,
  size,
  imageSize: imageSizeProp,
}: {
  uri: string;
  boundingBox: CullingBoundingBox;
  size: number;
  imageSize?: ImageDimensions | null;
}) {
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

    loadImageDimensions(uri).then(dimensions => {
      if (!cancelled && dimensions) {
        setLoadedImageSize(dimensions);
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
      ]}>
      {cropStyle ? (
        <Image source={{uri}} style={[styles.cropImage, cropStyle]} />
      ) : null}
    </View>
  );
});

export const FaceCropAvatar = React.memo(function FaceCropAvatar({
  uri,
  cropUri,
  boundingBox,
  size,
  imageSize,
}: FaceCropAvatarProps) {
  if (cropUri) {
    return <PreCroppedFaceAvatar cropUri={cropUri} size={size} />;
  }

  if (uri && boundingBox) {
    return (
      <TransformFaceCropAvatar
        uri={uri}
        boundingBox={boundingBox}
        size={size}
        imageSize={imageSize}
      />
    );
  }

  return null;
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
