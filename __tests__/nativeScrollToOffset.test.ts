jest.mock('react-native', () => ({
  Platform: {OS: 'macos'},
  findNodeHandle: () => 42,
  NativeModules: {
    GumpScrollView: {
      scrollToOffset: jest.fn(),
    },
  },
}));

import {NativeModules} from 'react-native';
import {nativeScrollToOffset} from '../src/lib/ui/nativeScrollToOffset';

const scrollToOffset = NativeModules.GumpScrollView
  ?.scrollToOffset as jest.Mock;

describe('nativeScrollToOffset', () => {
  beforeEach(() => {
    scrollToOffset.mockReset();
  });

  it('reports a resolved native jump with before/after state', async () => {
    scrollToOffset.mockResolvedValue({
      resolved: true,
      reason: 'ok',
      viewClass: 'RCTScrollView',
      beforeVisibleY: 362049.5,
      afterVisibleY: 0,
      moved: true,
      atTarget: true,
    });
    const result = await nativeScrollToOffset({}, 0);
    expect(scrollToOffset).toHaveBeenCalledWith(42, 0);
    expect(result.resolved).toBe(true);
    expect(result.moved).toBe(true);
    expect(result.atTarget).toBe(true);
    expect(result.beforeVisibleY).toBe(362049.5);
  });

  it('surfaces the native reason code when the scroll view is not found', async () => {
    scrollToOffset.mockResolvedValue({
      resolved: false,
      reason: 'scroll_view_not_found',
      viewClass: 'RCTView',
    });
    const result = await nativeScrollToOffset({}, 0);
    expect(result.resolved).toBe(false);
    expect(result.reason).toBe('scroll_view_not_found');
    expect(result.viewClass).toBe('RCTView');
  });

  it('returns native_call_threw when the bridge rejects', async () => {
    scrollToOffset.mockRejectedValue(new Error('missing view'));
    const result = await nativeScrollToOffset({}, 0);
    expect(result.resolved).toBe(false);
    expect(result.reason).toBe('native_call_threw');
  });
});
