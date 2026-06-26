import {ImageDimensions, loadImageDimensions} from '@lib/imageDimensions';
import {useEffect, useState} from 'react';

export function useCulledAlbumThumbnailDimensions(uriKey: string) {
  const [dimensions, setDimensions] = useState<Map<string, ImageDimensions>>(
    () => new Map(),
  );

  useEffect(() => {
    const uris = uriKey.length > 0 ? uriKey.split('\0') : [];
    if (uris.length === 0) {
      setDimensions(new Map());
      return;
    }

    let cancelled = false;

    Promise.all(
      uris.map(async uri => {
        const size = await loadImageDimensions(uri);
        return [uri, size] as const;
      }),
    ).then(entries => {
      if (cancelled) {
        return;
      }

      const nextDimensions = new Map<string, ImageDimensions>();
      for (const [uri, size] of entries) {
        if (size) {
          nextDimensions.set(uri, size);
        }
      }
      setDimensions(nextDimensions);
    });

    return () => {
      cancelled = true;
    };
  }, [uriKey]);

  return dimensions;
}
