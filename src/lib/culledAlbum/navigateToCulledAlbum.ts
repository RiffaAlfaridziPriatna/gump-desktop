import {preloadImages} from '@lib/media/imagePreload';
import {uploadAwareParams} from '@lib/navigation/uploadAwareNavigation';
import type {MainStackParamList} from '../../app/MainNavigator';
import type {StackNavigationProp} from '@react-navigation/stack';
import {
  resolveCulledAlbumRoute,
  resolveCulledAlbumRouteFromMemory,
} from './service';
import {culledAlbumStore, hasAnyInFlightAlbumWork} from './store';
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

export async function navigateToCulledAlbum(
  navigation: StackNavigationProp<MainStackParamList, 'Home'>,
  album: CulledAlbumListItem,
  ownerName: string,
): Promise<void> {
  const params = {
    albumId: album.albumId,
    albumName: album.title ?? album.name,
    ownerName,
  };

  const route =
    (hasAnyInFlightAlbumWork() &&
      resolveCulledAlbumRouteFromMemory(album.albumId)) ||
    (await resolveCulledAlbumRoute(album.albumId));

  if (route === 'CulledAlbumDetail') {
    preloadUploadedThumbnails(album.albumId);
    navigation.navigate(
      'CulledAlbumDetail',
      uploadAwareParams({albumId: album.albumId}),
    );
    return;
  }

  navigation.navigate('AlbumDetail', uploadAwareParams(params));
}
