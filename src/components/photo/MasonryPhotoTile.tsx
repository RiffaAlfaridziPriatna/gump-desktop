import {isImagePrefetched} from '@lib/imagePreload';
import {isMasonryImageLoaded, markMasonryImageLoaded} from '@lib/masonryImageLoadCache';
import {colors} from '@lib/colors';
import {MasonryLayoutItem} from '@lib/masonryLayout';
import {memo, useCallback, useState} from 'react';
import {Image, StyleSheet, View} from 'react-native';

export type MasonryPhotoTileItem = MasonryLayoutItem & {
  uri: string;
  isPlaceholder?: boolean;
};

type MasonryPhotoTileProps = {
  item: MasonryPhotoTileItem;
  width: number;
  height: number;
};

export const MasonryPhotoTile = memo(function MasonryPhotoTile({
  item,
  width,
  height,
}: MasonryPhotoTileProps) {
  const [isLoaded, setIsLoaded] = useState(
    () => isMasonryImageLoaded(item.uri) || isImagePrefetched(item.uri),
  );

  const handleLoadEnd = useCallback(() => {
    markMasonryImageLoaded(item.uri);
    setIsLoaded(true);
  }, [item.uri]);

  if (item.isPlaceholder) {
    return (
      <View style={[styles.placeholder, {width, height}]} />
    );
  }

  return (
    <View style={[styles.container, {width, height}]}>
      <Image
        source={{uri: item.uri}}
        style={[styles.image, !isLoaded && styles.imageHidden]}
        resizeMode="cover"
        onLoad={handleLoadEnd}
        onError={handleLoadEnd}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: colors.border,
  },
  placeholder: {
    backgroundColor: colors.border,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageHidden: {
    opacity: 0,
  },
});
