import {useCulledAlbumPhotosState, useCulledAlbumStore} from '@context/culledAlbum';
import {cullingEngine} from '@lib/culling/cullingEngine';
import {computeKeyFaces, computeStats} from '@lib/culling/cullingUtil';
import {persistAlbum, updateCullingSummary} from '@lib/culledAlbum/store';
import {toCullingPhoto} from '@lib/culledAlbum/types';
import {APIResponse} from '@services/api';
import {useCallback, useEffect, useMemo} from 'react';

export function useCulledAlbumDetailData(
  albumId: string,
  albumPhotos: ReturnType<typeof useCulledAlbumPhotosState>,
  photosReady = true,
) {
  const persistedStats = useCulledAlbumStore(
    state => state.albums[albumId]?.cullingStats ?? null,
  );
  const persistedKeyFaces = useCulledAlbumStore(
    state => state.albums[albumId]?.cullingKeyFaces ?? null,
  );

  const analyzedPhotos = useMemo(
    () =>
      albumPhotos
        .filter(photo => photo.analysisStatus === 'analyzed')
        .map(toCullingPhoto),
    [albumPhotos],
  );

  const needsLiveSummary = !persistedStats;

  const liveStats = useMemo(
    () =>
      needsLiveSummary && photosReady && analyzedPhotos.length > 0
        ? computeStats(analyzedPhotos)
        : null,
    [analyzedPhotos, needsLiveSummary, photosReady],
  );

  const liveKeyFaces = useMemo(
    () =>
      needsLiveSummary && photosReady && analyzedPhotos.length > 0
        ? computeKeyFaces(analyzedPhotos)
        : null,
    [analyzedPhotos, needsLiveSummary, photosReady],
  );

  const mySelectionsLive = useMemo(
    () => analyzedPhotos.filter(photo => photo.selected).length,
    [analyzedPhotos],
  );

  const stats = useMemo<APIResponse.CullingStats | null>(() => {
    if (persistedStats) {
      return persistedStats;
    }
    if (!liveStats) {
      return null;
    }
    return {...liveStats, mySelections: mySelectionsLive};
  }, [liveStats, mySelectionsLive, persistedStats]);

  const keyFaces = persistedKeyFaces ?? liveKeyFaces ?? [];

  useEffect(() => {
    if (!photosReady || persistedStats || analyzedPhotos.length === 0) {
      return;
    }
    updateCullingSummary(albumId);
    persistAlbum(albumId).catch(() => undefined);
  }, [albumId, analyzedPhotos.length, persistedStats, photosReady]);

  const isAnalyzing = useMemo(
    () =>
      albumPhotos.some(
        photo =>
          photo.analysisStatus === 'pending' ||
          photo.analysisStatus === 'analyzing',
      ),
    [albumPhotos],
  );

  const photoMap = useMemo(() => {
    const map = new Map<string, APIResponse.CullingPhoto>();
    for (const photo of analyzedPhotos) {
      map.set(photo.photoId, photo);
    }
    return map;
  }, [analyzedPhotos]);

  const analyzedPhotoList = useMemo(
    () => Array.from(photoMap.values()),
    [photoMap],
  );

  const analyzedPhotoCount = analyzedPhotos.length;

  const toggleSelection = useCallback(
    async (photoId: string, selected: boolean) => {
      await cullingEngine.updateSelection(albumId, photoId, {selected});
    },
    [albumId],
  );

  const updateStarRating = useCallback(
    async (photoId: string, starIndex: number, currentRating: number) => {
      const targetRating = starIndex + 1;
      const nextRating = currentRating === targetRating ? 0 : targetRating;
      await cullingEngine.updateStarRating(albumId, photoId, nextRating);
    },
    [albumId],
  );

  const deletePhoto = useCallback(
    async (photoId: string) => {
      await cullingEngine.deletePhoto(albumId, photoId);
    },
    [albumId],
  );

  return {
    analyzedPhotos,
    stats,
    keyFaces,
    isAnalyzing,
    photoMap,
    analyzedPhotoList,
    analyzedPhotoCount,
    toggleSelection,
    updateStarRating,
    deletePhoto,
  };
}
