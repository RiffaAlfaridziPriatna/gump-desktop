import {useCulledAlbumPhotosState} from '@context/culledAlbum';
import {cullingEngine} from '@lib/culling/cullingEngine';
import {computeKeyFaces, computeStats} from '@lib/culling/cullingUtil';
import {toCullingPhoto} from '@lib/culledAlbum/types';
import {APIResponse} from '@services/api';
import {useCallback, useEffect, useMemo, useRef} from 'react';
import {InteractionManager} from 'react-native';

export function useCulledAlbumDetailData(
  albumId: string,
  albumPhotos: ReturnType<typeof useCulledAlbumPhotosState>,
) {
  const wasAnalyzingRef = useRef(
    albumPhotos.some(
      photo =>
        photo.analysisStatus === 'pending' ||
        photo.analysisStatus === 'analyzing',
    ),
  );

  const analyzedPhotos = useMemo(
    () =>
      albumPhotos
        .filter(photo => photo.analysisStatus === 'analyzed')
        .map(toCullingPhoto),
    [albumPhotos],
  );

  const stats = useMemo(
    () => (analyzedPhotos.length > 0 ? computeStats(analyzedPhotos) : null),
    [analyzedPhotos],
  );

  const keyFaces = useMemo(
    () => (analyzedPhotos.length > 0 ? computeKeyFaces(analyzedPhotos) : []),
    [analyzedPhotos],
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

  const refreshDetail = useCallback(async () => {
    try {
      await cullingEngine.refreshDuplicateFlags(albumId);
    } catch (error) {
      console.error(
        '[useCulledAlbumDetailData] Failed to refresh detail',
        error,
      );
    }
  }, [albumId]);

  useEffect(() => {
    wasAnalyzingRef.current = isAnalyzing;
  }, [albumId]);

  useEffect(() => {
    if (analyzedPhotoCount === 0) {
      return;
    }

    if (isAnalyzing) {
      wasAnalyzingRef.current = true;
      return;
    }

    if (!wasAnalyzingRef.current) {
      return;
    }

    wasAnalyzingRef.current = false;

    const task = InteractionManager.runAfterInteractions(() => {
      refreshDetail().catch(() => undefined);
    });

    return () => {
      task.cancel();
    };
  }, [albumId, analyzedPhotoCount, isAnalyzing, refreshDetail]);

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
      InteractionManager.runAfterInteractions(() => {
        refreshDetail().catch(() => undefined);
      });
    },
    [albumId, refreshDetail],
  );

  return {
    analyzedPhotos,
    stats,
    keyFaces,
    isAnalyzing,
    photoMap,
    analyzedPhotoList,
    analyzedPhotoCount,
    refreshDetail,
    toggleSelection,
    updateStarRating,
    deletePhoto,
  };
}
