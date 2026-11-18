import type {CustomLookSource} from '@lib/look/customLookFile';
import {createContext, useContext} from 'react';

/**
 * The album preset for `'custom'` look previews below a screen. The screen
 * derives the value from the culledAlbum store, so grid cells read it without
 * subscribing to that store. Undefined outside a provider: custom previews
 * show the original.
 */
export const AlbumCustomLookContext = createContext<
  CustomLookSource | undefined
>(undefined);
AlbumCustomLookContext.displayName = 'AlbumCustomLookContext';

export function useAlbumCustomLookSource(): CustomLookSource | undefined {
  return useContext(AlbumCustomLookContext);
}
