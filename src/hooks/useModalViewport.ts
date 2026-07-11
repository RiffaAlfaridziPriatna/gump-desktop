import {
  ModalDesignSize,
  ResolvedModalSize,
  resolveModalSize,
} from '@lib/ui/modalDimensions';
import {useCallback, useEffect, useMemo, useState} from 'react';
import {LayoutChangeEvent, useWindowDimensions} from 'react-native';

type ViewportSize = {
  width: number;
  height: number;
};

export function useModalViewport(active: boolean, design: ModalDesignSize) {
  const fallback = useWindowDimensions();
  const [viewport, setViewport] = useState<ViewportSize | null>(null);

  useEffect(() => {
    if (!active) {
      setViewport(null);
    }
  }, [active]);

  const onOverlayLayout = useCallback((event: LayoutChangeEvent) => {
    const {width, height} = event.nativeEvent.layout;
    setViewport(current =>
      current?.width === width && current?.height === height
        ? current
        : {width, height},
    );
  }, []);

  const viewportWidth = viewport?.width ?? fallback.width;
  const viewportHeight = viewport?.height ?? fallback.height;

  const resolved = useMemo(
    () => resolveModalSize(design, viewportWidth, viewportHeight),
    [
      design.width,
      design.height,
      design.decorativeHeight,
      viewportWidth,
      viewportHeight,
    ],
  );

  return {
    onOverlayLayout,
    resolved,
    viewportHeight,
    isViewportMeasured: viewport != null,
    isLayoutReady: design.height == null || viewport != null,
  };
}

export type {ResolvedModalSize};
