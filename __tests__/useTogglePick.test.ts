const mockUpdateSelection = jest.fn();

jest.mock('@lib/culling/cullingEngine', () => ({
  cullingEngine: {
    updateSelection: (...args: unknown[]) => mockUpdateSelection(...args),
  },
}));

import {useTogglePick} from '../src/hooks/useTogglePick';
import {renderHook} from './helpers/render';

describe('useTogglePick', () => {
  beforeEach(() => {
    mockUpdateSelection.mockReset();
    mockUpdateSelection.mockResolvedValue(undefined);
  });

  it('writes the pick through cullingEngine.updateSelection', async () => {
    const hook = renderHook(() => useTogglePick('album-1'));
    await hook.result.current('photo-2', true);
    await hook.result.current('photo-2', false);
    expect(mockUpdateSelection.mock.calls).toEqual([
      ['album-1', 'photo-2', {selected: true}],
      ['album-1', 'photo-2', {selected: false}],
    ]);
    hook.unmount();
  });

  it('passes a rejected write to the caller', async () => {
    const error = new Error('Cannot modify photos after upload');
    mockUpdateSelection.mockRejectedValue(error);
    const hook = renderHook(() => useTogglePick('album-1'));
    await expect(hook.result.current('photo-2', true)).rejects.toBe(error);
    hook.unmount();
  });

  it('keeps the same callback across renders for one album', () => {
    const hook = renderHook(() => useTogglePick('album-1'));
    const first = hook.result.current;
    hook.rerender();
    expect(hook.result.current).toBe(first);
    hook.unmount();
  });
});
