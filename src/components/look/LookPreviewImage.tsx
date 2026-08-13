import {resolveBakeMatrix} from '@lib/look/lookCatalog';
import {
  DEFAULT_LOOK_INTENSITY,
  hasAppliedLook,
  type LookId,
} from '@lib/look/types';
import {memo, useMemo} from 'react';
import {
  Image,
  type ImageErrorEventData,
  type ImageLoadEventData,
  type ImageStyle,
  type NativeSyntheticEvent,
  type StyleProp,
} from 'react-native';
import {FilterImage} from 'react-native-svg/filter-image';

type LookPreviewImageProps = {
  uri: string;
  lookId?: LookId | null;
  lookIntensity?: number | null;
  style?: StyleProp<ImageStyle>;
  onLoad?: (event: NativeSyntheticEvent<ImageLoadEventData>) => void;
  onError?: (event: NativeSyntheticEvent<ImageErrorEventData>) => void;
};

/**
 * In-app look preview via the same color matrix used for Export/Upload bake.
 * Uses SVG FeColorMatrix (FilterImage) — not tint overlays.
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
  const matrix = useMemo(
    () => resolveBakeMatrix(lookId ?? 'original', intensity),
    [intensity, lookId],
  );

  if (!uri) {
    return null;
  }

  if (!hasAppliedLook(lookId)) {
    return (
      <Image
        source={{uri}}
        style={style}
        onLoad={onLoad}
        onError={onError}
      />
    );
  }

  return (
    <FilterImage
      source={{uri}}
      style={style}
      onLoad={onLoad}
      onError={onError}
      filters={[
        {
          name: 'feColorMatrix',
          type: 'matrix',
          values: matrix,
        },
      ]}
    />
  );
});
