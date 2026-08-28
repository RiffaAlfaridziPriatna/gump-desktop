import {NativeModules, Platform, Image} from 'react-native';
import {LruCache} from './lruCache';

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

const DIMENSION_CACHE_MAX = 400;
const dimensionCache = new LruCache<string, ImageDimensions>(DIMENSION_CACHE_MAX);

export function getCachedImageDimensions(
  uri: string,
): ImageDimensions | undefined {
  return dimensionCache.get(uri);
}

export function putCachedImageDimensions(
  uri: string,
  dimensions: ImageDimensions,
): void {
  if (dimensions.width > 0 && dimensions.height > 0) {
    dimensionCache.set(uri, dimensions);
  }
}

const NATIVE_DIMENSION_PLATFORMS = new Set(['macos', 'ios', 'android', 'windows']);

export async function loadImageDimensions(
  uri: string,
  options?: {bypassCache?: boolean},
): Promise<ImageDimensions | null> {
  if (!options?.bypassCache) {
    const cached = dimensionCache.get(uri);
    if (cached) {
      return cached;
    }
  }

  if (
    NATIVE_DIMENSION_PLATFORMS.has(Platform.OS) &&
    NativeLocalStorage?.getImageDimensions
  ) {
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

export function getFileThumbnailDimensions(
  file: {thumbnailWidth?: number | null; thumbnailHeight?: number | null},
): ImageDimensions | null {
  const width = file.thumbnailWidth ?? 0;
  const height = file.thumbnailHeight ?? 0;
  if (width <= 0 || height <= 0) {
    return null;
  }
  return {width, height};
}

export const CULLED_ALBUM_THUMBNAIL_ASPECT_RATIO = 3 / 2;

export function getCoverImageLayout(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number,
): {width: number; height: number; left: number; top: number} {
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

export function getCulledAlbumThumbnailLayout(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number,
): {width: number; height: number; left: number; top: number} {
  // Landscape and square cover the 3:2 cell. Portrait contains (letterbox).
  const isPortrait = imageHeight > imageWidth;

  if (!isPortrait) {
    return getCoverImageLayout(
      containerWidth,
      containerHeight,
      imageWidth,
      imageHeight,
    );
  }

  const scale = Math.min(
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
