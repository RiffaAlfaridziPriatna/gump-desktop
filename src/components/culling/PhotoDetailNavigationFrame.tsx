import {Pressable} from '@components/ui';
import {colors} from '@lib/ui/colors';
import {useFocusEffect, useIsFocused} from '@react-navigation/native';
import {useCallback, useEffect, useRef, useState, type ReactNode} from 'react';
import {
  DeviceEventEmitter,
  findNodeHandle,
  Platform,
  StyleSheet,
  UIManager,
  View,
  type NativeSyntheticEvent,
} from 'react-native';
import IconChevronLeft from '../../assets/images/icon_chevron_left.svg';
import IconChevronRight from '../../assets/images/icon_chevron_right.svg';

const CHEVRON_SIZE = 72;
/** Slightly larger than the icon so the hover/click target matches the visual button. */
const NAV_BUTTON_HIT = 88;
const isDesktopPlatform =
  Platform.OS === 'macos' || Platform.OS === 'windows';

/**
 * Focus a desktop View so keyDownEvents are delivered.
 * Prefer UIManager.focus over host `.focus()` — the latter routes through
 * TextInputState and can later dispatch `blur` to a stale react tag, crashing
 * macOS with "Bridge module (null) does not conform to RCTBridgeModule".
 *
 * On Windows New Architecture, UIManager.focus is not registered (iOS-only in
 * BridgelessUIManager), so we dispatch Fabric's "focus" command instead.
 */
function focusDesktopView(node: View | null) {
  if (!node || !isDesktopPlatform) {
    return;
  }

  if (Platform.OS === 'windows') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const {dispatchCommand} = require('react-native/Libraries/ReactNative/RendererProxy');
      dispatchCommand(node, 'focus', []);
    } catch {
      // Fall through — Windows also uses the GumpKeyboard native hook.
    }
    return;
  }

  const reactTag = findNodeHandle(node);
  if (reactTag == null) {
    return;
  }
  const focus = (
    UIManager as typeof UIManager & {focus?: (tag: number) => void}
  ).focus;
  focus?.(reactTag);
}

type PhotoNavKeyEvent = NativeSyntheticEvent<{
  ArrowLeft?: boolean;
  ArrowRight?: boolean;
  key?: string;
  code?: string;
}>;

type Props = {
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  /** Hover chevrons are desktop-only; keyboard nav still works when enabled. */
  showHoverChevrons: boolean;
  children: ReactNode;
};

function matchesPhotoNavKey(
  nativeEvent: PhotoNavKeyEvent['nativeEvent'],
  direction: 'prev' | 'next',
): boolean {
  if (direction === 'prev') {
    if (nativeEvent.ArrowLeft) {
      return true;
    }
    const key = nativeEvent.key ?? nativeEvent.code;
    return key === 'ArrowLeft';
  }

  if (nativeEvent.ArrowRight) {
    return true;
  }
  const key = nativeEvent.key ?? nativeEvent.code;
  return key === 'ArrowRight';
}

/** Bubbling (3) so Windows marks ArrowLeft/Right handled on this focused view. */
const HANDLED_BUBBLING = 3;

const photoNavKeyDownEvents =
  Platform.OS === 'windows'
    ? [
        {code: 'ArrowLeft', handledEventPhase: HANDLED_BUBBLING},
        {code: 'ArrowRight', handledEventPhase: HANDLED_BUBBLING},
      ]
    : [{key: 'ArrowLeft'}, {key: 'ArrowRight'}];

export function PhotoDetailNavigationFrame({
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
  showHoverChevrons,
  children,
}: Props) {
  const [photoHovered, setPhotoHovered] = useState(false);
  const [prevHovered, setPrevHovered] = useState(false);
  const [nextHovered, setNextHovered] = useState(false);
  const focusRef = useRef<View>(null);
  const isFocused = useIsFocused();
  const canGoPrevRef = useRef(canGoPrev);
  const canGoNextRef = useRef(canGoNext);
  const onPrevRef = useRef(onPrev);
  const onNextRef = useRef(onNext);
  canGoPrevRef.current = canGoPrev;
  canGoNextRef.current = canGoNext;
  onPrevRef.current = onPrev;
  onNextRef.current = onNext;

  const claimKeyboardFocus = useCallback(() => {
    focusDesktopView(focusRef.current);
  }, []);

  const handleKeyDown = useCallback(
    (event: unknown) => {
      if (!isFocused) {
        return;
      }

      const nativeEvent = (event as PhotoNavKeyEvent).nativeEvent;
      if (matchesPhotoNavKey(nativeEvent, 'prev') && canGoPrevRef.current) {
        onPrevRef.current();
        return;
      }
      if (matchesPhotoNavKey(nativeEvent, 'next') && canGoNextRef.current) {
        onNextRef.current();
      }
    },
    [isFocused],
  );

  const handlePrevPress = useCallback(() => {
    onPrev();
    // Windows moves focus to the Pressable on click; reclaim so arrows keep working.
    requestAnimationFrame(claimKeyboardFocus);
  }, [claimKeyboardFocus, onPrev]);

  const handleNextPress = useCallback(() => {
    onNext();
    requestAnimationFrame(claimKeyboardFocus);
  }, [claimKeyboardFocus, onNext]);

  useFocusEffect(
    useCallback(() => {
      if (!isDesktopPlatform) {
        return;
      }
      const frameId = requestAnimationFrame(claimKeyboardFocus);
      return () => cancelAnimationFrame(frameId);
    }, [claimKeyboardFocus]),
  );

  // Windows New Arch: View onKeyDown requires focus, but UIManager.focus is
  // unavailable. GumpKeyboard emits arrow keys while our HWND is foreground.
  useEffect(() => {
    if (Platform.OS !== 'windows' || !isFocused) {
      return;
    }

    const subscription = DeviceEventEmitter.addListener(
      'gumpKeyDown',
      (event: {code?: string}) => {
        if (event?.code === 'ArrowLeft' && canGoPrevRef.current) {
          onPrevRef.current();
          return;
        }
        if (event?.code === 'ArrowRight' && canGoNextRef.current) {
          onNextRef.current();
        }
      },
    );

    return () => {
      subscription.remove();
    };
  }, [isFocused]);

  const showChevrons = showHoverChevrons && photoHovered;

  return (
    <View
      ref={focusRef}
      style={styles.frame}
      tabIndex={0}
      focusable
      enableFocusRing={false}
      onMouseEnter={
        showHoverChevrons
          ? () => {
              setPhotoHovered(true);
              claimKeyboardFocus();
            }
          : undefined
      }
      onMouseLeave={
        showHoverChevrons
          ? () => {
              setPhotoHovered(false);
              setPrevHovered(false);
              setNextHovered(false);
            }
          : undefined
      }
      onKeyDown={handleKeyDown}
      keyDownEvents={photoNavKeyDownEvents}
    >
      {children}

      {showChevrons ? (
        <View pointerEvents="box-none" style={styles.navOverlay}>
          {canGoPrev ? (
            <Pressable
              style={[styles.navButton, styles.navButtonLeft]}
              onPress={handlePrevPress}
              // Keep keyboard focus on the frame — Windows otherwise routes
              // ArrowLeft/Right only to the focused Pressable.
              focusable={false}
              onHoverIn={() => setPrevHovered(true)}
              onHoverOut={() => setPrevHovered(false)}
              accessibilityRole="button"
              accessibilityLabel="Previous photo"
            >
              <IconChevronLeft
                width={CHEVRON_SIZE}
                height={CHEVRON_SIZE}
                color={prevHovered ? colors.white : colors.textGray}
              />
            </Pressable>
          ) : null}

          {canGoNext ? (
            <Pressable
              style={[styles.navButton, styles.navButtonRight]}
              onPress={handleNextPress}
              focusable={false}
              onHoverIn={() => setNextHovered(true)}
              onHoverOut={() => setNextHovered(false)}
              accessibilityRole="button"
              accessibilityLabel="Next photo"
            >
              <IconChevronRight
                width={CHEVRON_SIZE}
                height={CHEVRON_SIZE}
                color={nextHovered ? colors.white : colors.textGray}
              />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    position: 'relative',
  },
  navOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  navButton: {
    position: 'absolute',
    top: '50%',
    marginTop: -NAV_BUTTON_HIT / 2,
    width: NAV_BUTTON_HIT,
    height: NAV_BUTTON_HIT,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  navButtonLeft: {
    left: 8,
  },
  navButtonRight: {
    right: 8,
  },
});
