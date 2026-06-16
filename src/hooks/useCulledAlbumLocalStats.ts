import {
  bytesToGigabytes,
  getPhotoCounts,
  getPhotoSizeBytesByAlbum,
} from '@lib/culledAlbumLocal';
import {useEffect, useMemo, useState} from 'react';

export type AlbumLocalStats = {
  counts: Record<string, number>;
  sizesGb: Record<string, number>;
};

const emptyStats: AlbumLocalStats = {counts: {}, sizesGb: {}};

export function useCulledAlbumLocalStats(albumIds: string[]) {
  const [stats, setStats] = useState<AlbumLocalStats>(emptyStats);
  const [error, setError] = useState<string | null>(null);
  const idsKey = useMemo(() => albumIds.join(','), [albumIds]);

  useEffect(() => {
    if (albumIds.length === 0) {
      setStats(emptyStats);
      setError(null);
      return;
    }

    let active = true;
    setError(null);

    Promise.all([getPhotoCounts(albumIds), getPhotoSizeBytesByAlbum(albumIds)])
      .then(([counts, sizesBytes]) => {
        if (active) {
          setStats({
            counts,
            sizesGb: Object.fromEntries(
              Object.entries(sizesBytes).map(([id, bytes]) => [
                id,
                bytesToGigabytes(bytes),
              ]),
            ),
          });
        }
      })
      .catch(err => {
        if (active) {
          setError(
            err instanceof Error ? err.message : 'Failed to load local stats',
          );
        }
      });

    return () => {
      active = false;
    };
  }, [albumIds, idsKey]);

  return {...stats, error};
}
