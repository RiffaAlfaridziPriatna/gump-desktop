import 'react-native';

declare module 'react-native' {
  interface TextInputProps {
    enableFocusRing?: boolean;
  }

  interface NativeModulesStatic {
    GumpFilePicker?: {
      pickImages: () => Promise<
        Array<{
          uri: string;
          name: string;
          size: number;
          type: string;
        }>
      >;
    };
  }
}
