import {preloadImages} from '@lib/media/imagePreload';
import {
  prioritizeNavigationInteraction,
  uploadAwareParams,
} from '@lib/navigation/uploadAwareNavigation';
import type {MainStackParamList} from '../../app/MainNavigator';
import type {StackNavigationProp} from '@react-navigation/stack';
import {resolveCulledAlbumRouteFromMemory} from './service';
import {culledAlbumStore} from './store';
import {hasActiveQueueWork, hasActiveQueueWorkForAlbum} from './uploadQueueStore';
import {CulledAlbumListItem} from './types';

function preloadUploadedThumbnails(albumId: string): void {
  const storedPhotos =
    culledAlbumStore.getState().albums[albumId]?.photos ?? [];
  const uris = storedPhotos
    .filter(photo => photo.status === 'uploaded')
    .slice(0, 8)
    .map(photo => photo.file.uri);
  preloadImages(uris).catch(() => undefined);
}

function resolveRouteFromListItem(
  album: CulledAlbumListItem,
): 'AlbumDetail' | 'CulledAlbumDetail' {
  const fromMemory = resolveCulledAlbumRouteFromMemory(album.albumId);
  if (fromMemory) {
    return fromMemory;
  }

  return album.cullingCompleted ? 'CulledAlbumDetail' : 'AlbumDetail';
}

export function navigateToCulledAlbum(
  navigation: StackNavigationProp<MainStackParamList, 'Home'>,
  album: CulledAlbumListItem,
  ownerName: string,
): void {
  if (hasActiveQueueWork() || hasActiveQueueWorkForAlbum(album.albumId)) {
    prioritizeNavigationInteraction();
  }

  const route = resolveRouteFromListItem(album);

  if (route === 'CulledAlbumDetail') {
    preloadUploadedThumbnails(album.albumId);
    navigation.navigate(
      'CulledAlbumDetail',
      uploadAwareParams({albumId: album.albumId}),
    );
    return;
  }

  navigation.navigate(
    'AlbumDetail',
    uploadAwareParams({
      albumId: album.albumId,
      albumName: album.title ?? album.name,
      ownerName,
    }),
  );
}
