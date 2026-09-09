import {scheduleHydrateVisiblePhotos} from '@hooks/useVisiblePhotos';
import {useCulledAlbumPhoto} from '@context/culledAlbum';
import type {AlbumGridFileItem} from '@lib/culledAlbum/stableAlbumGridFiles';
import {persistThumbnailDimensions} from '@lib/culledAlbum/persistThumbnailDimensions';
import {scheduleThumbnailBackfillForPhotos} from '@lib/culledAlbum/thumbnailBackfill';
import {
  getCachedImageDimensions,
  getCulledAlbumThumbnailLayout,
  getFileThumbnailDimensions,
  loadImageDimensions,
  putCachedImageDimensions,
  type ImageDimensions,
} from '@lib/media/imageDimensions';
import {
  cancelScrollImagePreload,
  getScrollPreloadRange,
  scheduleScrollImagePreload,
  SCROLL_GRID_VISIBLE_PADDING,
} from '@lib/media/scrollImagePreload';
import {
  isUsableThumbnailUri,
  resolveGridDisplayUri,
} from '@lib/storage/localStorage';
import {colors} from '@lib/ui/colors';
import {
  nativeScrollToOffset,
  type NativeScrollResult,
} from '@lib/ui/nativeScrollToOffset';
import {reportError} from '@lib/observability/reportError';
import {addErrorStep, captureAppEvent} from '@lib/observability/posthogClient';
import {
  createContext,
  forwardRef,
  memo,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  FlatList,
  Image,
  type ImageLoadEventData,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  ListRenderItemInfo,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
  ViewToken,
  type NativeSyntheticEvent,
} from 'react-native';

const COLUMNS = 3;
const ASPECT_RATIO = 3 / 2;
const HORIZONTAL_PADDING = 48;
const GAP = 8;
const RESIZE_SETTLE_MS = 150;
const PLACEHOLDER_INITIAL_ROWS = 8;
const GRAY_FILL_BATCH_PERIOD_MS = 50;
const SCROLL_SETTLE_MS = 120;
const SCROLL_TO_TOP_NUDGE_PX = 1;
const NATIVE_TOP_THRESHOLD_PX = 80;
const PROGRAMMATIC_SCROLL_GRACE_MS = 120;
// Phase budgets. The native call is a UIManager round trip and should return in
// well under 50ms, but the JS thread can be saturated on a 3K album.
const NATIVE_PHASE_TIMEOUT_MS = 400;
const CONVERGENCE_BASE_MS = 600;
const CONVERGENCE_PER_ITEM_MS = 0.15;
const CONVERGENCE_MIN_MS = 800;
const CONVERGENCE_MAX_MS = 2500;
const RECOVERY_NUDGE_WINDOW_MS = 500;
// Rendering is clamped hard while a jump is in flight so a 362k-pixel move
// cannot unblock thousands of cells at once.
const SCROLL_JUMP_WINDOW_SIZE = 2;
const SCROLL_JUMP_MAX_PER_BATCH = 2;
// React 19 auto-batches state updates inside timers and promises, so releasing
// the clamp in the same tick as any other setState would collapse into one
// render. The release is always deferred out of the current batch.
const CLAMP_RELEASE_NORMAL_MS = 16;
const CLAMP_RELEASE_AFTER_REMOUNT_MS = 150;
// Once the first visible row is at or below this, we have effectively arrived.
const SCROLL_JUMP_VIEWABILITY_ROW_LIMIT = 2;

function convergenceBudgetMs(itemCount: number): number {
  return Math.min(
    CONVERGENCE_MAX_MS,
    Math.max(
      CONVERGENCE_MIN_MS,
      CONVERGENCE_BASE_MS + itemCount * CONVERGENCE_PER_ITEM_MS,
    ),
  );
}
const EMPTY_IMAGE_LOAD_IDS = new Set<string>();

type ImageLoadStore = {
  subscribe: (listener: () => void) => () => void;
  getIds: () => Set<string>;
  setIds: (nextIds: Set<string>) => void;
};

const PhotoGridImageLoadContext = createContext<ImageLoadStore | null>(null);

function setsEqual(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }
  return true;
}

function createImageLoadStore(): ImageLoadStore {
  let ids = EMPTY_IMAGE_LOAD_IDS;
  const listeners = new Set<() => void>();

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getIds() {
      return ids;
    },
    setIds(nextIds) {
      if (setsEqual(ids, nextIds)) {
        return;
      }
      ids = nextIds;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

function useShouldLoadGridImage(photoId: string): boolean {
  const store = useContext(PhotoGridImageLoadContext);
  return useSyncExternalStore(
    store?.subscribe ?? subscribeNoop,
    () => store?.getIds().has(photoId) ?? true,
  );
}

function subscribeNoop(): () => void {
  return () => undefined;
}

function resolveThumbnailSize(
  file: {thumbnailWidth?: number | null; thumbnailHeight?: number | null} | undefined,
  uri: string,
): ImageDimensions | null {
  const stored = file ? getFileThumbnailDimensions(file) : null;
  if (stored) {
    putCachedImageDimensions(uri, stored);
    return stored;
  }
  return uri ? getCachedImageDimensions(uri) ?? null : null;
}

const PhotoGridCellImage = memo(
  function PhotoGridCellImage({
    albumId,
    photoId,
    width,
    height,
    deferHeavyMediaWork,
  }: {
    albumId?: string;
    photoId: string;
    width: number;
    height: number;
    deferHeavyMediaWork: boolean;
  }) {
    const shouldLoadImage = useShouldLoadGridImage(photoId);
    const photo = useCulledAlbumPhoto(albumId, photoId);
    const file = photo?.file;
    const uri = file ? resolveGridDisplayUri(file) ?? '' : '';
    const [isLoaded, setIsLoaded] = useState(false);
    const [imageSize, setImageSize] = useState<ImageDimensions | null>(() =>
      resolveThumbnailSize(file, uri),
    );
    const displayedUriRef = useRef(uri);

    useEffect(() => {
      if (displayedUriRef.current === uri) {
        return;
      }
      displayedUriRef.current = uri;
      setIsLoaded(false);
      setImageSize(resolveThumbnailSize(file, uri));
    }, [file, uri]);

    const imageLayout = useMemo(() => {
      if (!imageSize) {
        return null;
      }

      return getCulledAlbumThumbnailLayout(
        width,
        height,
        imageSize.width,
        imageSize.height,
      );
    }, [height, imageSize, width]);

    useEffect(() => {
      const stored = file ? getFileThumbnailDimensions(file) : null;
      if (stored) {
        if (uri) {
          putCachedImageDimensions(uri, stored);
        }
        setImageSize(current =>
          current &&
          current.width === stored.width &&
          current.height === stored.height
            ? current
            : stored,
        );
        return;
      }

      if (!shouldLoadImage || !uri) {
        return;
      }

      if (deferHeavyMediaWork) {
        return;
      }

      const cached = getCachedImageDimensions(uri);
      if (cached) {
        setImageSize(current =>
          current &&
          current.width === cached.width &&
          current.height === cached.height
            ? current
            : cached,
        );
        if (albumId) {
          persistThumbnailDimensions(albumId, photoId, cached);
        }
        return;
      }

      let cancelled = false;

      loadImageDimensions(uri).then(dimensions => {
        if (cancelled || !dimensions) {
          return;
        }
        setImageSize(current =>
          current &&
          current.width === dimensions.width &&
          current.height === dimensions.height
            ? current
            : dimensions,
        );
        if (albumId) {
          persistThumbnailDimensions(albumId, photoId, dimensions);
        }
      });

      return () => {
        cancelled = true;
      };
    }, [albumId, deferHeavyMediaWork, file, photoId, shouldLoadImage, uri]);

    const handleLoad = useCallback(
      (event: NativeSyntheticEvent<ImageLoadEventData>) => {
        setIsLoaded(true);

        const {width: loadedWidth, height: loadedHeight} =
          event.nativeEvent.source;
        if (loadedWidth <= 0 || loadedHeight <= 0) {
          return;
        }

        setImageSize(current => {
          if (current) {
            return current;
          }
          const dimensions = {width: loadedWidth, height: loadedHeight};
          putCachedImageDimensions(uri, dimensions);
          if (albumId) {
            persistThumbnailDimensions(albumId, photoId, dimensions);
          }
          return dimensions;
        });
      },
      [albumId, photoId, uri],
    );

    return (
      <View
        style={[
          styles.itemContainer,
          {width, height, backgroundColor: colors.cardBackgroundSecondary},
        ]}>
        {uri && (shouldLoadImage || isLoaded) ? (
          <Image
            source={{uri}}
            onLoad={handleLoad}
            onError={() => setIsLoaded(true)}
            style={[
              styles.containedImage,
              imageLayout
                ? {
                    width: imageLayout.width,
                    height: imageLayout.height,
                    left: imageLayout.left,
                    top: imageLayout.top,
                    opacity: isLoaded ? 1 : 0,
                  }
                : {
                    width,
                    height,
                    left: 0,
                    top: 0,
                    opacity: isLoaded ? 1 : 0,
                  },
            ]}
          />
        ) : null}
      </View>
    );
  },
  (prev, next) =>
    prev.albumId === next.albumId &&
    prev.photoId === next.photoId &&
    prev.width === next.width &&
    prev.height === next.height &&
    prev.deferHeavyMediaWork === next.deferHeavyMediaWork,
);

type PhotoGridCell = {
  key: string;
  photoId: string;
  index: number;
};

type PhotoGridRow = {
  key: string;
  rowIndex: number;
  cells: PhotoGridCell[];
};

type PhotoGridRowViewProps = {
  row: PhotoGridRow;
  albumId?: string;
  itemWidth: number;
  itemHeight: number;
  gap: number;
  deferHeavyMediaWork: boolean;
};

const PhotoGridRowView = memo(
  function PhotoGridRowView({
    row,
    albumId,
    itemWidth,
    itemHeight,
    gap,
    deferHeavyMediaWork,
  }: PhotoGridRowViewProps) {
    return (
      <View style={[styles.row, {marginBottom: gap, gap}]}>
        {row.cells.map(cell => (
          <PhotoGridCellImage
            key={cell.key}
            albumId={albumId}
            photoId={cell.photoId}
            width={itemWidth}
            height={itemHeight}
            deferHeavyMediaWork={deferHeavyMediaWork}
          />
        ))}
      </View>
    );
  },
  (prev, next) =>
    prev.row === next.row &&
    prev.albumId === next.albumId &&
    prev.itemWidth === next.itemWidth &&
    prev.itemHeight === next.itemHeight &&
    prev.gap === next.gap &&
    prev.deferHeavyMediaWork === next.deferHeavyMediaWork,
);

export type PhotoGridProps = {
  items: AlbumGridFileItem[];
  albumId?: string;
  horizontalPadding?: number;
  gap?: number;
  deferHeavyMediaWork?: boolean;
  onProgrammaticScrollChange?: (active: boolean) => void;
};

export type PhotoGridHandle = {
  scrollToTop: () => void;
};

function buildRows(photoIds: string[]): PhotoGridRow[] {
  const rows: PhotoGridRow[] = [];

  for (let index = 0; index < photoIds.length; index += COLUMNS) {
    const rowPhotoIds = photoIds.slice(index, index + COLUMNS);
    const rowIndex = index / COLUMNS;
    rows.push({
      key: `row-${rowIndex}:${rowPhotoIds.join(',')}`,
      rowIndex,
      cells: rowPhotoIds.map((photoId, columnIndex) => ({
        key: photoId,
        photoId,
        index: index + columnIndex,
      })),
    });
  }

  return rows;
}

const viewabilityConfig = {
  itemVisiblePercentThreshold: 20,
};

export const PhotoGrid = forwardRef<PhotoGridHandle, PhotoGridProps>(
  function PhotoGrid(
    {
      items,
      albumId,
      horizontalPadding = HORIZONTAL_PADDING,
      gap = GAP,
      deferHeavyMediaWork = false,
      onProgrammaticScrollChange,
    },
    ref,
  ) {
  const {width: windowWidth} = useWindowDimensions();
  const [settledLayoutWidth, setSettledLayoutWidth] = useState(0);
  const settledLayoutWidthRef = useRef(0);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<FlatList<PhotoGridRow>>(null);
  const scrollOffsetRef = useRef(0);
  const scrollAnimationFrameRef = useRef<number | null>(null);
  const programmaticGraceUntilRef = useRef(0);
  const scrollToTopGenerationRef = useRef(0);
  const completeScrollToTopRef = useRef<((generation: number) => boolean) | null>(
    null,
  );
  const onProgrammaticScrollChangeRef = useRef(onProgrammaticScrollChange);
  onProgrammaticScrollChangeRef.current = onProgrammaticScrollChange;
  const itemsRef = useRef(items);
  const albumIdRef = useRef(albumId);
  const deferHeavyMediaWorkRef = useRef(deferHeavyMediaWork);
  const lastPreloadRangeRef = useRef('');
  const lastHydrateRangeRef = useRef('');
  const lastThumbnailRangeRef = useRef('');
  const pendingViewableRef = useRef<{
    start: number;
    end: number;
    indices: number[];
  } | null>(null);
  const scrollSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const isScrollingRef = useRef(false);
  const isProgrammaticScrollRef = useRef(false);
  const [scrollJumpActive, setScrollJumpActive] = useState(false);
  const scrollJumpActiveRef = useRef(false);
  const [listResetKey, setListResetKey] = useState(0);
  const convergenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clampReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nudgeFrameRef = useRef<number | null>(null);
  const firstVisibleRowRef = useRef(0);
  const rowHeightRef = useRef(0);
  const lastScrollEventRef = useRef<{
    contentOffsetY: number;
    contentSizeHeight: number;
    layoutHeight: number;
    at: number;
  } | null>(null);
  const lastViewableRangeRef = useRef<{
    minIndex: number;
    maxIndex: number;
    minRow: number;
    at: number;
  } | null>(null);
  const imageLoadStoreRef = useRef<ImageLoadStore | null>(null);
  if (imageLoadStoreRef.current == null) {
    imageLoadStoreRef.current = createImageLoadStore();
  }
  const imageLoadStore = imageLoadStoreRef.current;

  itemsRef.current = items;
  albumIdRef.current = albumId;
  deferHeavyMediaWorkRef.current = deferHeavyMediaWork;

  const cancelClampRelease = useCallback(() => {
    if (clampReleaseTimerRef.current) {
      clearTimeout(clampReleaseTimerRef.current);
      clampReleaseTimerRef.current = null;
    }
  }, []);

  const engageScrollJump = useCallback(() => {
    // A pending release from a previous attempt must never unclamp a new jump.
    cancelClampRelease();
    scrollJumpActiveRef.current = true;
    setScrollJumpActive(true);
  }, [cancelClampRelease]);

  // The ref and the state are released together and always on a later tick.
  // Releasing the ref early would let the very next viewability pass restore the
  // full getScrollPreloadRange padding before the clamped render has painted.
  const releaseScrollJump = useCallback(
    (delayMs: number) => {
      cancelClampRelease();
      clampReleaseTimerRef.current = setTimeout(() => {
        clampReleaseTimerRef.current = null;
        scrollJumpActiveRef.current = false;
        setScrollJumpActive(false);
      }, delayMs);
    },
    [cancelClampRelease],
  );

  const cancelScrollAnimation = useCallback(() => {
    if (scrollAnimationFrameRef.current != null) {
      cancelAnimationFrame(scrollAnimationFrameRef.current);
      scrollAnimationFrameRef.current = null;
    }
    if (isProgrammaticScrollRef.current) {
      isProgrammaticScrollRef.current = false;
      onProgrammaticScrollChangeRef.current?.(false);
    }
  }, []);

  const captureScrollDiagnostics = useCallback(() => {
    const lastScroll = lastScrollEventRef.current;
    const lastViewable = lastViewableRangeRef.current;
    const estimatedOffset =
      firstVisibleRowRef.current * rowHeightRef.current;
    return {
      platform: Platform.OS,
      platformVersion: String(Platform.Version ?? ''),
      albumId: albumIdRef.current,
      itemCount: itemsRef.current.length,
      rowCount: Math.ceil(itemsRef.current.length / COLUMNS),
      columns: COLUMNS,
      rowHeight: rowHeightRef.current,
      layoutWidth: settledLayoutWidthRef.current,
      deferHeavyMediaWork: deferHeavyMediaWorkRef.current,
      isProgrammaticScroll: isProgrammaticScrollRef.current,
      isScrolling: isScrollingRef.current,
      reportedOffset: scrollOffsetRef.current,
      firstVisibleRow: firstVisibleRowRef.current,
      estimatedOffset,
      lastScrollOffsetY: lastScroll?.contentOffsetY ?? null,
      lastContentSizeHeight: lastScroll?.contentSizeHeight ?? null,
      lastLayoutHeight: lastScroll?.layoutHeight ?? null,
      lastScrollEventAgeMs: lastScroll ? Date.now() - lastScroll.at : null,
      lastViewableMinIndex: lastViewable?.minIndex ?? null,
      lastViewableMaxIndex: lastViewable?.maxIndex ?? null,
      lastViewableMinRow: lastViewable?.minRow ?? null,
      lastViewableAgeMs: lastViewable ? Date.now() - lastViewable.at : null,
    };
  }, []);

  const scrollToTop = useCallback(() => {
    const list = listRef.current;
    const generation = ++scrollToTopGenerationRef.current;
    completeScrollToTopRef.current = null;
    if (convergenceTimerRef.current) {
      clearTimeout(convergenceTimerRef.current);
      convergenceTimerRef.current = null;
    }
    if (recoveryTimerRef.current) {
      clearTimeout(recoveryTimerRef.current);
      recoveryTimerRef.current = null;
    }
    if (nudgeFrameRef.current != null) {
      cancelAnimationFrame(nudgeFrameRef.current);
      nudgeFrameRef.current = null;
    }
    if (scrollAnimationFrameRef.current != null) {
      cancelAnimationFrame(scrollAnimationFrameRef.current);
      scrollAnimationFrameRef.current = null;
    }

    const reportedOffset = scrollOffsetRef.current;
    const currentRowHeight = rowHeightRef.current;
    const lastViewableRow = lastViewableRangeRef.current?.minRow ?? 0;
    if (firstVisibleRowRef.current === 0 && lastViewableRow > 0) {
      firstVisibleRowRef.current = lastViewableRow;
    }
    const estimatedOffset = firstVisibleRowRef.current * currentRowHeight;
    const lastNativeOffset = lastScrollEventRef.current?.contentOffsetY ?? 0;
    const viewableOffset = lastViewableRow * currentRowHeight;
    const startOffset = Math.max(
      reportedOffset,
      estimatedOffset,
      lastNativeOffset,
      viewableOffset,
    );
    const startSnapshot = {
      startOffset,
      lastNativeOffset,
      viewableOffset,
      ...captureScrollDiagnostics(),
    };
    const startedPayload = {
      albumId: albumIdRef.current ?? null,
      itemCount: itemsRef.current.length,
      startOffset,
      reportedOffset,
      lastNativeOffset,
      firstVisibleRow: firstVisibleRowRef.current,
    };

    captureAppEvent('scroll_to_top_started', startedPayload);
    addErrorStep('scroll_to_top', {
      ...startedPayload,
      estimatedOffset,
      viewableOffset,
      platform: Platform.OS,
    });

    if (!list) {
      captureAppEvent('scroll_to_top_failed', {
        ...startedPayload,
        reason: 'missing_list_ref',
      });
      reportError(new Error('Photo grid scroll-to-top missing list ref'), {
        source: 'photo_grid',
        operation: 'scroll_to_top',
        ...captureScrollDiagnostics(),
      });
      return;
    }

    const startedAt = Date.now();
    isProgrammaticScrollRef.current = true;
    isScrollingRef.current = true;
    onProgrammaticScrollChangeRef.current?.(true);
    programmaticGraceUntilRef.current =
      Date.now() + PROGRAMMATIC_SCROLL_GRACE_MS;
    lastPreloadRangeRef.current = '';
    lastHydrateRangeRef.current = '';
    lastThumbnailRangeRef.current = '';
    pendingViewableRef.current = null;

    const endProgrammaticScroll = (
      clampReleaseMs = CLAMP_RELEASE_NORMAL_MS,
    ) => {
      isProgrammaticScrollRef.current = false;
      isScrollingRef.current = false;
      onProgrammaticScrollChangeRef.current?.(false);
      if (convergenceTimerRef.current) {
        clearTimeout(convergenceTimerRef.current);
        convergenceTimerRef.current = null;
      }
      if (recoveryTimerRef.current) {
        clearTimeout(recoveryTimerRef.current);
        recoveryTimerRef.current = null;
      }
      if (nudgeFrameRef.current != null) {
        cancelAnimationFrame(nudgeFrameRef.current);
        nudgeFrameRef.current = null;
      }
      // Safeguard 3: the render window is only restored after the convergence
      // phase has ended, and always on a later tick than any sibling setState.
      releaseScrollJump(clampReleaseMs);
    };

    const finishSuccess = (
      gen: number,
      viaRecovery: string | null = null,
    ): boolean => {
      if (gen !== scrollToTopGenerationRef.current) {
        return false;
      }
      const lastScroll = lastScrollEventRef.current;
      const nativeY = lastScroll?.contentOffsetY ?? 0;
      const nativeFresh = lastScroll != null && lastScroll.at >= startedAt;
      const viewableRow = lastViewableRangeRef.current?.minRow ?? 0;
      // Native-settled and VirtualizedList-settled are tracked separately on
      // purpose: "native moved but VL did not converge" must not look like
      // "native never moved".
      const nativeSettled = nativeFresh && nativeY <= NATIVE_TOP_THRESHOLD_PX;
      const vlSettled = viewableRow <= SCROLL_JUMP_VIEWABILITY_ROW_LIMIT;
      if (!nativeSettled || !vlSettled) {
        return false;
      }
      completeScrollToTopRef.current = null;
      firstVisibleRowRef.current = 0;
      scrollOffsetRef.current = 0;
      lastViewableRangeRef.current = {
        minIndex: 0,
        maxIndex: 0,
        minRow: 0,
        at: Date.now(),
      };
      captureAppEvent('scroll_to_top_completed', {
        albumId: albumIdRef.current ?? null,
        itemCount: itemsRef.current.length,
        startOffset,
        nativeOffset: nativeY,
        viaRecovery,
        elapsedMs: Date.now() - startedAt,
      });
      endProgrammaticScroll();
      return true;
    };

    completeScrollToTopRef.current = finishSuccess;
    engageScrollJump();

    // Safeguard 2b: never capture the FlatList instance. A remount swaps it,
    // and a captured handle would point at a dead list whose scrollToOffset
    // silently no-ops, which looks like the fallback ran when it did not.
    const currentList = (): FlatList<PhotoGridRow> | null => listRef.current;

    const failWith = (
      reason: string,
      extra: Record<string, string | number | boolean | null> = {},
    ) => {
      if (generation !== scrollToTopGenerationRef.current) {
        return;
      }
      completeScrollToTopRef.current = null;
      const diagnostics = {
        ...startSnapshot,
        ...captureScrollDiagnostics(),
        reason,
        ...extra,
        elapsedMs: Date.now() - startedAt,
      };
      captureAppEvent('scroll_to_top_failed', {
        albumId: albumIdRef.current ?? null,
        itemCount: itemsRef.current.length,
        startOffset,
        reason,
        remainingViewableRow: lastViewableRangeRef.current?.minRow ?? 0,
        lastNativeOffset: lastScrollEventRef.current?.contentOffsetY ?? 0,
        elapsedMs: Date.now() - startedAt,
        ...extra,
      });
      reportError(new Error(`Photo grid scroll-to-top failed: ${reason}`), {
        source: 'photo_grid',
        operation: 'scroll_to_top',
        ...diagnostics,
      });
      endProgrammaticScroll();
    };

    // Safeguard 2, tier 2: forced remount. VirtualizedList derives its render
    // window solely from _scrollMetrics, so if the synthetic event never lands
    // there is no JS-side way to move the window. Remounting resets
    // _scrollMetrics and cellsAroundViewport to the top.
    const recoverByRemount = () => {
      if (generation !== scrollToTopGenerationRef.current) {
        return;
      }
      captureAppEvent('scroll_to_top_recovery', {
        albumId: albumIdRef.current ?? null,
        itemCount: itemsRef.current.length,
        tier: 'remount',
        elapsedMs: Date.now() - startedAt,
      });
      firstVisibleRowRef.current = 0;
      scrollOffsetRef.current = 0;
      lastScrollEventRef.current = null;
      lastViewableRangeRef.current = {
        minIndex: 0,
        maxIndex: 0,
        minRow: 0,
        at: Date.now(),
      };
      lastPreloadRangeRef.current = '';
      lastHydrateRangeRef.current = '';
      lastThumbnailRangeRef.current = '';
      // A remount clears mounted cells; reseed the first rows so the grid
      // paints immediately instead of showing gray placeholders.
      imageLoadStore.setIds(
        new Set(
          itemsRef.current
            .slice(0, COLUMNS * PLACEHOLDER_INITIAL_ROWS)
            .map(item => item.photoId),
        ),
      );
      captureAppEvent('scroll_to_top_completed', {
        albumId: albumIdRef.current ?? null,
        itemCount: itemsRef.current.length,
        startOffset,
        nativeOffset: 0,
        viaRecovery: 'remount',
        elapsedMs: Date.now() - startedAt,
      });
      completeScrollToTopRef.current = null;

      // CRITICAL — do not call endProgrammaticScroll() here. React 19
      // auto-batches state updates inside timer callbacks, so setListResetKey
      // and the clamp release would collapse into a single render and the new
      // FlatList would mount at windowSize 7.
      isProgrammaticScrollRef.current = false;
      isScrollingRef.current = false;
      onProgrammaticScrollChangeRef.current?.(false);
      if (convergenceTimerRef.current) {
        clearTimeout(convergenceTimerRef.current);
        convergenceTimerRef.current = null;
      }
      if (recoveryTimerRef.current) {
        clearTimeout(recoveryTimerRef.current);
        recoveryTimerRef.current = null;
      }
      if (nudgeFrameRef.current != null) {
        cancelAnimationFrame(nudgeFrameRef.current);
        nudgeFrameRef.current = null;
      }

      setListResetKey(key => key + 1);
      releaseScrollJump(CLAMP_RELEASE_AFTER_REMOUNT_MS);
    };

    // Safeguard 2, tier 1: a 1px nudge generates a genuine AppKit bounds
    // change, which by this point is no longer inside a suppressed layout
    // pass. This is a recovery step only, never the primary path.
    const recoverByNudge = () => {
      if (generation !== scrollToTopGenerationRef.current) {
        return;
      }
      captureAppEvent('scroll_to_top_recovery', {
        albumId: albumIdRef.current ?? null,
        itemCount: itemsRef.current.length,
        tier: 'nudge',
        elapsedMs: Date.now() - startedAt,
      });
      const nudgeList = currentList();
      if (nudgeList == null) {
        recoverByRemount();
        return;
      }
      nudgeList.scrollToOffset({
        offset: SCROLL_TO_TOP_NUDGE_PX,
        animated: false,
      });
      nudgeFrameRef.current = requestAnimationFrame(() => {
        nudgeFrameRef.current = null;
        if (generation !== scrollToTopGenerationRef.current) {
          return;
        }
        currentList()?.scrollToOffset({offset: 0, animated: false});
      });
      recoveryTimerRef.current = setTimeout(() => {
        recoveryTimerRef.current = null;
        if (finishSuccess(generation, 'nudge')) {
          return;
        }
        recoverByRemount();
      }, RECOVERY_NUDGE_WINDOW_MS);
    };

    const startConvergencePhase = (native: NativeScrollResult) => {
      if (generation !== scrollToTopGenerationRef.current) {
        return;
      }
      if (finishSuccess(generation)) {
        return;
      }
      convergenceTimerRef.current = setTimeout(() => {
        convergenceTimerRef.current = null;
        if (finishSuccess(generation)) {
          return;
        }
        if (native.moved) {
          recoverByNudge();
          return;
        }
        failWith('native_position_unchanged', {
          nativeBeforeY: native.beforeVisibleY,
          nativeAfterY: native.afterVisibleY,
        });
      }, convergenceBudgetMs(itemsRef.current.length));
    };

    const runJsFallback = (reason: string) => {
      if (generation !== scrollToTopGenerationRef.current) {
        return;
      }
      captureAppEvent('scroll_to_top_native_fallback', {
        albumId: albumIdRef.current ?? null,
        itemCount: itemsRef.current.length,
        reason,
      });
      const fallbackList = currentList();
      if (fallbackList == null) {
        recoverByRemount();
        return;
      }
      fallbackList.scrollToOffset({offset: 0, animated: false});
      try {
        fallbackList.scrollToIndex({
          index: 0,
          animated: false,
          viewPosition: 0,
        });
      } catch {
        // Layout can be unknown before the first viewability pass.
      }
      convergenceTimerRef.current = setTimeout(() => {
        convergenceTimerRef.current = null;
        if (finishSuccess(generation, 'js_fallback')) {
          return;
        }
        recoverByRemount();
      }, convergenceBudgetMs(itemsRef.current.length));
    };

    // The native jump is the single owner. No competing scrollToOffset /
    // scrollToIndex / nudge runs alongside it.
    const nativeTimeout = new Promise<NativeScrollResult | null>(resolve => {
      setTimeout(() => resolve(null), NATIVE_PHASE_TIMEOUT_MS);
    });

    Promise.race([
      nativeScrollToOffset(currentList(), 0),
      nativeTimeout,
    ])
      .then(native => {
        if (generation !== scrollToTopGenerationRef.current) {
          return;
        }
        if (native == null) {
          runJsFallback('native_timeout');
          return;
        }
        captureAppEvent('scroll_to_top_native', {
          albumId: albumIdRef.current ?? null,
          itemCount: itemsRef.current.length,
          resolved: native.resolved,
          reason: native.reason,
          viewClass: native.viewClass,
          beforeVisibleY: native.beforeVisibleY,
          afterVisibleY: native.afterVisibleY,
          beforeClipY: native.beforeClipY,
          afterClipY: native.afterClipY,
          documentFlipped: native.documentFlipped,
          clipFlipped: native.clipFlipped,
          moved: native.moved,
          atTarget: native.atTarget,
          nativeElapsedMs: native.elapsedMs,
        });
        if (!native.resolved) {
          runJsFallback(native.reason);
          return;
        }
        startConvergencePhase(native);
      })
      .catch(() => undefined);
  }, [
    captureScrollDiagnostics,
    engageScrollJump,
    imageLoadStore,
    releaseScrollJump,
  ]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToTop,
    }),
    [scrollToTop],
  );

  useEffect(() => {
    return () => {
      cancelScrollImagePreload();
      cancelScrollAnimation();
      completeScrollToTopRef.current = null;
      if (convergenceTimerRef.current) {
        clearTimeout(convergenceTimerRef.current);
        convergenceTimerRef.current = null;
      }
      if (recoveryTimerRef.current) {
        clearTimeout(recoveryTimerRef.current);
        recoveryTimerRef.current = null;
      }
      if (clampReleaseTimerRef.current) {
        clearTimeout(clampReleaseTimerRef.current);
        clampReleaseTimerRef.current = null;
      }
      if (nudgeFrameRef.current != null) {
        cancelAnimationFrame(nudgeFrameRef.current);
        nudgeFrameRef.current = null;
      }
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current);
      }
      if (scrollSettleTimerRef.current) {
        clearTimeout(scrollSettleTimerRef.current);
      }
    };
  }, [cancelScrollAnimation]);

  const applyVisibleRange = useCallback(
    (start: number, end: number, indices: number[]) => {
      const currentItems = itemsRef.current;
      const currentAlbumId = albumIdRef.current;

      if (currentAlbumId) {
        const hydrateKey = `${start}:${end}`;
        if (lastHydrateRangeRef.current !== hydrateKey) {
          lastHydrateRangeRef.current = hydrateKey;
          scheduleHydrateVisiblePhotos(
            currentAlbumId,
            indices,
            SCROLL_GRID_VISIBLE_PADDING,
          );
        }

        const thumbnailKey = `${start}:${end}`;
        if (
          !deferHeavyMediaWorkRef.current &&
          lastThumbnailRangeRef.current !== thumbnailKey
        ) {
          lastThumbnailRangeRef.current = thumbnailKey;
          const photoIdsNeedingThumbnail = currentItems
            .slice(start, end)
            .filter(item => !isUsableThumbnailUri(item.file.thumbnailUri))
            .map(item => item.photoId);
          if (photoIdsNeedingThumbnail.length > 0) {
            scheduleThumbnailBackfillForPhotos(
              currentAlbumId,
              photoIdsNeedingThumbnail,
            );
          }
        }
      }

      const rangeItems = currentItems.slice(start, end);
      const nextLoadIds = new Set(imageLoadStore.getIds());
      for (const item of rangeItems) {
        nextLoadIds.add(item.photoId);
      }
      imageLoadStore.setIds(nextLoadIds);

      if (deferHeavyMediaWorkRef.current) {
        return;
      }

      const preloadKey = `${start}:${end}`;
      if (lastPreloadRangeRef.current === preloadKey) {
        return;
      }
      lastPreloadRangeRef.current = preloadKey;
      scheduleScrollImagePreload(rangeItems.map(item => item.file));
    },
    [imageLoadStore],
  );

  const flushPendingVisibleRange = useCallback(() => {
    const pending = pendingViewableRef.current;
    if (!pending) {
      return;
    }
    pendingViewableRef.current = null;
    applyVisibleRange(pending.start, pending.end, pending.indices);
  }, [applyVisibleRange]);

  const markScrollIdle = useCallback(() => {
    scrollSettleTimerRef.current = null;
    isScrollingRef.current = false;
    flushPendingVisibleRange();
  }, [flushPendingVisibleRange]);

  useEffect(() => {
    if (deferHeavyMediaWork) {
      return;
    }
    flushPendingVisibleRange();
  }, [deferHeavyMediaWork, flushPendingVisibleRange]);

  const markScrolling = useCallback(() => {
    cancelScrollAnimation();
    isScrollingRef.current = true;
    if (scrollSettleTimerRef.current) {
      clearTimeout(scrollSettleTimerRef.current);
    }
    scrollSettleTimerRef.current = setTimeout(markScrollIdle, SCROLL_SETTLE_MS);
  }, [cancelScrollAnimation, markScrollIdle]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const nativeEvent = event.nativeEvent;
      const nextOffset = nativeEvent.contentOffset.y;
      const previousOffset = scrollOffsetRef.current;
      const delta = Math.abs(nextOffset - previousOffset);
      lastScrollEventRef.current = {
        contentOffsetY: nextOffset,
        contentSizeHeight: nativeEvent.contentSize.height,
        layoutHeight: nativeEvent.layoutMeasurement.height,
        at: Date.now(),
      };
      scrollOffsetRef.current = nextOffset;
      if (isProgrammaticScrollRef.current) {
        if (
          completeScrollToTopRef.current?.(scrollToTopGenerationRef.current)
        ) {
          return;
        }
        // Animation frames move toward 0. A jump downward after the grace
        // window means the user grabbed the scrollbar thumb — onScrollBeginDrag
        // does not fire for that. Ignore stale thumb events at the start;
        // do not use |delta| > N: our own scrollToOffset steps are much larger.
        if (
          Date.now() >= programmaticGraceUntilRef.current &&
          nextOffset > previousOffset + 30
        ) {
          scrollToTopGenerationRef.current += 1;
          completeScrollToTopRef.current = null;
          if (convergenceTimerRef.current) {
            clearTimeout(convergenceTimerRef.current);
            convergenceTimerRef.current = null;
          }
          if (recoveryTimerRef.current) {
            clearTimeout(recoveryTimerRef.current);
            recoveryTimerRef.current = null;
          }
          if (nudgeFrameRef.current != null) {
            cancelAnimationFrame(nudgeFrameRef.current);
            nudgeFrameRef.current = null;
          }
          captureAppEvent('scroll_to_top_failed', {
            albumId: albumIdRef.current ?? null,
            itemCount: itemsRef.current.length,
            reason: 'user_cancelled',
          });
          cancelScrollAnimation();
          releaseScrollJump(CLAMP_RELEASE_NORMAL_MS);
          markScrolling();
        }
        return;
      }
      if (delta < 1 && !isScrollingRef.current) {
        return;
      }
      markScrolling();
    },
    [cancelScrollAnimation, markScrolling, releaseScrollJump],
  );

  const handleScrollBeginDrag = useCallback(() => {
    if (isProgrammaticScrollRef.current) {
      scrollToTopGenerationRef.current += 1;
      completeScrollToTopRef.current = null;
      if (convergenceTimerRef.current) {
        clearTimeout(convergenceTimerRef.current);
        convergenceTimerRef.current = null;
      }
      if (recoveryTimerRef.current) {
        clearTimeout(recoveryTimerRef.current);
        recoveryTimerRef.current = null;
      }
      if (nudgeFrameRef.current != null) {
        cancelAnimationFrame(nudgeFrameRef.current);
        nudgeFrameRef.current = null;
      }
      captureAppEvent('scroll_to_top_failed', {
        albumId: albumIdRef.current ?? null,
        itemCount: itemsRef.current.length,
        reason: 'user_cancelled',
      });
      releaseScrollJump(CLAMP_RELEASE_NORMAL_MS);
    }
    cancelScrollAnimation();
    markScrolling();
  }, [cancelScrollAnimation, markScrolling, releaseScrollJump]);

  const handleContainerLayout = useCallback((event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width === settledLayoutWidthRef.current) {
      return;
    }

    if (resizeTimerRef.current) {
      clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = null;
    }

    if (settledLayoutWidthRef.current === 0) {
      settledLayoutWidthRef.current = width;
      setSettledLayoutWidth(width);
      return;
    }

    resizeTimerRef.current = setTimeout(() => {
      settledLayoutWidthRef.current = width;
      setSettledLayoutWidth(width);
      resizeTimerRef.current = null;
    }, RESIZE_SETTLE_MS);
  }, []);

  const effectiveWidth =
    settledLayoutWidth > 0 ? settledLayoutWidth : windowWidth;
  const containerWidth = effectiveWidth - horizontalPadding * 2;
  const itemWidth =
    containerWidth > 0
      ? (containerWidth - gap * (COLUMNS - 1)) / COLUMNS
      : 0;
  const itemHeight = itemWidth / ASPECT_RATIO;
  const rowHeight = itemHeight + gap;
  rowHeightRef.current = rowHeight;
  const settledItemWidth = Math.round(itemWidth);

  const photoIdsKey = items.map(item => item.photoId).join('\0');
  const rows = useMemo(
    () => buildRows(photoIdsKey ? photoIdsKey.split('\0') : []),
    [photoIdsKey],
  );

  useEffect(() => {
    const existingIds = imageLoadStore.getIds();
    if (existingIds.size > 0) {
      return;
    }

    const initialIds = new Set(
      itemsRef.current
        .slice(0, COLUMNS * PLACEHOLDER_INITIAL_ROWS)
        .map(item => item.photoId),
    );
    imageLoadStore.setIds(initialIds);
  }, [imageLoadStore, photoIdsKey]);

  const handleViewableItemsChanged = useCallback(
    ({viewableItems}: {viewableItems: ViewToken<PhotoGridRow>[]}) => {
      const indices = viewableItems.flatMap(
        token =>
          (token.item as PhotoGridRow | undefined)?.cells.map(
            cell => cell.index,
          ) ?? [],
      );

      if (indices.length === 0) {
        return;
      }

      const currentItems = itemsRef.current;
      const minIndex = Math.min(...indices);
      const maxIndex = Math.max(...indices);

      // Track the first visible row for offset recovery.
      // When macOS Sonoma throttles onScroll during thumb drag,
      // scrollOffsetRef falls behind. onViewableItemsChanged gives
      // us a second chance to estimate the real position.
      const minRowIndex = Math.floor(minIndex / COLUMNS);
      firstVisibleRowRef.current = minRowIndex;
      lastViewableRangeRef.current = {
        minIndex,
        maxIndex,
        minRow: minRowIndex,
        at: Date.now(),
      };

      // While a jump is in flight, rows far from the target are throwaway: the
      // clip view has already left them. Loading their images would fire
      // thousands of disk reads for cells that are about to unmount. Only let
      // viewability through once we have actually arrived near the top — which
      // is also what makes the top cells paint immediately.
      if (
        scrollJumpActiveRef.current &&
        minRowIndex > SCROLL_JUMP_VIEWABILITY_ROW_LIMIT
      ) {
        return;
      }

      const currentRowHeight = rowHeightRef.current;
      if (currentRowHeight > 0) {
        const estimatedOffset = minRowIndex * currentRowHeight;
        if (estimatedOffset > scrollOffsetRef.current + currentRowHeight * 2) {
          scrollOffsetRef.current = estimatedOffset;
        }
      }

      // getScrollPreloadRange pads well beyond the viewport. During a jump we
      // load strictly what is visible; the padding resumes once the jump
      // completes.
      const {start, end} = scrollJumpActiveRef.current
        ? {start: minIndex, end: maxIndex}
        : getScrollPreloadRange(
            minIndex,
            maxIndex,
            currentItems.length,
            COLUMNS,
          );

      // Hold new image loads until scroll settles only while analysis is
      // saturating the JS/native threads. After that, fling should paint.
      if (deferHeavyMediaWorkRef.current && isScrollingRef.current) {
        pendingViewableRef.current = {start, end, indices};
        return;
      }

      applyVisibleRange(start, end, indices);
    },
    [applyVisibleRange],
  );

  const onViewableItemsChangedRef = useRef(handleViewableItemsChanged);
  onViewableItemsChangedRef.current = handleViewableItemsChanged;

  const viewabilityConfigCallbackPairs = useRef([
    {
      viewabilityConfig,
      onViewableItemsChanged: (info: {
        viewableItems: ViewToken<PhotoGridRow>[];
      }) => onViewableItemsChangedRef.current(info),
    },
  ]).current;

  const renderRow = useCallback(
    ({item: row}: ListRenderItemInfo<PhotoGridRow>) => (
      <PhotoGridRowView
        row={row}
        albumId={albumId}
        itemWidth={itemWidth}
        itemHeight={itemHeight}
        gap={gap}
        deferHeavyMediaWork={deferHeavyMediaWork}
      />
    ),
    [albumId, deferHeavyMediaWork, gap, itemHeight, itemWidth],
  );

  const keyExtractor = useCallback((row: PhotoGridRow) => row.key, []);

  const getItemLayout = useCallback(
    (_data: ArrayLike<PhotoGridRow> | null | undefined, index: number) => ({
      length: rowHeight,
      offset: rowHeight * index,
      index,
    }),
    [rowHeight],
  );

  if (items.length === 0) {
    return null;
  }

  return (
    <View style={styles.container} onLayout={handleContainerLayout}>
      {itemWidth > 0 ? (
        <PhotoGridImageLoadContext.Provider value={imageLoadStore}>
          <FlatList
            key={`photo-grid-${listResetKey}`}
            ref={listRef}
            data={rows}
            renderItem={renderRow}
            keyExtractor={keyExtractor}
            getItemLayout={getItemLayout}
            extraData={settledItemWidth}
            windowSize={
              scrollJumpActive
                ? SCROLL_JUMP_WINDOW_SIZE
                : deferHeavyMediaWork || Platform.OS === 'windows'
                  ? 3
                  : 7
            }
            removeClippedSubviews={false}
            initialNumToRender={PLACEHOLDER_INITIAL_ROWS}
            maxToRenderPerBatch={
              scrollJumpActive
                ? SCROLL_JUMP_MAX_PER_BATCH
                : deferHeavyMediaWork
                  ? 3
                  : 6
            }
            updateCellsBatchingPeriod={GRAY_FILL_BATCH_PERIOD_MS}
            showsVerticalScrollIndicator
            onScroll={handleScroll}
            onScrollBeginDrag={handleScrollBeginDrag}
            scrollEventThrottle={16}
            contentContainerStyle={[
              styles.listContent,
              {paddingHorizontal: horizontalPadding},
            ]}
            viewabilityConfigCallbackPairs={viewabilityConfigCallbackPairs}
          />
        </PhotoGridImageLoadContext.Provider>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 16,
  },
  row: {
    flexDirection: 'row',
  },
  itemContainer: {
    overflow: 'hidden',
  },
  containedImage: {
    position: 'absolute',
  },
});
