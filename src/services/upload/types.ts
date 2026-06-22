import {NativeModules} from 'react-native';

export type FileAsset = {
  uri: string;
  name: string;
  size: number;
  type: string;
};

type NativeLocalStorageReader = {
  readFileSlice: (
    uri: string,
    start: number,
    end: number,
  ) => Promise<{data: string; size: number}>;
};

const NativeLocalStorageReader = NativeModules.GumpLocalStorage as
  | NativeLocalStorageReader
  | undefined;

function mimeTypeFromExtension(ext: string): string | undefined {
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
    case 'tif':
    case 'tiff':
      return 'image/tiff';
    case 'mp4':
      return 'video/mp4';
    case 'mov':
      return 'video/quicktime';
    default:
      return undefined;
  }
}

export function getFileContentType(file: FileAsset): string {
  const type = file.type?.trim().toLowerCase() ?? '';
  if (type.startsWith('image/') || type.startsWith('video/')) {
    return type;
  }

  if (type.startsWith('public.')) {
    const fromUti = mimeTypeFromExtension(type.slice('public.'.length));
    if (fromUti) {
      return fromUti;
    }
  }

  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext) {
    const fromName = mimeTypeFromExtension(ext);
    if (fromName) {
      return fromName;
    }
  }

  return 'application/octet-stream';
}

function decodeBase64(base64: string): Uint8Array {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function readFileSliceFromFetch(
  uri: string,
  start: number,
  end: number,
): Promise<Blob> {
  const expectedSize = end - start;
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Failed to read file (${response.status})`);
  }

  const blob = await response.blob();
  if (blob.size < end) {
    throw new Error(
      `File size mismatch: expected at least ${end} bytes, got ${blob.size}`,
    );
  }

  const slice = blob.slice(start, end);
  if (slice.size !== expectedSize) {
    throw new Error(
      `File slice size mismatch: expected ${expectedSize}, got ${slice.size}`,
    );
  }

  return slice;
}

export async function readFileSlice(
  uri: string,
  start: number,
  end: number,
): Promise<Blob> {
  const expectedSize = end - start;

  if (NativeLocalStorageReader?.readFileSlice) {
    const result = await NativeLocalStorageReader.readFileSlice(uri, start, end);
    if (result.size !== expectedSize) {
      throw new Error(
        `File slice size mismatch: expected ${expectedSize}, got ${result.size}`,
      );
    }
    const bytes = decodeBase64(result.data);
    return new Blob([bytes.slice().buffer], {
      type: 'application/octet-stream',
    });
  }

  return readFileSliceFromFetch(uri, start, end);
}
