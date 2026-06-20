import {NativeModules, Platform, Image} from 'react-native';

export type ImageDimensions = {
  width: number;
  height: number;
};

type NativeLocalStorageModule = {
  getImageDimensions?: (uri: string) => Promise<ImageDimensions>;
};

const NativeLocalStorage = NativeModules.GumpLocalStorage as
  | NativeLocalStorageModule
  | undefined;

const dimensionCache = new Map<string, ImageDimensions>();

export async function loadImageDimensions(
  uri: string,
): Promise<ImageDimensions | null> {
  const cached = dimensionCache.get(uri);
  if (cached) {
    return cached;
  }

  if (Platform.OS === 'macos' && NativeLocalStorage?.getImageDimensions) {
    try {
      const dimensions = await NativeLocalStorage.getImageDimensions(uri);
      if (dimensions.width > 0 && dimensions.height > 0) {
        dimensionCache.set(uri, dimensions);
        return dimensions;
      }
    } catch {
      // Fall through to Image.getSize.
    }
  }

  return new Promise(resolve => {
    Image.getSize(
      uri,
      (width, height) => {
        const dimensions = {width, height};
        dimensionCache.set(uri, dimensions);
        resolve(dimensions);
      },
      () => resolve(null),
    );
  });
}

export const CULLED_ALBUM_THUMBNAIL_ASPECT_RATIO = 4 / 3;

export function getCulledAlbumThumbnailLayout(
  containerWidth: number,
  imageWidth: number,
  imageHeight: number,
): {width: number; height: number; left: number; top: number} {
  const containerHeight = containerWidth / CULLED_ALBUM_THUMBNAIL_ASPECT_RATIO;
  const isPortrait = imageHeight > imageWidth;

  if (!isPortrait) {
    const scale = Math.max(
      containerWidth / imageWidth,
      containerHeight / imageHeight,
    );
    const width = imageWidth * scale;
    const height = imageHeight * scale;
    return {
      width,
      height,
      left: (containerWidth - width) / 2,
      top: (containerHeight - height) / 2,
    };
  }

  const scale = containerHeight / imageHeight;
  const width = imageWidth * scale;
  return {
    width,
    height: containerHeight,
    left: (containerWidth - width) / 2,
    top: 0,
  };
}
