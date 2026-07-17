import {KeyFaceTooltipAnchor} from '@components/culling/FaceStatusTooltip';
import {
  isScrollAwareTooltipLocked,
  useScrollAwareTooltipStore,
} from '@lib/ui/scrollAwareTooltip';
import {useCallback, useRef} from 'react';
import {View} from 'react-native';

type BuildAnchor = (
  x: number,
  y: number,
  width: number,
  height: number,
) => KeyFaceTooltipAnchor;

/**
 * Hover → measureInWindow tooltip show that ignores stale callbacks
 * (rapid cursor moves) and scroll-lock reopen races.
 */
export function useMeasuredTooltipHover(
  onTooltipAnchorChange:
    | ((anchor: KeyFaceTooltipAnchor | null) => void)
    | undefined,
  buildAnchor: BuildAnchor,
) {
  const targetRef = useRef<View>(null);
  const scrollAwareTooltipStore = useScrollAwareTooltipStore();
  const hoverGenerationRef = useRef(0);
  const isHoveredRef = useRef(false);

  const onHoverIn = useCallback(() => {
    if (isScrollAwareTooltipLocked(scrollAwareTooltipStore)) {
      return;
    }

    const generation = ++hoverGenerationRef.current;
    isHoveredRef.current = true;

    targetRef.current?.measureInWindow(
      (x, y, measuredWidth, measuredHeight) => {
        if (
          !isHoveredRef.current ||
          generation !== hoverGenerationRef.current ||
          isScrollAwareTooltipLocked(scrollAwareTooltipStore)
        ) {
          return;
        }

        onTooltipAnchorChange?.(
          buildAnchor(x, y, measuredWidth, measuredHeight),
        );
      },
    );
  }, [buildAnchor, onTooltipAnchorChange, scrollAwareTooltipStore]);

  const onHoverOut = useCallback(() => {
    isHoveredRef.current = false;
    hoverGenerationRef.current += 1;
    // Always clear — do not gate on scroll lock, or a late measure reopen
    // can stick because the matching leave was ignored while locked.
    onTooltipAnchorChange?.(null);
  }, [onTooltipAnchorChange]);

  return {targetRef, onHoverIn, onHoverOut};
}
