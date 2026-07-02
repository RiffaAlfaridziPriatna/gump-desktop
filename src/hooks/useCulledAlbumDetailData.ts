import {useCulledAlbumPhotosState} from '@context/culledAlbum';
import {cullingEngine} from '@lib/culling/cullingEngine';
import {toCullingPhoto} from '@lib/culledAlbum/types';
import {APIResponse} from '@services/api';
import {useCallback, useEffect, useMemo, useState} from 'react';

export function useCulledAlbumDetailData(albumId: string, albumPhotos: ReturnType<typeof useCulledAlbumPhotosState>) {
  const [analyzedPhotos, setAnalyzedPhotos] = useState<
    APIResponse.CullingPhoto[]
  >([]);
  const [stats, setStats] = useState<APIResponse.CullingStats | null>(null);
  const [keyFaces, setKeyFaces] = useState<APIResponse.CullingKeyFace[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(true);

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
    for (const photo of albumPhotos) {
      if (photo.analysisStatus === 'analyzed') {
        map.set(photo.photoId, toCullingPhoto(photo));
      }
    }
    return map;
  }, [albumPhotos, analyzedPhotos]);

  const analyzedPhotoList = useMemo(
    () => Array.from(photoMap.values()),
    [photoMap],
  );

  const analyzedPhotoCount = useMemo(
    () =>
      albumPhotos.filter(photo => photo.analysisStatus === 'analyzed').length,
    [albumPhotos],
  );

  const refreshDetail = useCallback(async () => {
    try {
      await cullingEngine.refreshDuplicateFlags(albumId);
      const keyFaceList = await cullingEngine.getKeyFaces(albumId);
      const [photoList, statsResult] = await Promise.all([
        cullingEngine.getPhotos(albumId),
        cullingEngine.getStats(albumId),
      ]);
      setAnalyzedPhotos(photoList.results);
      setStats(statsResult);
      setKeyFaces(keyFaceList.results);
    } catch (error) {
      console.error(
        '[useCulledAlbumDetailData] Failed to refresh detail',
        error,
      );
    } finally {
      setLoadingDetail(false);
    }
  }, [albumId]);

  useEffect(() => {
    if (!isAnalyzing && analyzedPhotoCount > 0) {
      refreshDetail();
    }
  }, [analyzedPhotoCount, isAnalyzing, refreshDetail]);

  const toggleSelection = useCallback(
    async (photoId: string, selected: boolean) => {
      const updated = await cullingEngine.updateSelection(albumId, photoId, {
        selected,
      });
      setAnalyzedPhotos(current =>
        current.map(photo =>
          photo.photoId === photoId ? {...photo, ...updated} : photo,
        ),
      );
      setStats(await cullingEngine.getStats(albumId));
    },
    [albumId],
  );

  const updateStarRating = useCallback(
    async (photoId: string, starIndex: number, currentRating: number) => {
      const targetRating = starIndex + 1;
      const nextRating = currentRating === targetRating ? 0 : targetRating;
      const updated = await cullingEngine.updateStarRating(
        albumId,
        photoId,
        nextRating,
      );
      setAnalyzedPhotos(current =>
        current.map(photo =>
          photo.photoId === photoId ? {...photo, ...updated} : photo,
        ),
      );
    },
    [albumId],
  );

  const deletePhoto = useCallback(
    async (photoId: string) => {
      await cullingEngine.deletePhoto(albumId, photoId);
      setAnalyzedPhotos(current =>
        current.filter(photo => photo.photoId !== photoId),
      );
      await refreshDetail();
    },
    [albumId, refreshDetail],
  );

  return {
    analyzedPhotos,
    stats,
    keyFaces,
    loadingDetail,
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
