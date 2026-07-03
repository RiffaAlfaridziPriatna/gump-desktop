import {createContext} from 'react';
import {StateStore} from '@lib/state';
import {FileAsset} from '@services/upload/types';

export type CulledAlbumToastMode = 'upload' | 'analyze' | 'serverUpload';

export type CulledAlbumUiState = {
  uploadError: string | null;
  analyzeError: string | null;
};

export type CulledAlbumActions = {
  addPhotos: (albumId: string, files: FileAsset[]) => void;
  startAnalysis: (albumId: string) => void;
  startSelectedUpload: (albumId: string, photoIds: string[]) => void;
  purgeAlbum: (albumId: string) => Promise<void>;
  hideToast: (mode: CulledAlbumToastMode, albumId: string) => void;
  clearCompleted: (mode: CulledAlbumToastMode, albumId: string) => void;
  failNotUploadedItems: (albumId: string, error?: string) => void;
  failNotAnalyzedItems: (albumId: string, error?: string) => void;
};

export const CulledAlbumUiContext =
  createContext<StateStore<CulledAlbumUiState> | null>(null);
CulledAlbumUiContext.displayName = 'CulledAlbumUiContext';

export const CulledAlbumActionsContext =
  createContext<CulledAlbumActions | null>(null);
CulledAlbumActionsContext.displayName = 'CulledAlbumActionsContext';
