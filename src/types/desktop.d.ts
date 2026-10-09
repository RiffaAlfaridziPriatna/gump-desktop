import 'react-native';

declare module 'react-native' {
  interface ViewStyle {
    cursor?: 'auto' | 'pointer';
    userSelect?: 'none' | 'auto' | 'text' | 'all';
  }

  interface ViewProps {
    /** Windows-only: system keyboard/mouse focus rectangle. */
    enableFocusRing?: boolean;
    /** Windows-only: receive keyboard/controller focus. */
    focusable?: boolean;
    tabIndex?: number | 0 | -1;
    onClick?: (event: unknown) => void;
    onMouseEnter?: (event: unknown) => void;
    onMouseLeave?: (event: unknown) => void;
    onKeyDown?: (event: unknown) => void;
    keyDownEvents?: Array<{key?: string; code?: string}>;
  }

  interface TextInputProps {
    enableFocusRing?: boolean;
  }

  interface NativeModulesStatic {
    GumpScrollView?: {
      scrollToOffset: (
        reactTag: number,
        offsetY: number,
      ) => Promise<Record<string, unknown>>;
    };
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
    GumpLocalStorage?: {
      copyPhoto: (
        albumId: string,
        sourceUri: string,
        fileName: string,
        photoId: string,
      ) => Promise<{
        uri: string;
        name: string;
        size: number;
        type: string;
        /** Required on macOS/Windows after local copy succeeds. */
        thumbnailUri: string;
        thumbnailWidth?: number;
        thumbnailHeight?: number;
      }>;
      getThumbnailUri: (
        albumId: string,
        photoId: string,
      ) => Promise<string | null>;
      ensureThumbnail: (
        albumId: string,
        sourceUri: string,
        photoId: string,
      ) => Promise<{
        thumbnailUri: string | null;
        thumbnailWidth?: number | null;
        thumbnailHeight?: number | null;
      }>;
      ensureDetail: (
        albumId: string,
        sourceUri: string,
        photoId: string,
      ) => Promise<{detailUri: string | null}>;
      deleteAlbum: (albumId: string) => Promise<boolean>;
      deletePhoto: (uri: string) => Promise<boolean>;
      readFileSlice: (
        uri: string,
        start: number,
        end: number,
      ) => Promise<{data: string; size: number}>;
    };
  }
}
