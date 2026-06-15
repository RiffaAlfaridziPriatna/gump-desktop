import {FileAsset} from '@services/upload/types';
import {NativeModules, Platform} from 'react-native';

type NativeFilePickerModule = {
  pickImages: () => Promise<
    Array<{
      uri: string;
      name: string;
      size: number;
      type: string;
    }>
  >;
};

const NativeFilePicker = NativeModules.GumpFilePicker as
  | NativeFilePickerModule
  | undefined;

export async function pickImages(): Promise<FileAsset[]> {
  if (Platform.OS === 'macos' && NativeFilePicker?.pickImages) {
    return NativeFilePicker.pickImages();
  }

  throw new Error(
    'Image picker is not available. Build the macOS app with GumpFilePicker native module.',
  );
}
