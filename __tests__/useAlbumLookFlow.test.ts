import {AccessibilityInfo} from 'react-native';
import {act} from 'react-test-renderer';
import {renderHook} from './helpers/render';

const mockApply = jest.fn();
const mockCapture = jest.fn();
const mockReport = jest.fn();
const mockFocus = jest.fn();

jest.mock('@lib/culling/cullingEngine', () => ({
  cullingEngine: {applyAlbumLook: (...a: unknown[]) => mockApply(...a)},
}));
jest.mock('@lib/observability/posthogClient', () => ({
  captureAppEvent: (...a: unknown[]) => mockCapture(...a),
}));
jest.mock('@lib/observability/reportError', () => ({
  reportError: (...a: unknown[]) => mockReport(...a),
}));
jest.mock('@components/modals/focusDesktopNode', () => ({
  focusDesktopNode: (...a: unknown[]) => mockFocus(...a),
}));

import {useAlbumLookFlow} from '../src/hooks/useAlbumLookFlow';

const flush = () => act(async () => {});

function setup(hasPhotos = true) {
  const hook = renderHook(() => useAlbumLookFlow('a1', hasPhotos));
  const editNode = {id: 'edit'};
  const changeNode = {id: 'change'};
  hook.result.current.editPhotosRef.current = editNode as never;
  hook.result.current.changeLookRef.current = changeNode as never;
  return {hook, editNode, changeNode};
}

describe('useAlbumLookFlow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApply.mockResolvedValue(3);
    jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
  });

  it('applies to all photos, reports completed and announces', async () => {
    const {hook, editNode} = setup();
    act(() => hook.result.current.openFromEdit());
    expect(hook.result.current.pickerVisible).toBe(true);
    act(() => hook.result.current.chooseLook('filmMood'));
    expect(hook.result.current.pickerVisible).toBe(false);
    expect(hook.result.current.scopeVisible).toBe(true);
    act(() => hook.result.current.applyAll());
    expect(hook.result.current.scopeVisible).toBe(false);
    expect(mockApply).toHaveBeenCalledWith('a1', 'filmMood', 'allPhotos');
    await flush();
    expect(mockCapture).toHaveBeenCalledWith('apply_look_started', {
      albumId: 'a1',
      lookId: 'filmMood',
      scope: 'allPhotos',
    });
    expect(mockCapture).toHaveBeenCalledWith(
      'apply_look_completed',
      expect.objectContaining({scope: 'allPhotos', photoCount: 3}),
    );
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      expect.stringMatching(/^Look: .+ applied$/),
    );
    expect(mockFocus).toHaveBeenCalledWith(editNode);
  });

  it('new photos only uses newPhotosOnly with count 0', async () => {
    mockApply.mockResolvedValue(0);
    const {hook} = setup();
    act(() => hook.result.current.openFromEdit());
    act(() => hook.result.current.chooseLook('filmMood'));
    act(() => hook.result.current.applyNewOnly());
    await flush();
    expect(mockApply).toHaveBeenCalledWith('a1', 'filmMood', 'newPhotosOnly');
    expect(mockCapture).toHaveBeenCalledWith(
      'apply_look_completed',
      expect.objectContaining({scope: 'newPhotosOnly', photoCount: 0}),
    );
  });

  it('cancel at picker or scope changes nothing and returns focus', () => {
    const {hook, editNode, changeNode} = setup();
    act(() => hook.result.current.openFromChange());
    act(() => hook.result.current.close());
    expect(mockFocus).toHaveBeenLastCalledWith(changeNode);
    act(() => hook.result.current.openFromEdit());
    act(() => hook.result.current.chooseLook('original'));
    expect(hook.result.current.scopeVisible).toBe(true);
    act(() => hook.result.current.close());
    expect(mockFocus).toHaveBeenLastCalledWith(editNode);
    expect(mockApply).not.toHaveBeenCalled();
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('falls back to Edit Photos when Change is not mounted', () => {
    const {hook, editNode} = setup();
    hook.result.current.changeLookRef.current = null;
    act(() => hook.result.current.openFromChange());
    act(() => hook.result.current.close());
    expect(mockFocus).toHaveBeenCalledWith(editNode);
  });

  it('does not open for an empty album', () => {
    const {hook} = setup(false);
    act(() => hook.result.current.openFromEdit());
    expect(hook.result.current.pickerVisible).toBe(false);
  });

  it('reports a failure without throwing and without announcing', async () => {
    const error = new Error('boom');
    mockApply.mockRejectedValue(error);
    const {hook} = setup();
    act(() => hook.result.current.openFromEdit());
    act(() => hook.result.current.chooseLook('filmMood'));
    act(() => hook.result.current.applyAll());
    await flush();
    expect(mockReport).toHaveBeenCalledWith(error, expect.any(Object));
    const failed = mockCapture.mock.calls.find(
      c => c[0] === 'apply_look_failed',
    );
    expect(failed?.[1]).toEqual({
      albumId: 'a1',
      lookId: 'filmMood',
      scope: 'allPhotos',
    });
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
  });

  it('ignores a second applyAll in the same act', () => {
    mockApply.mockReturnValue(new Promise(() => {}));
    const {hook} = setup();
    act(() => hook.result.current.openFromEdit());
    act(() => hook.result.current.chooseLook('filmMood'));
    act(() => {
      hook.result.current.applyAll();
      hook.result.current.applyAll();
    });
    expect(mockApply).toHaveBeenCalledTimes(1);
    act(() => hook.result.current.applyNewOnly());
    expect(mockApply).toHaveBeenCalledTimes(1);
  });

  it('only the latest apply announces; the older reports superseded', async () => {
    const resolvers: ((n: number) => void)[] = [];
    mockApply.mockImplementation(
      () => new Promise<number>(r => resolvers.push(r)),
    );
    const {hook} = setup();
    act(() => hook.result.current.openFromEdit());
    act(() => hook.result.current.chooseLook('filmMood'));
    act(() => hook.result.current.applyAll());
    act(() => hook.result.current.openFromEdit());
    act(() => hook.result.current.chooseLook('cleanNatural'));
    act(() => hook.result.current.applyAll());
    expect(mockApply).toHaveBeenCalledTimes(2);
    resolvers[0](5);
    await flush();
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
    expect(mockCapture).toHaveBeenCalledWith(
      'apply_look_completed',
      expect.objectContaining({photoCount: 5, superseded: true}),
    );
    resolvers[1](2);
    await flush();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledTimes(1);
  });

  it('returns focus to Edit Photos when Change picked Original', () => {
    const {hook, editNode} = setup();
    act(() => hook.result.current.openFromChange());
    act(() => hook.result.current.chooseLook('original'));
    act(() => hook.result.current.applyAll());
    expect(mockFocus).toHaveBeenLastCalledWith(editNode);
  });

  it('focus is a no-op when no trigger is mounted (mobile layout)', () => {
    const {hook} = setup();
    hook.result.current.editPhotosRef.current = null;
    hook.result.current.changeLookRef.current = null;
    act(() => hook.result.current.openFromEdit());
    act(() => hook.result.current.close());
    expect(mockFocus).toHaveBeenLastCalledWith(null);
  });
});
