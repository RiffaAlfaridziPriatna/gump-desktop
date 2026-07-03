import {
  getCachedImageDimensions,
  ImageDimensions,
} from '@lib/imageDimensions';
import {preloadImage} from '@lib/imagePreload';
import {useLayoutEffect, useState} from 'react';

export function useImageDimensions(uri: string | undefined) {
  const [imageSize, setImageSize] = useState<ImageDimensions | null>(() =>
    uri ? getCachedImageDimensions(uri) ?? null : null,
  );

  useLayoutEffect(() => {
    if (!uri) {
      setImageSize(null);
      return;
    }

    const cached = getCachedImageDimensions(uri);
    if (cached) {
      setImageSize(cached);
      void preloadImage(uri);
      return;
    }

    let cancelled = false;

    preloadImage(uri).then(() => {
      if (!cancelled) {
        setImageSize(getCachedImageDimensions(uri) ?? null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [uri]);

  return imageSize;
}
