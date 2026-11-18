import { useCallback, useState } from 'react';
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';

export type ScrollThumbMetrics = {
  viewportHeight: number;
  contentHeight: number;
  scrollOffset: number;
};

const EMPTY_METRICS: ScrollThumbMetrics = {
  viewportHeight: 0,
  contentHeight: 0,
  scrollOffset: 0,
};

/**
 * Tracks a ScrollView's viewport, content and offset for a custom scroll thumb.
 * When disabled the handlers are undefined, so the ScrollView skips the
 * per-frame re-render on platforms that use the native scrollbar.
 */
export function useScrollThumbMetrics(enabled: boolean) {
  const [metrics, setMetrics] = useState(EMPTY_METRICS);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const viewportHeight = event.nativeEvent.layout.height;
    setMetrics(current =>
      current.viewportHeight === viewportHeight
        ? current
        : { ...current, viewportHeight },
    );
  }, []);

  const onContentSizeChange = useCallback(
    (_width: number, contentHeight: number) => {
      setMetrics(current =>
        current.contentHeight === contentHeight
          ? current
          : { ...current, contentHeight },
      );
    },
    [],
  );

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } =
        event.nativeEvent;
      setMetrics({
        viewportHeight: layoutMeasurement.height,
        contentHeight: contentSize.height,
        scrollOffset: Math.max(0, contentOffset.y),
      });
    },
    [],
  );

  return {
    metrics,
    scrollHandlers: enabled
      ? { onLayout, onContentSizeChange, onScroll, scrollEventThrottle: 16 }
      : undefined,
  };
}
