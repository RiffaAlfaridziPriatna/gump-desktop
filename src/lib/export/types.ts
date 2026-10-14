export type ExportQuality = 'compressed' | 'original';

export type ExportFormat = 'zip';

export type ExportDirectoryInfo = {
  path: string;
  displayPath: string;
};

export type ExportZipEntry = {
  uri: string;
  name: string;
};

export type ExportZipResult = {
  path: string;
  uri: string;
  fileName: string;
  byteSize: number;
  displayPath: string;
  photoCount: number;
};

export type ExportPhotosModalStep =
  | 'options'
  | 'applyingLook'
  | 'preparing'
  | 'ready'
  | 'success'
  | 'failed';
