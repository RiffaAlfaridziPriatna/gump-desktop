import {act} from 'react-test-renderer';
import {renderHook} from './helpers/render';
import {importAlbumPreset} from '../src/lib/look/importAlbumPreset';
import {useImportAlbumPreset} from '../src/hooks/useImportAlbumPreset';

jest.mock('../src/lib/look/importAlbumPreset', () => ({
  importAlbumPreset: jest.fn(),
}));

const run = importAlbumPreset as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('useImportAlbumPreset', () => {
  it('exposes the failure reason and clears it on the next success', async () => {
    const hook = renderHook(() => useImportAlbumPreset('a1'));
    run.mockResolvedValueOnce({status: 'failed', reason: 'unsupported'});
    await act(async () => {
      await hook.result.current.importPreset();
    });
    expect(hook.result.current.error).toBe('unsupported');
    expect(hook.result.current.status).toBe('idle');

    run.mockResolvedValueOnce({status: 'cancelled'});
    await act(async () => {
      await hook.result.current.importPreset();
    });
    expect(hook.result.current.error).toBe('unsupported');

    run.mockResolvedValueOnce({
      status: 'imported',
      customLook: {name: 'x', revision: 'r1', finishing: null},
    });
    await act(async () => {
      await hook.result.current.importPreset();
    });
    expect(hook.result.current.error).toBeNull();
    expect(run).toHaveBeenCalledWith('a1');
  });

  it('ignores a second call while one runs', async () => {
    let resolve!: (value: unknown) => void;
    run.mockReturnValueOnce(new Promise(r => (resolve = r)));
    const hook = renderHook(() => useImportAlbumPreset('a1'));
    let first!: Promise<unknown>;
    act(() => {
      first = hook.result.current.importPreset();
    });
    expect(hook.result.current.status).toBe('importing');
    await act(async () => {
      await expect(hook.result.current.importPreset()).resolves.toEqual({
        status: 'cancelled',
      });
    });
    await act(async () => {
      resolve({status: 'cancelled'});
      await first;
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(hook.result.current.status).toBe('idle');
  });
});
