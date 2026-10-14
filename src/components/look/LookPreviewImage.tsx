import {bakeLookPreviewUri} from '@lib/look/bakeLook';
import {
  DEFAULT_LOOK_INTENSITY,
  hasAppliedLook,
  type LookId,
} from '@lib/look/types';
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
  /** Oriented display URI (thumb/detail). Used when look is original / intensity 0. */
  uri: string;
  /**
   * Optional bake source (album master). Prefer this for LUT bake when display
   * URI is an oriented derivative — Windows Image cannot EXIF-rotate masters.
   */
  bakeSourceUri?: string | null;
  lookId?: LookId | null;
  lookIntensity?: number | null;
  style?: StyleProp<ImageStyle>;
  onLoad?: (event: NativeSyntheticEvent<ImageLoadEventData>) => void;
  onError?: (event: NativeSyntheticEvent<ImageErrorEventData>) => void;
};

const PREVIEW_DEBOUNCE_MS = 90;

/**
 * In-app look preview via the same native .cube LUT bake used for Export/Upload.
 * When a look is applied, holds gray (renders nothing) until the baked URI is
 * ready — never paints the ungraded source first (avoids original→look flash).
 */
export const LookPreviewImage = memo(function LookPreviewImage({
  uri,
  bakeSourceUri,
  lookId = 'original',
  lookIntensity = DEFAULT_LOOK_INTENSITY,
  style,
  onLoad,
  onError,
}: LookPreviewImageProps) {
  const intensity = lookIntensity ?? DEFAULT_LOOK_INTENSITY;
  const bakeUri = bakeSourceUri || uri;
  const needsLookBake =
    Boolean(bakeUri) && hasAppliedLook(lookId) && intensity > 0;
  const [displayUri, setDisplayUri] = useState(() =>
    needsLookBake ? '' : uri,
  );

  useEffect(() => {
    if (!uri || !hasAppliedLook(lookId) || intensity <= 0) {
      setDisplayUri(uri);
      return;
    }

    // Hold empty until bake finishes — do not show ungraded source.
    setDisplayUri('');
    let cancelled = false;
    const timer = setTimeout(() => {
      bakeLookPreviewUri(bakeUri, lookId, intensity)
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
  }, [bakeUri, intensity, lookId, uri]);

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
