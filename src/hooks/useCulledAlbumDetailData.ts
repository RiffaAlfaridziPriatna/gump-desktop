import {useCulledAlbumPhotosState, useCulledAlbumStore} from '@context/culledAlbum';
import {cullingEngine} from '@lib/culling/cullingEngine';
import {computeStats, orderPhotosForCulling} from '@lib/culling/cullingUtil';
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
  const keyFaces = useCulledAlbumStore(
    state => state.albums[albumId]?.cullingKeyFaces ?? [],
  );

  const analyzedPhotos = useMemo(
    () =>
      orderPhotosForCulling(
        albumId,
        albumPhotos
          .filter(photo => photo.analysisStatus === 'analyzed')
          .map(toCullingPhoto),
        photo => photo.fileName,
      ),
    [albumId, albumPhotos],
  );

  const needsLiveSummary = !persistedStats;

  const liveStats = useMemo(
    () =>
      needsLiveSummary && photosReady && analyzedPhotos.length > 0
        ? computeStats(analyzedPhotos)
        : null,
    [analyzedPhotos, needsLiveSummary, photosReady],
  );

  const isAnalyzing = useMemo(
    () =>
      albumPhotos.some(
        photo =>
          photo.analysisStatus === 'pending' ||
          photo.analysisStatus === 'analyzing',
      ),
    [albumPhotos],
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

  useEffect(() => {
    if (!photosReady || analyzedPhotos.length === 0) {
      return;
    }

    const missingCrops = analyzedPhotos.filter(
      photo => photo.faces.length > 0 && photo.faces.some(face => !face.cropUri),
    );

    if (missingCrops.length > 0) {
      cullingEngine.refreshAssets(albumId).catch(() => undefined);
    }
  }, [albumId, analyzedPhotos, photosReady]);

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
