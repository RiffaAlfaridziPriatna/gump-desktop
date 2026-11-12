import {
  bakeLookPreviewUri,
  getCachedLookPreviewUri,
} from '@lib/look/bakeLook';
import {hasAppliedLook, type LookId} from '@lib/look/types';
import {getErrorMessage} from '@lib/observability';
import {memo, useEffect, useState} from 'react';
import {
  Image,
  type ImageErrorEventData,
  type ImageLoadEventData,
  type ImageStyle,
  type NativeSyntheticEvent,
  type StyleProp,
} from 'react-native';

type LookPreviewImageProps = {
  /** Oriented display URI (thumb/detail). Used when look is original. */
  uri: string;
  /**
   * Optional bake source (album master). Prefer this for LUT bake when display
   * URI is an oriented derivative — Windows Image cannot EXIF-rotate masters.
   */
  bakeSourceUri?: string | null;
  lookId?: LookId | null;
  style?: StyleProp<ImageStyle>;
  onLoad?: (event: NativeSyntheticEvent<ImageLoadEventData>) => void;
  onError?: (event: NativeSyntheticEvent<ImageErrorEventData>) => void;
};

const PREVIEW_DEBOUNCE_MS = 90;

/**
 * In-app look preview via the same native .cube LUT bake used for Export/Upload.
 * First paint of a look holds gray until bake is ready. Later toggles keep the
 * previous frame (e.g. Before) until After arrives — clearing caused flicker.
 */
export const LookPreviewImage = memo(function LookPreviewImage({
  uri,
  bakeSourceUri,
  lookId = 'original',
  style,
  onLoad,
  onError,
}: LookPreviewImageProps) {
  const bakeUri = bakeSourceUri || uri;
  const needsLookBake = Boolean(bakeUri) && hasAppliedLook(lookId);
  const [displayUri, setDisplayUri] = useState(() => {
    if (!needsLookBake) {
      return uri;
    }
    return getCachedLookPreviewUri(bakeUri, lookId!) ?? '';
  });

  useEffect(() => {
    if (!uri || !hasAppliedLook(lookId)) {
      setDisplayUri(uri);
      return;
    }

    const cached = getCachedLookPreviewUri(bakeUri, lookId);
    if (cached) {
      setDisplayUri(cached);
      return;
    }

    // Keep the current frame until bake finishes (Before→After, look switch).
    let cancelled = false;
    const timer = setTimeout(() => {
      bakeLookPreviewUri(bakeUri, lookId)
        .then(bakedUri => {
          if (!cancelled && bakedUri) {
            setDisplayUri(bakedUri);
          }
        })
        .catch(error => {
          let detail = getErrorMessage(error);
          if (!detail && error && typeof error === 'object') {
            try {
              detail = JSON.stringify(error);
            } catch {
              detail = Object.prototype.toString.call(error);
            }
          }
          console.warn(
            '[LookPreviewImage] LUT preview bake failed:',
            detail || 'unknown error',
          );
        });
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [bakeUri, lookId, uri]);

  if (!uri || !displayUri) {
    return null;
  }

  return (
    <Image
      source={{uri: displayUri}}
      style={style}
      onLoad={onLoad}
      onError={onError}
    />
  );
});
