import {
  QUALITY_SETTINGS,
  hasBakeableLook,
  lookKeyPart,
  stripUnsafeFileNameChars,
} from '@lib/look/bakeLook';
import {
  resolveCustomLookBake,
  type CustomLookSource,
} from '@lib/look/customLookFile';
import {resolveLookFinishing} from '@lib/look/lookCatalog';
import {LOOK_BAKE_INTENSITY, type LookId} from '@lib/look/types';
import {ensureExportStagingDirectory} from '@lib/export/nativeExport';
import {applyLookToJpeg} from '@lib/storage/localStorage';

const previewUriCache = new Map<string, string>();

function previewCacheKey(
  sourceUri: string,
  lookId: LookId,
  maxPixelSize: number,
  revision?: string,
): string {
  return `${sourceUri}|${lookKeyPart(lookId, revision)}|${LOOK_BAKE_INTENSITY}|${maxPixelSize}`;
}

async function resolvePreviewDestinationPath(
  sourceUri: string,
  lookId: LookId,
  revision?: string,
): Promise<string> {
  const staging = await ensureExportStagingDirectory();
  const settings = QUALITY_SETTINGS.preview;
  const hash = stripUnsafeFileNameChars(
    sourceUri.replace(/[^a-zA-Z0-9]+/g, '').slice(-48) || 'preview',
  );
  const fileName = `preview-${hash}-${lookKeyPart(lookId, revision)}-${LOOK_BAKE_INTENSITY}-${settings.maxPixelSize}.jpg`;
  const separator = staging.path.includes('\\') ? '\\' : '/';
  return `${staging.path}${separator}looks${separator}${fileName}`;
}

/** Sync peek of an already-baked in-app look preview (avoids Before→After blank). */
export function getCachedLookPreviewUri(
  sourceUri: string,
  lookId: LookId,
  custom?: CustomLookSource,
): string | undefined {
  const revision = lookId === 'custom' ? custom?.customLook?.revision : undefined;
  if (!sourceUri || !hasBakeableLook(lookId, revision)) {
    return undefined;
  }
  const settings = QUALITY_SETTINGS.preview;
  return previewUriCache.get(
    previewCacheKey(sourceUri, lookId, settings.maxPixelSize, revision),
  );
}

/** Display preview using the same native .cube LUT bake path as export (smaller pixel budget). */
export async function bakeLookPreviewUri(
  sourceUri: string,
  lookId: LookId,
  custom?: CustomLookSource,
): Promise<string> {
  // A 'custom' preview without a preset shows the original; no bake, nothing to report.
  const customBake =
    lookId === 'custom' && sourceUri
      ? resolveCustomLookBake(sourceUri, custom)
      : null;
  if (!sourceUri || !hasBakeableLook(lookId, customBake?.revision)) {
    return sourceUri;
  }

  const settings = QUALITY_SETTINGS.preview;
  const key = previewCacheKey(
    sourceUri,
    lookId,
    settings.maxPixelSize,
    customBake?.revision,
  );
  const cached = previewUriCache.get(key);
  if (cached) {
    return cached;
  }

  const destPath = await resolvePreviewDestinationPath(
    sourceUri,
    lookId,
    customBake?.revision,
  );
  const baked = await applyLookToJpeg({
    sourceUri,
    destPath,
    lookId,
    maxPixelSize: settings.maxPixelSize,
    jpegQuality: settings.jpegQuality,
    finishing: customBake ? customBake.finishing : resolveLookFinishing(lookId),
    lutPath: customBake?.lutPath,
  });

  if (!baked.uri) {
    throw new Error('Failed to bake look preview');
  }

  previewUriCache.set(key, baked.uri);
  return baked.uri;
}
