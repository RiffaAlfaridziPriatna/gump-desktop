export type FileAsset = {
  uri: string;
  name: string;
  size: number;
  type: string;
};

export function getFileContentType(file: FileAsset): string {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'heic':
      return 'image/heic';
    case 'mp4':
      return 'video/mp4';
    case 'mov':
      return 'video/quicktime';
    default:
      return 'application/octet-stream';
  }
}

export async function readFileSlice(
  uri: string,
  start: number,
  end: number,
): Promise<Blob> {
  const response = await fetch(uri);
  const blob = await response.blob();
  return blob.slice(start, end);
}
