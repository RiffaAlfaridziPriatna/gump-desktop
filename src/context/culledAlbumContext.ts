import {createContext} from 'react';
import {StateStore} from '@lib/state';
import {FileAsset} from '@services/upload/types';

export type CulledAlbumToastMode = 'upload' | 'analyze';

export type CulledAlbumUiState = {
  uploadVisible: boolean;
  analyzeVisible: boolean;
  uploadError: string | null;
  analyzeError: string | null;
  activeUploadAlbumId: string | null;
  activeAnalyzeAlbumId: string | null;
};

export type CulledAlbumActions = {
  addPhotos: (albumId: string, files: FileAsset[]) => void;
  startAnalysis: (albumId: string) => void;
  startSelectedUpload: (albumId: string, photoIds: string[]) => Promise<void>;
  purgeAlbum: (albumId: string) => Promise<void>;
  hideToast: (mode: CulledAlbumToastMode) => void;
  clearCompleted: (mode: CulledAlbumToastMode) => void;
  failNotUploadedItems: (error?: string) => void;
  failNotAnalyzedItems: (error?: string) => void;
};

export const CulledAlbumUiContext =
  createContext<StateStore<CulledAlbumUiState> | null>(null);
CulledAlbumUiContext.displayName = 'CulledAlbumUiContext';

export const CulledAlbumActionsContext =
  createContext<CulledAlbumActions | null>(null);
CulledAlbumActionsContext.displayName = 'CulledAlbumActionsContext';
