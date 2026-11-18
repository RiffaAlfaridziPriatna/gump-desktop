import {parseCustomLook} from '@domain/valueObjects/LookFinishing';
import {setAlbumCustomLook} from '@lib/culledAlbum/store';
import {parseCube} from '@lib/look/cubeParser';
import {
  createCustomLookRevision,
  customLookFileName,
} from '@lib/look/customLookFile';
import {buildLut, splitFinishing} from '@lib/look/developToLut';
import type {CustomLook, LookFinishing} from '@lib/look/types';
import {whenUploadLookBakeReady} from '@lib/look/uploadLookBake';
import {parseXmpPreset} from '@lib/look/xmpParser';
import {pickLookPresetFile} from '@lib/media/filePicker';
import {captureAppEvent} from '@lib/observability/posthogClient';
import {reportError} from '@lib/observability/reportError';
import {
  deleteLocalPhotoFile,
  readLocalTextFile,
  writeAlbumLookFile,
} from '@lib/storage/localStorage';

export type ImportPresetErrorReason = 'unsupported' | 'unreadable';

export type ImportAlbumPresetResult =
  | {status: 'cancelled'}
  | {status: 'imported'; customLook: CustomLook}
  | {status: 'failed'; reason: ImportPresetErrorReason};

/** Byte cap before decoding; the parsers cap UTF-16 length only. */
export const MAX_PRESET_BYTES = 16 * 1024 * 1024;

type BuiltPreset = {lutText: string; finishing: LookFinishing | null};

/** Parser and pre-read rejections; native and persist errors pass through as-is. */
class PresetImportError extends Error {
  constructor(readonly reason: ImportPresetErrorReason, message: string) {
    super(message);
    this.name = 'PresetImportError';
  }
}

function splitFileName(fileName: string): {base: string; extension: string} {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) {
    return {base: fileName, extension: ''};
  }
  return {
    base: fileName.slice(0, dot),
    extension: fileName.slice(dot + 1).toLowerCase(),
  };
}

function buildPreset(
  extension: string,
  text: string,
  albumId: string,
): BuiltPreset {
  if (extension === 'cube') {
    const cube = parseCube(text);
    if (!cube.ok) {
      throw new PresetImportError(cube.reason, 'Preset .cube rejected');
    }
    return {lutText: cube.canonicalText, finishing: null};
  }
  const xmp = parseXmpPreset(text);
  if (!xmp.ok) {
    throw new PresetImportError(xmp.reason, 'Preset .xmp rejected');
  }
  if (xmp.ignored.length > 0) {
    captureAppEvent('look_preset_fields_ignored', {
      albumId,
      fields: xmp.ignored.join(','),
    });
  }
  return {
    lutText: buildLut(xmp.settings),
    finishing: splitFinishing(xmp.settings),
  };
}

async function deleteReplacedFile(
  newPath: string,
  revision: string,
  previous: CustomLook,
  albumId: string,
): Promise<void> {
  const newName = customLookFileName(revision);
  const oldPath = `${newPath.slice(0, newPath.length - newName.length)}${customLookFileName(previous.revision)}`;
  try {
    await deleteLocalPhotoFile(oldPath);
  } catch (error) {
    // The new preset is already saved; a stale file only costs disk space.
    reportError(error, {
      source: 'import_album_preset',
      step: 'deleteOldRevision',
      albumId,
    });
  }
}

/**
 * Pick → read → parse (the only validation boundary) → write the canonical
 * `.cube` → replace `album.customLook` → delete the replaced revision file.
 * Any failure keeps the previous preset; cancel is not an error.
 */
export async function importAlbumPreset(
  albumId: string,
): Promise<ImportAlbumPresetResult> {
  // Parser details can quote file content, so logs carry only these fields.
  const context: Record<string, string | number> = {
    source: 'import_album_preset',
    albumId,
  };
  let step = 'pick';
  let writtenPath: string | null = null;
  try {
    const file = await pickLookPresetFile();
    if (!file) {
      return {status: 'cancelled'};
    }
    const {base, extension} = splitFileName(file.name);
    context.extension = extension;
    context.size = file.size;
    step = 'validate';
    if (extension !== 'cube' && extension !== 'xmp') {
      throw new PresetImportError('unsupported', 'Preset is not .xmp or .cube');
    }
    if (file.size > MAX_PRESET_BYTES) {
      throw new PresetImportError('unreadable', 'Preset is larger than 16 MB');
    }
    step = 'read';
    const text = await readLocalTextFile(file.uri, file.size);
    step = 'parse';
    const preset = buildPreset(extension, text, albumId);
    // Same rule the album applies on load, so the saved preset survives a restart.
    const customLook = parseCustomLook({
      name: base,
      revision: createCustomLookRevision(),
      finishing: preset.finishing,
    });
    if (!customLook) {
      throw new PresetImportError('unsupported', 'Preset file name is empty');
    }
    step = 'write';
    writtenPath = await writeAlbumLookFile(
      albumId,
      customLookFileName(customLook.revision),
      preset.lutText,
    );
    step = 'save';
    const previous = await setAlbumCustomLook(albumId, customLook);
    if (previous) {
      const newPath = writtenPath;
      // An upload bake in flight read the old preset; keep its file until it ends.
      // shortcut: clearUploadLookBake drops the listener, leaving the old file until album delete.
      whenUploadLookBakeReady(albumId, () => {
        deleteReplacedFile(newPath, customLook.revision, previous, albumId);
      });
    }
    return {status: 'imported', customLook};
  } catch (error) {
    const reason: ImportPresetErrorReason =
      error instanceof PresetImportError ? error.reason : 'unreadable';
    // reportError dedupes, so a persist error already logged by the store is not logged twice.
    reportError(error, {...context, reason, step});
    if (writtenPath && step === 'save') {
      await deleteLocalPhotoFile(writtenPath).catch((cleanupError: unknown) =>
        reportError(cleanupError, {...context, step: 'deleteUnsavedRevision'}),
      );
    }
    return {status: 'failed', reason};
  }
}
