import {bakeLookPreviewUri} from '@lib/look/bakeLook';
import {
  DEFAULT_LOOK_INTENSITY,
  hasAppliedLook,
  type LookId,
} from '@lib/look/types';
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
  uri: string;
  lookId?: LookId | null;
  lookIntensity?: number | null;
  style?: StyleProp<ImageStyle>;
  onLoad?: (event: NativeSyntheticEvent<ImageLoadEventData>) => void;
  onError?: (event: NativeSyntheticEvent<ImageErrorEventData>) => void;
};

const PREVIEW_DEBOUNCE_MS = 90;

/**
 * In-app look preview via the same native .cube LUT bake used for Export/Upload.
 * Falls back to the source URI while baking / if bake is unavailable.
 */
export const LookPreviewImage = memo(function LookPreviewImage({
  uri,
  lookId = 'original',
  lookIntensity = DEFAULT_LOOK_INTENSITY,
  style,
  onLoad,
  onError,
}: LookPreviewImageProps) {
  const intensity = lookIntensity ?? DEFAULT_LOOK_INTENSITY;
  const [displayUri, setDisplayUri] = useState(uri);

  useEffect(() => {
    setDisplayUri(uri);
    if (!uri || !hasAppliedLook(lookId) || intensity <= 0) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      bakeLookPreviewUri(uri, lookId, intensity)
        .then(bakedUri => {
          if (!cancelled && bakedUri) {
            setDisplayUri(bakedUri);
          }
        })
        .catch(error => {
          console.warn('[LookPreviewImage] LUT preview bake failed', error);
        });
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [intensity, lookId, uri]);

  if (!uri) {
    return null;
  }

  return (
    <Image
      source={{uri: displayUri || uri}}
      style={style}
      onLoad={onLoad}
      onError={onError}
    />
  );
});
