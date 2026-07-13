import {createContext, useCallback, useContext, useRef} from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollViewProps,
} from 'react-native';

type Listener = () => void;

const DEFAULT_SCROLL_END_DELAY_MS = 150;
const WHEEL_SCROLL_EVENT_THROTTLE_MS = 100;

export class ScrollAwareTooltipStore {
  private isScrolling = false;
  private listeners = new Set<Listener>();

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): boolean => this.isScrolling;

  isLocked = (): boolean => this.isScrolling;

  setScrolling = (scrolling: boolean, onDismiss?: () => void): void => {
    const wasScrolling = this.isScrolling;
    if (wasScrolling === scrolling) {
      return;
    }

    this.isScrolling = scrolling;
    if (!wasScrolling && scrolling) {
      onDismiss?.();
    }
    this.listeners.forEach(listener => listener());
  };
}

export function createScrollAwareTooltipStore(): ScrollAwareTooltipStore {
  return new ScrollAwareTooltipStore();
}

export const ScrollAwareTooltipContext =
  createContext<ScrollAwareTooltipStore | null>(null);

export function useScrollAwareTooltipStore(): ScrollAwareTooltipStore | null {
  return useContext(ScrollAwareTooltipContext);
}

type ScrollAwareTooltipHandlerOptions = {
  endDelayMs?: number;
  /** Track trackpad / wheel scroll without firing JS every frame. */
  trackWheelScroll?: boolean;
};

export function useScrollAwareTooltipHandlers(
  store: ScrollAwareTooltipStore,
  onDismiss: () => void,
  options: ScrollAwareTooltipHandlerOptions = {},
): Pick<
  ScrollViewProps,
  | 'scrollEventThrottle'
  | 'onScroll'
  | 'onScrollBeginDrag'
  | 'onScrollEndDrag'
  | 'onMomentumScrollEnd'
> {
  const {
    endDelayMs = DEFAULT_SCROLL_END_DELAY_MS,
    trackWheelScroll = true,
  } = options;
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScrollAtRef = useRef(0);
  const isScrollingRef = useRef(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const clearScrollEndTimer = useCallback(() => {
    if (scrollEndTimerRef.current) {
      clearTimeout(scrollEndTimerRef.current);
      scrollEndTimerRef.current = null;
    }
  }, []);

  const finishScrolling = useCallback(() => {
    isScrollingRef.current = false;
    store.setScrolling(false);
    scrollEndTimerRef.current = null;
  }, [store]);

  const markScrollActive = useCallback(() => {
    lastScrollAtRef.current = Date.now();
    if (isScrollingRef.current) {
      return;
    }

    isScrollingRef.current = true;
    store.setScrolling(true, () => onDismissRef.current());
  }, [store]);

  const scheduleScrollEnd = useCallback(() => {
    clearScrollEndTimer();
    scrollEndTimerRef.current = setTimeout(() => {
      if (Date.now() - lastScrollAtRef.current >= endDelayMs) {
        finishScrolling();
        return;
      }

      scheduleScrollEnd();
    }, endDelayMs);
  }, [clearScrollEndTimer, endDelayMs, finishScrolling]);

  const ensureScrollEndWatcher = useCallback(() => {
    if (scrollEndTimerRef.current) {
      return;
    }

    scrollEndTimerRef.current = setTimeout(function watchScrollEnd() {
      if (Date.now() - lastScrollAtRef.current >= endDelayMs) {
        finishScrolling();
        return;
      }

      scrollEndTimerRef.current = setTimeout(watchScrollEnd, endDelayMs);
    }, endDelayMs);
  }, [endDelayMs, finishScrolling]);

  const handleScrollBegin = useCallback(() => {
    markScrollActive();
    clearScrollEndTimer();
  }, [clearScrollEndTimer, markScrollActive]);

  const handleScrollEnd = useCallback(() => {
    scheduleScrollEnd();
  }, [scheduleScrollEnd]);

  const handleWheelScroll = useCallback(
    (_event: NativeSyntheticEvent<NativeScrollEvent>) => {
      markScrollActive();
      lastScrollAtRef.current = Date.now();
      ensureScrollEndWatcher();
    },
    [ensureScrollEndWatcher, markScrollActive],
  );

  const handlers: Pick<
    ScrollViewProps,
    | 'scrollEventThrottle'
    | 'onScroll'
    | 'onScrollBeginDrag'
    | 'onScrollEndDrag'
    | 'onMomentumScrollEnd'
  > = {
    onScrollBeginDrag: handleScrollBegin,
    onScrollEndDrag: handleScrollEnd,
    onMomentumScrollEnd: handleScrollEnd,
  };

  if (trackWheelScroll) {
    handlers.onScroll = handleWheelScroll;
    handlers.scrollEventThrottle = WHEEL_SCROLL_EVENT_THROTTLE_MS;
  }

  return handlers;
}

export function isScrollAwareTooltipLocked(
  store: ScrollAwareTooltipStore | null | undefined,
): boolean {
  return store?.isLocked() ?? false;
}
