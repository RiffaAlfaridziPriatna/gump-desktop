import {preloadImages} from '@lib/imagePreload';
import {useEffect, useMemo} from 'react';

export function usePreloadGridImages(uris: string[]) {
  const uriKey = useMemo(
    () => [...new Set(uris.filter(Boolean))].join('\0'),
    [uris],
  );

  useEffect(() => {
    if (!uriKey) {
      return;
    }

    preloadImages(uriKey.split('\0'), {concurrency: 4}).catch(() => undefined);
  }, [uriKey]);
}
