import {act} from 'react-test-renderer';
import {renderHook} from './helpers/render';

const mockApply = jest.fn();
const mockReport = jest.fn();

jest.mock('@lib/culling/cullingEngine', () => ({
  cullingEngine: {applyAiSelectionLevel: (...a: unknown[]) => mockApply(...a)},
}));
jest.mock('@lib/observability/reportError', () => ({
  reportError: (...a: unknown[]) => mockReport(...a),
}));

import {useAiSelectionFlow} from '../src/hooks/useAiSelectionFlow';

const flush = () => act(async () => {});

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
}

describe('useAiSelectionFlow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApply.mockResolvedValue(7);
  });

  it('draft change alone makes no engine call and falls back to applied', () => {
    const hook = renderHook(() => useAiSelectionFlow('a1', 'balanced'));
    expect(hook.result.current.draftLevel).toBe('balanced');
    act(() => hook.result.current.setDraftLevel('more'));
    expect(hook.result.current.draftLevel).toBe('more');
    expect(hook.result.current.appliedLevel).toBe('balanced');
    expect(mockApply).not.toHaveBeenCalled();
    expect(hook.result.current.status).toBe('idle');
  });

  it('goes idle -> updating -> updated and resets the draft', async () => {
    const d = deferred<number>();
    mockApply.mockReturnValue(d.promise);
    const hook = renderHook(() => useAiSelectionFlow('a1', 'balanced'));
    act(() => hook.result.current.setDraftLevel('fewer'));
    act(() => hook.result.current.update());
    expect(hook.result.current.status).toBe('updating');
    expect(mockApply).toHaveBeenCalledWith('a1', 'fewer');
    await act(async () => d.resolve(12));
    expect(hook.result.current.status).toBe('updated');
    expect(hook.result.current.recommendedCount).toBe(12);
    expect(hook.result.current.lastAppliedLevel).toBe('fewer');
    expect(hook.result.current.draftLevel).toBe('balanced');
    act(() => hook.result.current.dismiss());
    expect(hook.result.current.status).toBe('idle');
    expect(hook.result.current.recommendedCount).toBeNull();
  });

  it('reports a rejected update once and ends failed; retry works', async () => {
    const error = new Error('boom');
    mockApply.mockRejectedValueOnce(error);
    const hook = renderHook(() => useAiSelectionFlow('a1', 'balanced'));
    act(() => hook.result.current.update());
    await flush();
    expect(hook.result.current.status).toBe('failed');
    expect(mockReport).toHaveBeenCalledTimes(1);
    expect(mockReport).toHaveBeenCalledWith(error, {
      step: 'applyAiSelectionLevel',
    });
    act(() => hook.result.current.retry());
    await flush();
    expect(mockApply).toHaveBeenCalledTimes(2);
    expect(hook.result.current.status).toBe('updated');
    expect(mockReport).toHaveBeenCalledTimes(1);
  });

  it('double press while updating makes one call', async () => {
    const d = deferred<number>();
    mockApply.mockReturnValue(d.promise);
    const hook = renderHook(() => useAiSelectionFlow('a1', 'balanced'));
    act(() => {
      hook.result.current.update();
      hook.result.current.update();
    });
    expect(mockApply).toHaveBeenCalledTimes(1);
    await act(async () => d.resolve(1));
  });

  it('ignores a run finishing after unmount', async () => {
    const d = deferred<number>();
    mockApply.mockReturnValue(d.promise);
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const hook = renderHook(() => useAiSelectionFlow('a1', 'balanced'));
    act(() => hook.result.current.update());
    hook.unmount();
    await act(async () => d.resolve(3));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('ignores a run finishing after the album changed', async () => {
    const d = deferred<number>();
    mockApply.mockReturnValue(d.promise);
    let albumId = 'a1';
    const hook = renderHook(() => useAiSelectionFlow(albumId, 'balanced'));
    act(() => hook.result.current.update());
    albumId = 'a2';
    hook.rerender();
    await act(async () => d.resolve(9));
    expect(hook.result.current.status).toBe('idle');
    expect(hook.result.current.recommendedCount).toBeNull();
    expect(hook.result.current.lastAppliedLevel).toBeNull();
  });
});
