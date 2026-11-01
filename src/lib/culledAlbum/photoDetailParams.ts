import type {MainStackParamList} from '../../app/MainNavigator';

// The viewer gets the current grid order and nothing else, so opening a photo
// (card, badge or key face) never changes the active filters.
export function photoDetailParams(
  albumId: string,
  photoId: string,
  gridPhotoIds: string[],
  faceIndex?: number,
): MainStackParamList['CulledAlbumPhotoDetail'] {
  return {
    albumId,
    photoId,
    photoIds: gridPhotoIds,
    ...(typeof faceIndex === 'number' ? {faceIndex} : {}),
  };
}
