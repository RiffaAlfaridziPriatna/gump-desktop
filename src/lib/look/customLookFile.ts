import {toNativeFinishing} from '@lib/look/developToLut';
import type {CustomLook, NativeLookFinishing} from '@lib/look/types';
import {normalizeNativeFileUri} from '@lib/storage/localStorage';

const CULLING_ALBUMS_DIR = 'culling-albums';

/** One file per revision, so a native path cache never serves a replaced preset. */
export function customLookFileName(revision: string): string {
  return `custom-${revision}.cube`;
}

/** Safe for `CustomLook.revision` (`[A-Za-z0-9_-]`). */
export function createCustomLookRevision(now = Date.now()): string {
  return `${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Absolute `.cube` path of the album's preset, derived from any file inside
 * `culling-albums/<albumId>/` (photo copy, thumbnail, detail). Null when the
 * file is not inside that folder.
 * shortcut: JS has no API for the culling-albums root; add a native getter if
 * album files ever move out of that folder.
 */
export function customLookFilePath(
  albumFileUri: string,
  albumId: string,
  revision: string,
): string | null {
  let path = normalizeNativeFileUri(albumFileUri).replace(/\\/g, '/');
  if (path.toLowerCase().startsWith('file://')) {
    path = path.slice('file://'.length);
    if (/^\/[a-zA-Z]:/.test(path)) {
      path = path.slice(1);
    }
  }
  const marker = `/${CULLING_ALBUMS_DIR}/${albumId}/`;
  const index = path.lastIndexOf(marker);
  if (index < 0) {
    return null;
  }
  return `${path.slice(0, index + marker.length)}looks/${customLookFileName(revision)}`;
}

/** What a `'custom'` bake needs from the album; `customLook` null = no preset. */
export type CustomLookSource = {albumId: string; customLook: CustomLook | null};

export type CustomLookBake = {
  revision: string;
  lutPath: string;
  finishing?: NativeLookFinishing;
};

/**
 * Native inputs for a `'custom'` bake of a file inside the album folder.
 * Null when the album has no preset (the caller bakes as original and reports).
 */
export function resolveCustomLookBake(
  albumFileUri: string,
  source: CustomLookSource | undefined,
): CustomLookBake | null {
  const customLook = source?.customLook;
  if (!source || !customLook) {
    return null;
  }
  const lutPath = customLookFilePath(
    albumFileUri,
    source.albumId,
    customLook.revision,
  );
  if (!lutPath) {
    throw new Error('Custom look source file is outside the album folder');
  }
  return {
    revision: customLook.revision,
    lutPath,
    finishing: customLook.finishing
      ? toNativeFinishing(customLook.finishing)
      : undefined,
  };
}
