import {
  culledAlbumLocalStatsStore,
  loadStatsForAlbums,
  toSizesGb,
} from '@lib/culledAlbumLocalStats';
import {useStateStore} from '@lib/state';
import {useCallback, useEffect, useMemo, useRef} from 'react';

export function useCulledAlbumLocalStats(albumIds: string[]) {
  const idsKey = useMemo(() => albumIds.join(','), [albumIds]);
  const albumIdsRef = useRef(albumIds);
  albumIdsRef.current = albumIds;

  const refresh = useCallback(() => {
    loadStatsForAlbums(albumIdsRef.current);
  }, [idsKey]);

  useEffect(() => {
    refresh();
  }, [refresh, idsKey]);

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

  return {counts, sizesGb, error, refresh};
}
