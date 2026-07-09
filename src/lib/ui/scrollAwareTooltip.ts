import {createContext, useCallback, useContext, useRef} from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollViewProps,
} from 'react-native';

type Listener = () => void;

const DEFAULT_SCROLL_END_DELAY_MS = 150;

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
  const {endDelayMs = DEFAULT_SCROLL_END_DELAY_MS} = options;
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const clearScrollEndTimer = useCallback(() => {
    if (scrollEndTimerRef.current) {
      clearTimeout(scrollEndTimerRef.current);
      scrollEndTimerRef.current = null;
    }
  }, []);

  const dismissOnScrollStart = useCallback(() => {
    store.setScrolling(true, () => onDismissRef.current());
  }, [store]);

  const scheduleScrollEnd = useCallback(() => {
    clearScrollEndTimer();
    scrollEndTimerRef.current = setTimeout(() => {
      store.setScrolling(false);
      scrollEndTimerRef.current = null;
    }, endDelayMs);
  }, [clearScrollEndTimer, endDelayMs, store]);

  const handleScrollBegin = useCallback(() => {
    dismissOnScrollStart();
    clearScrollEndTimer();
  }, [clearScrollEndTimer, dismissOnScrollStart]);

  const handleScroll = useCallback(
    (_event: NativeSyntheticEvent<NativeScrollEvent>) => {
      dismissOnScrollStart();
      scheduleScrollEnd();
    },
    [dismissOnScrollStart, scheduleScrollEnd],
  );

  const handleScrollEnd = useCallback(() => {
    scheduleScrollEnd();
  }, [scheduleScrollEnd]);

  return {
    scrollEventThrottle: 16,
    onScroll: handleScroll,
    onScrollBeginDrag: handleScrollBegin,
    onScrollEndDrag: handleScrollEnd,
    onMomentumScrollEnd: handleScrollEnd,
  };
}

export function isScrollAwareTooltipLocked(
  store: ScrollAwareTooltipStore | null | undefined,
): boolean {
  return store?.isLocked() ?? false;
}

