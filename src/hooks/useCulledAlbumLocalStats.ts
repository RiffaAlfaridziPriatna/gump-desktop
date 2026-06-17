import {
  culledAlbumLocalStatsStore,
  loadStatsForAlbums,
  toSizesGb,
} from '@lib/culledAlbumLocalStats';
import {useStateStore} from '@lib/state';
import {useEffect, useMemo} from 'react';

export function useCulledAlbumLocalStats(albumIds: string[]) {
  const idsKey = useMemo(() => albumIds.join(','), [albumIds]);

  useEffect(() => {
    loadStatsForAlbums(albumIds);
  }, [albumIds, idsKey]);

  const counts = useStateStore(
    culledAlbumLocalStatsStore,
    state => state.counts,
  );
  const sizeBytes = useStateStore(
    culledAlbumLocalStatsStore,
    state => state.sizeBytes,
  );
  const error = useStateStore(
    culledAlbumLocalStatsStore,
    state => state.error,
  );
  const sizesGb = useMemo(() => toSizesGb(sizeBytes), [sizeBytes]);

  return {counts, sizesGb, error};
}
