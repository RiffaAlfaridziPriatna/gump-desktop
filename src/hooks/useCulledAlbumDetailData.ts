import {useCulledAlbumPhotosState, useCulledAlbumStore} from '@context/culledAlbum';
import {cullingEngine} from '@lib/culling/cullingEngine';
import {useTogglePick} from '@hooks/useTogglePick';
import {reportError} from '@lib/observability/reportError';
import {orderPhotosForCulling} from '@lib/culling/cullingUtil';
import {toCullingPhoto} from '@lib/culledAlbum/types';
import {APIResponse} from '@services/api';
import {useCallback, useMemo} from 'react';

export function useCulledAlbumDetailData(
  albumId: string,
  albumPhotos: ReturnType<typeof useCulledAlbumPhotosState>,
  _photosReady = true,
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
    if (!persistedStats) {
      return null;
    }
    return {...persistedStats, mySelections: mySelectionsLive};
  }, [mySelectionsLive, persistedStats]);

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

  const togglePick = useTogglePick(albumId);
  const toggleSelection = useCallback(
    async (photoId: string, selected: boolean) => {
      await togglePick(photoId, selected).catch(err =>
        reportError(err, {
          source: 'culled_album_grid',
          operation: 'toggle_pick',
        }),
      );
    },
    [togglePick],
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
