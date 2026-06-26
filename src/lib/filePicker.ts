import {FileAsset} from '@services/upload/types';
import {filterSupportedCullingImages} from '@lib/supportedImageFormats';
import {NativeModules} from 'react-native';
import {launchImageLibrary, Asset} from 'react-native-image-picker';
import {isDesktopPlatform, isMobilePlatform} from '@lib/platform';

type NativeFilePickerModule = {
  pickImages: () => Promise<
    Array<{uri: string; name: string; size: number; type: string}>
  >;
};

const NativeFilePicker = NativeModules.GumpFilePicker as
  | NativeFilePickerModule
  | undefined;

function mapImagePickerAsset(asset: Asset): FileAsset | null {
  if (!asset.uri || !asset.fileName) return null;
  return {
    uri: asset.uri,
    name: asset.fileName,
    size: asset.fileSize ?? 0,
    type: asset.type ?? 'image/jpeg',
  };
}

async function pickImagesWithImagePicker(): Promise<FileAsset[]> {
  const result = await launchImageLibrary({
    mediaType: 'photo',
    selectionLimit: 0,
    includeBase64: false,
  });

  if (result.didCancel || !result.assets) {
    return [];
  }

  return result.assets
    .map(mapImagePickerAsset)
    .filter((asset): asset is FileAsset => asset !== null);
}

export async function pickImages(): Promise<FileAsset[]> {
  if (isDesktopPlatform() && NativeFilePicker?.pickImages) {
    const files = await NativeFilePicker.pickImages();
    return filterSupportedCullingImages(files);
  }

  if (isMobilePlatform()) {
    const files = await pickImagesWithImagePicker();
    return filterSupportedCullingImages(files);
  }

  throw new Error('Image picker is not available on this platform.');
}
