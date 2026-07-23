import {
  getCachedImageDimensions,
  ImageDimensions,
  loadImageDimensions,
} from '@lib/media/imageDimensions';
import {preloadImage} from '@lib/media/imagePreload';
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
    }

    let cancelled = false;

    loadImageDimensions(uri, {bypassCache: true})
      .then(dimensions => {
        if (!cancelled && dimensions) {
          setImageSize(dimensions);
        }
      })
      .catch(() => undefined);

    preloadImage(uri).catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [uri]);

  return imageSize;
}
