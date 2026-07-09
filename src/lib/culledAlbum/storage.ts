import AsyncStorage from '@react-native-async-storage/async-storage';
import {container} from '@di/container';
import {TOKENS} from '@di/tokens';
import {IAlbumRepository} from '@domain/repositories/IAlbumRepository';
import {IPhotoRepository} from '@domain/repositories/IPhotoRepository';
import {CulledAlbum as LegacyCulledAlbum, normalizePersistedAlbum, CulledAlbumPhoto} from './types';
import {CulledAlbum, AlbumCover} from '@/domain/entities/CulledAlbum';
import {domainPhotoToLegacy, legacyPhotoToDomain} from './photoMapper';
import {CulledPhoto} from '@/domain/entities/CulledPhoto';
import {FileAsset} from '@/domain/valueObjects/FileAsset';
import {Face} from '@/domain/valueObjects/Face';

const CULLED_ALBUMS_KEY = '@gump/culled_albums';
const MIGRATION_FLAG_KEY = '@gump/migration_completed';

let migrationPromise: Promise<void> | null = null;

export type SaveAlbumOptions = {
  includePhotos?: boolean;
};

function legacyAlbumToDomainAlbum(album: LegacyCulledAlbum): CulledAlbum {
  return new CulledAlbum({
    albumId: album.albumId,
    name: album.name,
    title: album.title,
    cover: AlbumCover.fromPlain(album.cover),
    coverMobile: AlbumCover.fromPlain(album.coverMobile),
    link: album.link,
    createdAt: album.createdAt,
    cullingCompleted: album.cullingCompleted,
    cullingHasUploads: album.cullingHasUploads,
    nextFaceClusterId: album.nextFaceClusterId,
    totalPhotos: album.totalPhotos,
    totalStorage: album.totalStorage,
    syncedMediaCount: album.syncedMediaCount,
    syncedStorageGb: album.syncedStorageGb,
  });
}

function legacyPhotosToDomainPhotos(
  albumId: string,
  photos: CulledAlbumPhoto[],
): CulledPhoto[] {
  return photos.map(photo => legacyPhotoToDomain(photo, albumId));
}

function domainAlbumToLegacy(
  album: CulledAlbum,
  photos: CulledAlbumPhoto[] = [],
): LegacyCulledAlbum {
  return {
    albumId: album.albumId,
    name: album.name,
    title: album.title,
    cover: album.cover.toPlain(),
    coverMobile: album.coverMobile.toPlain(),
    cullingCompleted: album.cullingCompleted,
    cullingHasUploads: album.cullingHasUploads,
    link: album.link,
    uploadBatchPhotoIds: [],
    localImportBatchPhotoIds: [],
    localImportBatchTotal: 0,
    analysisBatchPhotoIds: [],
    nextFaceClusterId: album.nextFaceClusterId,
    createdAt: album.createdAt,
    totalPhotos: album.totalPhotos,
    totalStorage: album.totalStorage,
    syncedMediaCount: album.syncedMediaCount ?? undefined,
    syncedStorageGb: album.syncedStorageGb ?? undefined,
    photos,
  };
}

async function ensureMigrated(): Promise<void> {
  if (migrationPromise) {
    return migrationPromise;
  }

  migrationPromise = (async () => {
    const migrated = await AsyncStorage.getItem(MIGRATION_FLAG_KEY);
    if (migrated === 'true') {
      return;
    }

    const raw = await AsyncStorage.getItem(CULLED_ALBUMS_KEY);
    if (!raw) {
      await AsyncStorage.setItem(MIGRATION_FLAG_KEY, 'true');
      return;
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, LegacyCulledAlbum>;
      const albumRepo = container.resolve<IAlbumRepository>(TOKENS.IAlbumRepository);
      const photoRepo = container.resolve<IPhotoRepository>(TOKENS.IPhotoRepository);

      for (const [albumId, legacyAlbum] of Object.entries(parsed)) {
        const normalized = normalizePersistedAlbum(legacyAlbum);
        
        const album = new CulledAlbum({
          albumId: normalized.albumId,
          name: normalized.name,
          title: normalized.title,
          cover: AlbumCover.fromPlain(normalized.cover),
          coverMobile: AlbumCover.fromPlain(normalized.coverMobile),
          link: normalized.link,
          createdAt: normalized.createdAt,
          cullingCompleted: normalized.cullingCompleted,
          cullingHasUploads: normalized.cullingHasUploads,
          nextFaceClusterId: normalized.nextFaceClusterId,
          totalPhotos: normalized.totalPhotos,
          totalStorage: normalized.totalStorage,
          syncedMediaCount: normalized.syncedMediaCount,
          syncedStorageGb: normalized.syncedStorageGb,
        });

        await albumRepo.save(album);

        const photos = normalized.photos.map(legacyPhoto =>
          new CulledPhoto({
            photoId: legacyPhoto.photoId,
            albumId: normalized.albumId,
            file: FileAsset.fromPlain(legacyPhoto.file),
            uploadedAt: legacyPhoto.uploadedAt,
            capturedAt: legacyPhoto.capturedAt,
            perceptualHash: legacyPhoto.perceptualHash,
            status: legacyPhoto.status,
            progress: legacyPhoto.progress,
            error: legacyPhoto.error,
            analysisStatus: legacyPhoto.analysisStatus,
            analysisProgress: legacyPhoto.analysisProgress,
            analysisError: legacyPhoto.analysisError,
            faces: legacyPhoto.faces.map((f, index) =>
              Face.fromPlain({
                ...f,
                faceId: f.rekognitionFaceId ?? `${legacyPhoto.photoId}-${index}`,
              }),
            ),
            serverUploadStatus: legacyPhoto.serverUploadStatus,
            serverUploadProgress: legacyPhoto.serverUploadProgress,
            serverUploadError: legacyPhoto.serverUploadError,
            selected: legacyPhoto.selected,
            starRating: legacyPhoto.starRating,
            aiSelected: legacyPhoto.aiSelected,
            maybe: legacyPhoto.maybe,
            blurred: legacyPhoto.blurred,
            closedEyes: legacyPhoto.closedEyes,
            duplicated: legacyPhoto.duplicated,
          })
        );

        await photoRepo.saveMany(photos);
      }

      await AsyncStorage.removeItem(CULLED_ALBUMS_KEY);
      await AsyncStorage.setItem(MIGRATION_FLAG_KEY, 'true');
    } catch (error) {
      console.error('Migration failed:', error);
    }
  })();

  return migrationPromise;
}

export async function readAllAlbums(): Promise<Record<string, LegacyCulledAlbum>> {
  await ensureMigrated();
  
  const albumRepo = container.resolve<IAlbumRepository>(TOKENS.IAlbumRepository);
  const photoRepo = container.resolve<IPhotoRepository>(TOKENS.IPhotoRepository);
  
  const albums = albumRepo.findAll();
  const result: Record<string, LegacyCulledAlbum> = {};
  
  for (const album of albums) {
    const photos = photoRepo.findByAlbum(album.albumId);
    const legacyPhotos = photos.map(domainPhotoToLegacy);
    result[album.albumId] = domainAlbumToLegacy(album, legacyPhotos);
  }
  
  return result;
}

export async function writeAllAlbums(
  data: Record<string, LegacyCulledAlbum>,
): Promise<void> {
  await ensureMigrated();
  
  const albumRepo = container.resolve<IAlbumRepository>(TOKENS.IAlbumRepository);
  const photoRepo = container.resolve<IPhotoRepository>(TOKENS.IPhotoRepository);
  
  for (const [albumId, legacyAlbum] of Object.entries(data)) {
    const album = new CulledAlbum({
      albumId: legacyAlbum.albumId,
      name: legacyAlbum.name,
      title: legacyAlbum.title,
      cover: AlbumCover.fromPlain(legacyAlbum.cover),
      coverMobile: AlbumCover.fromPlain(legacyAlbum.coverMobile),
      link: legacyAlbum.link,
      createdAt: legacyAlbum.createdAt,
      cullingCompleted: legacyAlbum.cullingCompleted,
      cullingHasUploads: legacyAlbum.cullingHasUploads,
      nextFaceClusterId: legacyAlbum.nextFaceClusterId,
      totalPhotos: legacyAlbum.totalPhotos,
      totalStorage: legacyAlbum.totalStorage,
      syncedMediaCount: legacyAlbum.syncedMediaCount,
      syncedStorageGb: legacyAlbum.syncedStorageGb,
    });

    await albumRepo.save(album);

    const photos = legacyAlbum.photos.map(legacyPhoto =>
      new CulledPhoto({
        photoId: legacyPhoto.photoId,
        albumId: legacyAlbum.albumId,
        file: FileAsset.fromPlain(legacyPhoto.file),
        uploadedAt: legacyPhoto.uploadedAt,
        capturedAt: legacyPhoto.capturedAt,
        perceptualHash: legacyPhoto.perceptualHash,
        status: legacyPhoto.status,
        progress: legacyPhoto.progress,
        error: legacyPhoto.error,
        analysisStatus: legacyPhoto.analysisStatus,
        analysisProgress: legacyPhoto.analysisProgress,
        analysisError: legacyPhoto.analysisError,
        faces: legacyPhoto.faces.map((f, index) =>
          Face.fromPlain({
            ...f,
            faceId: f.rekognitionFaceId ?? `${legacyPhoto.photoId}-${index}`,
          }),
        ),
        serverUploadStatus: legacyPhoto.serverUploadStatus,
        serverUploadProgress: legacyPhoto.serverUploadProgress,
        serverUploadError: legacyPhoto.serverUploadError,
        selected: legacyPhoto.selected,
        starRating: legacyPhoto.starRating,
        aiSelected: legacyPhoto.aiSelected,
        maybe: legacyPhoto.maybe,
        blurred: legacyPhoto.blurred,
        closedEyes: legacyPhoto.closedEyes,
        duplicated: legacyPhoto.duplicated,
      })
    );

    await photoRepo.saveMany(photos);
  }
}

export async function readAlbumMeta(
  albumId: string,
): Promise<LegacyCulledAlbum | null> {
  await ensureMigrated();

  const albumRepo = container.resolve<IAlbumRepository>(TOKENS.IAlbumRepository);
  const album = albumRepo.findById(albumId);
  if (!album) {
    return null;
  }

  return domainAlbumToLegacy(album, []);
}

export async function readAllAlbumMeta(): Promise<
  Record<string, LegacyCulledAlbum>
> {
  await ensureMigrated();

  const albumRepo = container.resolve<IAlbumRepository>(TOKENS.IAlbumRepository);
  const albums = albumRepo.findAll();
  const result: Record<string, LegacyCulledAlbum> = {};

  for (const album of albums) {
    result[album.albumId] = domainAlbumToLegacy(album, []);
  }

  return result;
}

export async function readAlbum(albumId: string): Promise<LegacyCulledAlbum | null> {
  await ensureMigrated();
  
  const albumRepo = container.resolve<IAlbumRepository>(TOKENS.IAlbumRepository);
  const photoRepo = container.resolve<IPhotoRepository>(TOKENS.IPhotoRepository);
  
  const album = albumRepo.findById(albumId);
  if (!album) return null;
  
  const photos = photoRepo.findByAlbum(albumId);
  const legacyPhotos = photos.map(domainPhotoToLegacy);
  
  return domainAlbumToLegacy(album, legacyPhotos);
}

export async function saveAlbum(
  album: LegacyCulledAlbum,
  options: SaveAlbumOptions = {},
): Promise<void> {
  const includePhotos = options.includePhotos ?? true;
  await ensureMigrated();

  const albumRepo = container.resolve<IAlbumRepository>(TOKENS.IAlbumRepository);
  await albumRepo.save(legacyAlbumToDomainAlbum(album));

  if (!includePhotos || album.photos.length === 0) {
    return;
  }

  const photoRepo = container.resolve<IPhotoRepository>(TOKENS.IPhotoRepository);
  await photoRepo.saveMany(legacyPhotosToDomainPhotos(album.albumId, album.photos));
}

export async function removeAlbum(albumId: string): Promise<void> {
  await ensureMigrated();
  
  const albumRepo = container.resolve<IAlbumRepository>(TOKENS.IAlbumRepository);
  await albumRepo.delete(albumId);
}
