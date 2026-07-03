import {
  DEFAULT_ASPECT_HEIGHT,
  DEFAULT_ASPECT_WIDTH,
} from '@lib/masonryLayout';
import {FileAsset} from '@services/upload/types';
import {useEffect, useMemo, useState} from 'react';
import {Image} from 'react-native';

export type PhotoDimensions = {
  width: number;
  height: number;
};

const dimensionCache = new Map<string, PhotoDimensions>();

function getFallbackDimensions(): PhotoDimensions {
  return {width: DEFAULT_ASPECT_WIDTH, height: DEFAULT_ASPECT_HEIGHT};
}

function loadPhotoDimensions(uri: string): Promise<PhotoDimensions> {
  const cached = dimensionCache.get(uri);
  if (cached) {
    return Promise.resolve(cached);
  }

  return new Promise(resolve => {
    Image.getSize(
      uri,
      (width, height) => {
        const dimensions = {width, height};
        dimensionCache.set(uri, dimensions);
        resolve(dimensions);
      },
      () => {
        const dimensions = getFallbackDimensions();
        dimensionCache.set(uri, dimensions);
        resolve(dimensions);
      },
    );
  });
}

export function usePhotoDimensions(photos: FileAsset[]) {
  const photoUrisKey = useMemo(
    () => photos.map(photo => photo.uri).join('\n'),
    [photos],
  );
  const [dimensions, setDimensions] = useState<Map<string, PhotoDimensions>>(
    () => new Map(),
  );
  const [loading, setLoading] = useState(photos.length > 0);

  useEffect(() => {
    if (photos.length === 0) {
      setDimensions(new Map());
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    Promise.all(
      photos.map(async photo => {
        const size = await loadPhotoDimensions(photo.uri);
        return [photo.uri, size] as const;
      }),
    ).then(entries => {
      if (cancelled) {
        return;
      }
      setDimensions(new Map(entries));
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [photoUrisKey, photos]);

  return {dimensions, loading};
}
