import type {CulledAlbumGridPhoto} from '@components/culling/CulledAlbumPhotoGrid';
import {stabilizeGridPhotos} from '@lib/culledAlbum/stableGridPhotos';
import {
  isCulledPhotoDisabled,
  toCullingPhoto,
  type CulledAlbumPhoto,
} from '@lib/culledAlbum/types';
import {useMemo, useRef} from 'react';

/**
 * Grid photos limited to already-analyzed ones, identity-stabilized, and
 * frozen while culling is busy so local import feels like "nothing happened"
 * besides the toast / progress pill.
 */
export function useStableGridPhotos(
  albumPhotos: CulledAlbumPhoto[],
  cullingBusy: boolean,
): CulledAlbumGridPhoto[] {
  const gridPhotosCacheRef = useRef(new Map());
  const previousGridPhotosRef = useRef<CulledAlbumGridPhoto[]>([]);
  const rawGridPhotos = useMemo(() => {
    return albumPhotos
      .filter(
        photo =>
          photo.status === 'uploaded' && photo.analysisStatus === 'analyzed',
      )
      .map(photo => ({
        photoId: photo.photoId,
        lookId: photo.lookId,
        lookIntensity: photo.lookIntensity,
        disabled: isCulledPhotoDisabled(photo),
        analysis: toCullingPhoto(photo),
      }));
  }, [albumPhotos]);

  const liveGridPhotos = useMemo(() => {
    const stablePhotos = stabilizeGridPhotos(
      gridPhotosCacheRef.current,
      rawGridPhotos,
      previousGridPhotosRef.current,
    );
    previousGridPhotosRef.current = stablePhotos;
    return stablePhotos;
  }, [rawGridPhotos]);

  const frozenGridPhotosRef = useRef(liveGridPhotos);
  const wasCullingBusyRef = useRef(false);
  if (cullingBusy) {
    if (!wasCullingBusyRef.current && liveGridPhotos.length > 0) {
      frozenGridPhotosRef.current = liveGridPhotos;
    }
    wasCullingBusyRef.current = true;
  } else {
    wasCullingBusyRef.current = false;
    if (liveGridPhotos.length > 0) {
      frozenGridPhotosRef.current = liveGridPhotos;
    }
  }

  return cullingBusy && frozenGridPhotosRef.current.length > 0
    ? frozenGridPhotosRef.current
    : liveGridPhotos;
}
