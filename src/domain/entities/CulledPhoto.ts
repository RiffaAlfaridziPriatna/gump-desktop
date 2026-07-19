import {FileAsset} from '../valueObjects/FileAsset';
import {Face} from '../valueObjects/Face';
import {AnalysisStatus, UploadStatus, ServerUploadStatus} from '../valueObjects/Status';

export class CulledPhoto {
  readonly photoId: string;
  readonly albumId: string;
  readonly file: FileAsset;
  readonly uploadedAt: number;
  readonly capturedAt: number | null;

  private _perceptualHash: string | null;
  private _status: UploadStatus;
  private _progress: number;
  private _error: string | null;

  private _analysisStatus: AnalysisStatus;
  private _analysisProgress: number;
  private _analysisError: string | null;
  private _analysisEngineVersion: string | null;
  private _faces: Face[];

  private _serverUploadStatus: ServerUploadStatus;
  private _serverUploadProgress: number;
  private _serverUploadError: string | null;

  private _selected: boolean;
  private _starRating: number | null;
  private _aiSelected: boolean;
  private _maybe: boolean;
  private _blurred: boolean;
  private _closedEyes: boolean;
  private _duplicated: boolean;

  constructor(data: {
    photoId: string;
    albumId: string;
    file: FileAsset;
    uploadedAt?: number;
    capturedAt?: number | null;
    perceptualHash?: string | null;
    status?: UploadStatus;
    progress?: number;
    error?: string | null;
    analysisStatus?: AnalysisStatus;
    analysisProgress?: number;
    analysisError?: string | null;
    analysisEngineVersion?: string | null;
    faces?: Face[];
    serverUploadStatus?: ServerUploadStatus;
    serverUploadProgress?: number;
    serverUploadError?: string | null;
    selected?: boolean;
    starRating?: number | null;
    aiSelected?: boolean;
    maybe?: boolean;
    blurred?: boolean;
    closedEyes?: boolean;
    duplicated?: boolean;
  }) {
    this.photoId = data.photoId;
    this.albumId = data.albumId;
    this.file = data.file;
    this.uploadedAt = data.uploadedAt ?? Date.now();
    this.capturedAt = data.capturedAt ?? null;

    this._perceptualHash = data.perceptualHash ?? null;
    this._status = data.status ?? 'pending';
    this._progress = data.progress ?? 0;
    this._error = data.error ?? null;

    this._analysisStatus = data.analysisStatus ?? 'idle';
    this._analysisProgress = data.analysisProgress ?? 0;
    this._analysisError = data.analysisError ?? null;
    this._analysisEngineVersion = data.analysisEngineVersion ?? null;
    this._faces = data.faces ?? [];

    this._serverUploadStatus = data.serverUploadStatus ?? 'idle';
    this._serverUploadProgress = data.serverUploadProgress ?? 0;
    this._serverUploadError = data.serverUploadError ?? null;

    this._selected = data.selected ?? false;
    this._starRating = data.starRating ?? null;
    this._aiSelected = data.aiSelected ?? false;
    this._maybe = data.maybe ?? false;
    this._blurred = data.blurred ?? false;
    this._closedEyes = data.closedEyes ?? false;
    this._duplicated = data.duplicated ?? false;
  }

  get perceptualHash(): string | null {
    return this._perceptualHash;
  }

  get status(): UploadStatus {
    return this._status;
  }

  get progress(): number {
    return this._progress;
  }

  get error(): string | null {
    return this._error;
  }

  get analysisStatus(): AnalysisStatus {
    return this._analysisStatus;
  }

  get analysisProgress(): number {
    return this._analysisProgress;
  }

  get analysisError(): string | null {
    return this._analysisError;
  }

  get analysisEngineVersion(): string | null {
    return this._analysisEngineVersion;
  }

  get faces(): Face[] {
    return [...this._faces];
  }

  get serverUploadStatus(): ServerUploadStatus {
    return this._serverUploadStatus;
  }

  get serverUploadProgress(): number {
    return this._serverUploadProgress;
  }

  get serverUploadError(): string | null {
    return this._serverUploadError;
  }

  get selected(): boolean {
    return this._selected;
  }

  get starRating(): number | null {
    return this._starRating;
  }

  get aiSelected(): boolean {
    return this._aiSelected;
  }

  get maybe(): boolean {
    return this._maybe;
  }

  get blurred(): boolean {
    return this._blurred;
  }

  get closedEyes(): boolean {
    return this._closedEyes;
  }

  get duplicated(): boolean {
    return this._duplicated;
  }

  markUploading(progress: number): void {
    this._status = 'uploading';
    this._progress = progress;
    this._error = null;
  }

  markUploaded(): void {
    this._status = 'uploaded';
    this._progress = 100;
    this._error = null;
  }

  markUploadFailed(error: string): void {
    this._status = 'failed';
    this._error = error;
  }

  setPerceptualHash(hash: string): void {
    this._perceptualHash = hash;
  }

  startAnalysis(): void {
    this._analysisStatus = 'analyzing';
    this._analysisProgress = 0;
    this._analysisError = null;
  }

  updateAnalysisProgress(progress: number): void {
    this._analysisProgress = Math.min(100, Math.max(0, progress));
  }

  markAnalyzed(faces: Face[], aiFlags: {
    aiSelected: boolean;
    maybe: boolean;
    blurred: boolean;
    closedEyes: boolean;
  }, analysisEngineVersion?: string | null): void {
    this._faces = faces;
    this._analysisStatus = 'analyzed';
    this._analysisProgress = 100;
    this._analysisError = null;
    this._analysisEngineVersion = analysisEngineVersion ?? this._analysisEngineVersion;
    this._aiSelected = aiFlags.aiSelected;
    this._maybe = aiFlags.maybe;
    this._blurred = aiFlags.blurred;
    this._closedEyes = aiFlags.closedEyes;
  }

  markAnalysisFailed(error: string): void {
    this._analysisStatus = 'failed';
    this._analysisError = error;
  }

  markAsDuplicate(): void {
    this._duplicated = true;
  }

  toggleSelection(): void {
    this._selected = !this._selected;
  }

  setStarRating(rating: number | null): void {
    this._starRating = rating;
  }

  startServerUpload(): void {
    this._serverUploadStatus = 'uploading';
    this._serverUploadProgress = 0;
    this._serverUploadError = null;
  }

  updateServerUploadProgress(progress: number): void {
    this._serverUploadProgress = Math.min(100, Math.max(0, progress));
  }

  markServerUploaded(): void {
    this._serverUploadStatus = 'uploaded';
    this._serverUploadProgress = 100;
    this._serverUploadError = null;
  }

  markServerUploadFailed(error: string): void {
    this._serverUploadStatus = 'failed';
    this._serverUploadError = error;
  }

  isUploadInFlight(): boolean {
    return this._status === 'pending' || this._status === 'uploading';
  }

  isAnalysisInFlight(): boolean {
    return this._analysisStatus === 'pending' || this._analysisStatus === 'analyzing';
  }

  isServerUploadInFlight(): boolean {
    return this._serverUploadStatus === 'pending' || this._serverUploadStatus === 'uploading';
  }

  toPlain(): any {
    return {
      photoId: this.photoId,
      file: this.file.toPlain(),
      uploadedAt: this.uploadedAt,
      capturedAt: this.capturedAt,
      perceptualHash: this._perceptualHash,
      progress: this._progress,
      status: this._status,
      error: this._error,
      analysisProgress: this._analysisProgress,
      analysisStatus: this._analysisStatus,
      analysisError: this._analysisError,
      analysisEngineVersion: this._analysisEngineVersion,
      faces: this._faces.map(f => f.toPlain()),
      serverUploadStatus: this._serverUploadStatus,
      serverUploadProgress: this._serverUploadProgress,
      serverUploadError: this._serverUploadError,
      selected: this._selected,
      starRating: this._starRating,
      aiSelected: this._aiSelected,
      maybe: this._maybe,
      blurred: this._blurred,
      closedEyes: this._closedEyes,
      duplicated: this._duplicated,
    };
  }

  static fromPlain(albumId: string, data: any): CulledPhoto {
    return new CulledPhoto({
      photoId: data.photoId,
      albumId,
      file: FileAsset.fromPlain(data.file),
      uploadedAt: data.uploadedAt,
      capturedAt: data.capturedAt,
      perceptualHash: data.perceptualHash,
      status: data.status,
      progress: data.progress,
      error: data.error,
      analysisStatus: data.analysisStatus,
      analysisProgress: data.analysisProgress,
      analysisError: data.analysisError,
      analysisEngineVersion: data.analysisEngineVersion,
      faces: (data.faces || []).map(Face.fromPlain),
      serverUploadStatus: data.serverUploadStatus,
      serverUploadProgress: data.serverUploadProgress,
      serverUploadError: data.serverUploadError,
      selected: data.selected,
      starRating: data.starRating,
      aiSelected: data.aiSelected,
      maybe: data.maybe,
      blurred: data.blurred,
      closedEyes: data.closedEyes,
      duplicated: data.duplicated,
    });
  }
}
