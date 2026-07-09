import {FileAsset} from '@services/upload/types';

function createUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function createCullingPhotoId(): string {
  return createUUID();
}

export function photoIdFromStoredFile(file: FileAsset): string {
  const dotIndex = file.name.lastIndexOf('.');
  if (dotIndex > 0) {
    return file.name.slice(0, dotIndex);
  }
  return file.name;
}

