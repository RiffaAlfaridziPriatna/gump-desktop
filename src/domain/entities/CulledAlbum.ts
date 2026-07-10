export class AlbumCover {
  readonly thumbnail: string | null;
  readonly small: string | null;
  readonly medium: string | null;
  readonly large: string | null;

  constructor(data: {
    thumbnail?: string | null;
    small?: string | null;
    medium?: string | null;
    large?: string | null;
  }) {
    this.thumbnail = data.thumbnail ?? null;
    this.small = data.small ?? null;
    this.medium = data.medium ?? null;
    this.large = data.large ?? null;
  }

  static fromPlain(data: any): AlbumCover {
    if (!data) {
      return new AlbumCover({});
    }
    return new AlbumCover(data);
  }

  toPlain(): any {
    return {
      thumbnail: this.thumbnail,
      small: this.small,
      medium: this.medium,
      large: this.large,
    };
  }
}

export class CulledAlbum {
  readonly albumId: string;
  readonly name: string;
  readonly title: string | null;
  readonly cover: AlbumCover;
  readonly coverMobile: AlbumCover;
  readonly link: string;
  readonly createdAt: string;

  private _cullingCompleted: boolean;
  private _cullingHasUploads: boolean;
  private _nextFaceClusterId: number;
  private _totalPhotos: number;
  private _totalStorage: number;
  private _syncedMediaCount: number | null;
  private _syncedStorageGb: number | null;
  private _cullingStats: Record<string, number> | null;
  private _cullingKeyFaces: unknown[] | null;

  constructor(data: {
    albumId: string;
    name: string;
    title?: string | null;
    cover: AlbumCover;
    coverMobile: AlbumCover;
    link: string;
    createdAt?: string;
    cullingCompleted?: boolean;
    cullingHasUploads?: boolean;
    nextFaceClusterId?: number;
    totalPhotos?: number;
    totalStorage?: number;
    syncedMediaCount?: number | null;
    syncedStorageGb?: number | null;
    cullingStats?: Record<string, number> | null;
    cullingKeyFaces?: unknown[] | null;
  }) {
    this.albumId = data.albumId;
    this.name = data.name;
    this.title = data.title ?? null;
    this.cover = data.cover;
    this.coverMobile = data.coverMobile;
    this.link = data.link;
    this.createdAt = data.createdAt ?? new Date().toISOString();

    this._cullingCompleted = data.cullingCompleted ?? false;
    this._cullingHasUploads = data.cullingHasUploads ?? false;
    this._nextFaceClusterId = data.nextFaceClusterId ?? 0;
    this._totalPhotos = data.totalPhotos ?? 0;
    this._totalStorage = data.totalStorage ?? 0;
    this._syncedMediaCount = data.syncedMediaCount ?? null;
    this._syncedStorageGb = data.syncedStorageGb ?? null;
    this._cullingStats = data.cullingStats ?? null;
    this._cullingKeyFaces = data.cullingKeyFaces ?? null;
  }

  get cullingCompleted(): boolean {
    return this._cullingCompleted;
  }

  get cullingHasUploads(): boolean {
    return this._cullingHasUploads;
  }

  get nextFaceClusterId(): number {
    return this._nextFaceClusterId;
  }

  get totalPhotos(): number {
    return this._totalPhotos;
  }

  get totalStorage(): number {
    return this._totalStorage;
  }

  get syncedMediaCount(): number | null {
    return this._syncedMediaCount;
  }

  get syncedStorageGb(): number | null {
    return this._syncedStorageGb;
  }

  get cullingStats(): Record<string, number> | null {
    return this._cullingStats;
  }

  get cullingKeyFaces(): unknown[] | null {
    return this._cullingKeyFaces;
  }

  markCullingCompleted(): void {
    this._cullingCompleted = true;
  }

  setCullingSummary(
    stats: Record<string, number> | null,
    keyFaces: unknown[] | null,
  ): void {
    this._cullingStats = stats;
    this._cullingKeyFaces = keyFaces;
  }

  markHasUploads(): void {
    this._cullingHasUploads = true;
  }

  incrementFaceClusterId(): number {
    const current = this._nextFaceClusterId;
    this._nextFaceClusterId += 1;
    return current;
  }

  updateTotals(photoCount: number, storageBytes: number): void {
    this._totalPhotos = photoCount;
    this._totalStorage = storageBytes;
  }

  updateSyncedData(mediaCount: number, storageGb: number): void {
    this._syncedMediaCount = mediaCount;
    this._syncedStorageGb = storageGb;
  }

  toPlain(): any {
    return {
      albumId: this.albumId,
      name: this.name,
      title: this.title,
      cover: this.cover.toPlain(),
      coverMobile: this.coverMobile.toPlain(),
      link: this.link,
      createdAt: this.createdAt,
      cullingCompleted: this._cullingCompleted,
      cullingHasUploads: this._cullingHasUploads,
      nextFaceClusterId: this._nextFaceClusterId,
      totalPhotos: this._totalPhotos,
      totalStorage: this._totalStorage,
      syncedMediaCount: this._syncedMediaCount,
      syncedStorageGb: this._syncedStorageGb,
      cullingStats: this._cullingStats,
      cullingKeyFaces: this._cullingKeyFaces,
    };
  }

  static fromPlain(data: any): CulledAlbum {
    return new CulledAlbum({
      albumId: data.albumId || data.id,
      name: data.name,
      title: data.title,
      cover: AlbumCover.fromPlain(data.cover),
      coverMobile: AlbumCover.fromPlain(data.coverMobile),
      link: data.link,
      createdAt: data.createdAt,
      cullingCompleted: data.cullingCompleted,
      cullingHasUploads: data.cullingHasUploads,
      nextFaceClusterId: data.nextFaceClusterId,
      totalPhotos: data.totalPhotos,
      totalStorage: data.totalStorage,
      syncedMediaCount: data.syncedMediaCount,
      syncedStorageGb: data.syncedStorageGb,
      cullingStats: data.cullingStats ?? null,
      cullingKeyFaces: data.cullingKeyFaces ?? null,
    });
  }
}
