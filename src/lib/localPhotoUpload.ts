import {addLocalPhoto} from '@lib/culledAlbumLocal';
import {copyPhotoToAlbum} from '@lib/localStorage';
import {FileAsset} from '@services/upload/types';

export async function uploadPhotoLocally(
  data: {file: FileAsset; albumId: string},
  onProgress: (progress: number) => void,
): Promise<FileAsset> {
  onProgress(0);
  const localFile = await copyPhotoToAlbum(data.albumId, data.file);
  await addLocalPhoto({
    albumId: data.albumId,
    fileName: localFile.name,
    filePath: localFile.uri,
    fileSize: localFile.size,
  });
  onProgress(100);
  return localFile;
}
