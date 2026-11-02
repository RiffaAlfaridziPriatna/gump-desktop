import {reportError} from '@lib/observability/reportError';
import {findNodeHandle, Platform, UIManager, type View} from 'react-native';

/**
 * Host `.focus()` can crash macOS later (see PhotoDetailNavigationFrame), so
 * focus through UIManager on macOS and the Fabric command on Windows.
 */
export function focusDesktopNode(node: View | null) {
  const reactTag = node ? findNodeHandle(node) : null;
  if (reactTag == null) {
    return;
  }
  try {
    if (Platform.OS === 'windows') {
      UIManager.dispatchViewManagerCommand(reactTag, 'focus', []);
    } else {
      (UIManager as typeof UIManager & {focus?: (tag: number) => void}).focus?.(
        reactTag,
      );
    }
  } catch (error) {
    reportError(error, {step: 'focusDesktopNode'});
  }
}
