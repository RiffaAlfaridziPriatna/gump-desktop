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
import {reportError} from '@lib/observability/reportError';
import {addErrorStep} from '@lib/observability/posthogClient';
import {
  createContext,
  forwardRef,
  memo,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
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
const SCROLL_TO_TOP_DURATION_MS = 450;
const SCROLL_TO_TOP_NUDGE_PX = 1;
const PROGRAMMATIC_SCROLL_GRACE_MS = 120;
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

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
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
  const forceToTopFrameRef = useRef<number | null>(null);
  const programmaticGraceUntilRef = useRef(0);
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

  const ignoreViewabilityUntilRef = useRef(0);

  const cancelScrollAnimation = useCallback(() => {
    if (scrollAnimationFrameRef.current != null) {
      cancelAnimationFrame(scrollAnimationFrameRef.current);
      scrollAnimationFrameRef.current = null;
    }
    isProgrammaticScrollRef.current = false;
  }, []);

  const forceNativeToTop = useCallback((list: FlatList<PhotoGridRow>) => {
    // RN macOS no-ops scrollTo(0) when its shadow offset is already 0,
    // even if the NSScroller already moved the clip view. Nudge first,
    // on the next frame, so the two commands are not coalesced into the
    // no-op. Keep this rAF off the ease-out cancel path — leftover thumb
    // onScroll must not swallow the second command.
    list.scrollToOffset({offset: SCROLL_TO_TOP_NUDGE_PX, animated: false});
    if (forceToTopFrameRef.current != null) {
      cancelAnimationFrame(forceToTopFrameRef.current);
    }
    forceToTopFrameRef.current = requestAnimationFrame(() => {
      forceToTopFrameRef.current = null;
      list.scrollToOffset({offset: 0, animated: false});
    });
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
    if (!list) {
      reportError(new Error('Photo grid scroll-to-top missing list ref'), {
        source: 'photo_grid',
        operation: 'scroll_to_top',
        ...captureScrollDiagnostics(),
      });
      return;
    }

    if (scrollAnimationFrameRef.current != null) {
      cancelAnimationFrame(scrollAnimationFrameRef.current);
      scrollAnimationFrameRef.current = null;
    }

    // Use the larger of the reported offset and the estimate from the
    // last-known visible row.  On macOS Sonoma, thumb-drag throttles
    // onScroll events so scrollOffsetRef stays near 0 even though the
    // user scrolled far down.  firstVisibleRowRef (updated by
    // onViewableItemsChanged) gives us a second estimate.
    const reportedOffset = scrollOffsetRef.current;
    const currentRowHeight = rowHeightRef.current;
    const estimatedOffset = firstVisibleRowRef.current * currentRowHeight;
    const lastNativeOffset = lastScrollEventRef.current?.contentOffsetY ?? 0;
    const viewableOffset =
      (lastViewableRangeRef.current?.minRow ?? 0) * currentRowHeight;
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

    addErrorStep('scroll_to_top', {
      albumId: albumIdRef.current ?? null,
      itemCount: itemsRef.current.length,
      startOffset,
      reportedOffset,
      estimatedOffset,
      lastNativeOffset,
      viewableOffset,
      firstVisibleRow: firstVisibleRowRef.current,
      platform: Platform.OS,
    });

    const verifyReachedTop = () => {
      const remainingOffset = Math.max(
        scrollOffsetRef.current,
        lastScrollEventRef.current?.contentOffsetY ?? 0,
        firstVisibleRowRef.current * rowHeightRef.current,
      );
      const remainingViewableRow = lastViewableRangeRef.current?.minRow ?? 0;
      if (remainingOffset <= 80 && remainingViewableRow <= 1) {
        firstVisibleRowRef.current = 0;
        scrollOffsetRef.current = 0;
        lastViewableRangeRef.current = {
          minIndex: 0,
          maxIndex: 0,
          minRow: 0,
          at: Date.now(),
        };
        return;
      }
      const diagnostics = {
        ...startSnapshot,
        ...captureScrollDiagnostics(),
        remainingOffset,
        remainingViewableRow,
      };
      console.error(
        '[PhotoGrid] scroll-to-top did not reach the top',
        diagnostics,
      );
      reportError(new Error('Photo grid scroll-to-top did not reach the top'), {
        source: 'photo_grid',
        operation: 'scroll_to_top',
        ...diagnostics,
      });
    };

    const scheduleVerify = () => {
      setTimeout(verifyReachedTop, SCROLL_SETTLE_MS + 80);
    };

    if (startOffset <= 16) {
      // JS thinks we are near the top. Native clip-view can still be
      // scrolled; verify after the nudge instead of trusting that.
      lastPreloadRangeRef.current = '';
      lastHydrateRangeRef.current = '';
      lastThumbnailRangeRef.current = '';
      pendingViewableRef.current = null;
      ignoreViewabilityUntilRef.current = 0;
      isScrollingRef.current = false;
      isProgrammaticScrollRef.current = false;
      try {
        list.scrollToIndex({index: 0, animated: false, viewPosition: 0});
      } catch (error) {
        reportError(error, {
          source: 'photo_grid',
          operation: 'scroll_to_index',
          ...captureScrollDiagnostics(),
        });
      }
      forceNativeToTop(list);
      scheduleVerify();
      return;
    }

    isProgrammaticScrollRef.current = true;
    isScrollingRef.current = true;
    programmaticGraceUntilRef.current =
      Date.now() + PROGRAMMATIC_SCROLL_GRACE_MS;
    // Programmatic flight would otherwise hydrate/load every window we pass.
    ignoreViewabilityUntilRef.current =
      Date.now() + SCROLL_TO_TOP_DURATION_MS + SCROLL_SETTLE_MS;

    const startTime = Date.now();

    const finish = () => {
      forceNativeToTop(list);
      scrollAnimationFrameRef.current = null;
      isProgrammaticScrollRef.current = false;
      ignoreViewabilityUntilRef.current = 0;
      isScrollingRef.current = false;
      scheduleVerify();
    };

    const step = () => {
      if (!isProgrammaticScrollRef.current) {
        scrollAnimationFrameRef.current = null;
        return;
      }

      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / SCROLL_TO_TOP_DURATION_MS);
      const nextOffset = startOffset * (1 - easeOutCubic(progress));

      list.scrollToOffset({offset: nextOffset, animated: false});

      if (progress < 1) {
        scrollAnimationFrameRef.current = requestAnimationFrame(step);
        return;
      }

      finish();
    };

    scrollAnimationFrameRef.current = requestAnimationFrame(step);
  }, [captureScrollDiagnostics, forceNativeToTop]);

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
      if (forceToTopFrameRef.current != null) {
        cancelAnimationFrame(forceToTopFrameRef.current);
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

  // When deferHeavyMediaWork flips true, FlatList's windowSize shrinks
  // (7 → 3).  If VirtualizedList's internal scroll-metrics offset is
  // desynced (stuck near 0 due to Sonoma onScroll throttling), it
  // re-renders cells near the top — a "virtual scroll-to-top" that also
  // blocks the main thread and delays the UploadToast.  Scrolling to the
  // last-known visible row before paint keeps both the native clip-view
  // and VirtualizedList converged on the correct position.
  useLayoutEffect(() => {
    if (!deferHeavyMediaWork || firstVisibleRowRef.current <= 0) {
      return;
    }
    const list = listRef.current;
    if (!list) {
      return;
    }
    try {
      list.scrollToIndex({
        index: firstVisibleRowRef.current,
        animated: false,
        viewPosition: 0,
      });
    } catch {
      // scrollToIndex may throw if layout is unknown
    }
  }, [deferHeavyMediaWork]);

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
        // Animation frames move toward 0. A jump downward after the grace
        // window means the user grabbed the scrollbar thumb — onScrollBeginDrag
        // does not fire for that. Ignore stale thumb events at the start;
        // do not use |delta| > N: our own scrollToOffset steps are much larger.
        if (
          Date.now() >= programmaticGraceUntilRef.current &&
          nextOffset > previousOffset + 30
        ) {
          cancelScrollAnimation();
          markScrolling();
        }
        return;
      }
      if (delta < 1 && !isScrollingRef.current) {
        return;
      }
      markScrolling();
    },
    [cancelScrollAnimation, markScrolling],
  );

  const handleScrollBeginDrag = useCallback(() => {
    cancelScrollAnimation();
    ignoreViewabilityUntilRef.current = 0;
    markScrolling();
  }, [cancelScrollAnimation, markScrolling]);

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

      if (Date.now() < ignoreViewabilityUntilRef.current) {
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

      const currentRowHeight = rowHeightRef.current;
      if (currentRowHeight > 0) {
        const estimatedOffset = minRowIndex * currentRowHeight;
        if (estimatedOffset > scrollOffsetRef.current + currentRowHeight * 2) {
          scrollOffsetRef.current = estimatedOffset;
        }
      }

      const {start, end} = getScrollPreloadRange(
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
            ref={listRef}
            data={rows}
            renderItem={renderRow}
            keyExtractor={keyExtractor}
            getItemLayout={getItemLayout}
            extraData={settledItemWidth}
            windowSize={
              deferHeavyMediaWork || Platform.OS === 'windows' ? 3 : 7
            }
            removeClippedSubviews={false}
            initialNumToRender={PLACEHOLDER_INITIAL_ROWS}
            maxToRenderPerBatch={deferHeavyMediaWork ? 3 : 6}
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
