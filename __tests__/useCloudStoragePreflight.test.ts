import {act} from 'react-test-renderer';

import {
  makeCurrentUserRefetch,
  type FakeCloudStorageScenario,
} from './helpers/exportUploadFakes';
import {renderHook} from './helpers/render';

const GB = 1024 ** 3;
const mockReportError = jest.fn();
const mockRemove = jest.fn();
let mockRefetch: ReturnType<typeof makeCurrentUserRefetch>;
let mockAppStateListener: ((state: string) => void) | null = null;

jest.mock('@lib/observability/reportError', () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
}));
jest.mock('@hooks/useAuth', () => ({
  useAuthState: (selector: (s: {token: string}) => unknown) =>
    selector({token: 't'}),
}));
jest.mock('react-native', () => ({
  NativeModules: {},
  Platform: {OS: 'macos'},
  AppState: {
    addEventListener: (_: string, cb: (state: string) => void) => {
      mockAppStateListener = cb;
      return {remove: mockRemove};
    },
  },
}));
jest.mock('@context/auth', () => {
  const {useCallback, useState} = jest.requireActual('react');
  return {
    useCurrentUser: () => {
      const [data, setData] = useState(null);
      const refetch = useCallback(async () => {
        const result = await mockRefetch();
        if (!result.isError) {
          setData(result.data);
        }
        return {isError: false, ...result};
      }, []);
      return {data, refetch};
    },
  };
});

import {useCloudStoragePreflight} from '../src/hooks/useCloudStoragePreflight';

async function mountWith(
  scenario: FakeCloudStorageScenario,
  uploadBytes: number,
  isOpen = true,
) {
  mockRefetch = makeCurrentUserRefetch(scenario);
  const hook = renderHook(() => useCloudStoragePreflight(isOpen, uploadBytes));
  await act(async () => {});
  return hook;
}

describe('useCloudStoragePreflight', () => {
  beforeEach(() => {
    mockReportError.mockReset();
    mockRemove.mockReset();
    mockAppStateListener = null;
  });

  it('is checking until the mount refetch settles', async () => {
    mockRefetch = makeCurrentUserRefetch('normal');
    const hook = renderHook(() => useCloudStoragePreflight(true, GB));
    expect(hook.result.current.preflight).toEqual({status: 'checking'});
    await act(async () => {});
    expect(hook.result.current.preflight.status).toBe('ok');
    hook.unmount();
  });

  it('is ok with numbers derived in bytes', async () => {
    const hook = await mountWith('normal', 2 * GB);
    expect(hook.result.current.preflight).toEqual({
      status: 'ok',
      uploadBytes: 2 * GB,
      usedBytes: 120.4 * GB,
      limitBytes: 300 * GB,
      afterBytes: 120.4 * GB + 2 * GB,
    });
    hook.unmount();
  });

  it('is nearLimit when the remainder is under 5% of the limit', async () => {
    const hook = await mountWith('nearLimit', 0.1 * GB);
    expect(hook.result.current.preflight.status).toBe('nearLimit');
    hook.unmount();
  });

  it('is exceeded when used + upload passes the limit', async () => {
    const hook = await mountWith('exceeded', 1 * GB);
    expect(hook.result.current.preflight.status).toBe('exceeded');
    hook.unmount();
  });

  it('is ok without a limit on an unlimited plan', async () => {
    const hook = await mountWith('unlimited', 500 * GB);
    expect(hook.result.current.preflight).toMatchObject({
      status: 'ok',
      limitBytes: null,
    });
    hook.unmount();
  });

  it('is unavailable on refetch error and retry recovers', async () => {
    const hook = await mountWith('refetchFails', GB);
    expect(hook.result.current.preflight).toEqual({status: 'unavailable'});
    expect(mockReportError).toHaveBeenCalledTimes(1);

    mockRefetch = makeCurrentUserRefetch('normal');
    await act(async () => {
      hook.result.current.retry();
    });
    expect(hook.result.current.preflight.status).toBe('ok');
    hook.unmount();
  });

  it('refetches when the app becomes active while open', async () => {
    const hook = await mountWith('normal', GB);
    expect(mockRefetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      mockAppStateListener?.('background');
    });
    expect(mockRefetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      mockAppStateListener?.('active');
    });
    expect(mockRefetch).toHaveBeenCalledTimes(2);
    hook.unmount();
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  it('treats a resolved isError result as unavailable despite stale data', async () => {
    const okUser = (await makeCurrentUserRefetch('normal')()).data;
    mockRefetch = jest.fn(async () => ({
      isError: true,
      error: new Error('fake query error'),
      data: okUser,
    })) as unknown as typeof mockRefetch;
    const hook = renderHook(() => useCloudStoragePreflight(true, GB));
    await act(async () => {});
    expect(hook.result.current.preflight).toEqual({status: 'unavailable'});
    expect(mockReportError).toHaveBeenCalledTimes(1);
    hook.unmount();
  });

  it('fails closed on NaN or negative upload bytes', async () => {
    for (const bytes of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      const hook = await mountWith('normal', bytes);
      expect(hook.result.current.preflight).toEqual({status: 'unavailable'});
      hook.unmount();
    }
  });

  it('is checking right after retry() and resets on close', async () => {
    const hook = await mountWith('normal', GB);
    act(() => {
      hook.result.current.retry();
    });
    expect(hook.result.current.preflight).toEqual({status: 'checking'});
    await act(async () => {});
    expect(hook.result.current.preflight.status).toBe('ok');
    hook.unmount();
  });

  it('shows checking on reopen and drops a stale in-flight result', async () => {
    let resolveOld!: (v: unknown) => void;
    mockRefetch = jest.fn(
      () => new Promise(resolve => (resolveOld = resolve)),
    ) as unknown as typeof mockRefetch;
    let open = true;
    const hook = renderHook(() => useCloudStoragePreflight(open, GB));
    open = false;
    hook.rerender();
    mockRefetch = makeCurrentUserRefetch('normal');
    open = true;
    hook.rerender();
    expect(hook.result.current.preflight).toEqual({status: 'checking'});
    await act(async () => {
      resolveOld({isError: true, error: new Error('late'), data: null});
    });
    await act(async () => {});
    expect(hook.result.current.preflight.status).toBe('ok');
    hook.unmount();
  });

  it('follows the newer refetch when an older one resolves last', async () => {
    const resolvers: Array<(v: unknown) => void> = [];
    mockRefetch = jest.fn(
      () => new Promise(resolve => resolvers.push(resolve)),
    ) as unknown as typeof mockRefetch;
    const hook = renderHook(() => useCloudStoragePreflight(true, GB));
    act(() => {
      hook.result.current.retry();
    });
    const ok = (await makeCurrentUserRefetch('normal')()).data;
    await act(async () => {
      resolvers[1]({isError: false, data: ok});
    });
    expect(hook.result.current.preflight.status).toBe('ok');
    await act(async () => {
      resolvers[0]({isError: true, error: new Error('old'), data: null});
    });
    expect(hook.result.current.preflight.status).toBe('ok');
    hook.unmount();
  });

  it('does not refetch or listen while closed', async () => {
    const hook = await mountWith('normal', GB, false);
    expect(mockRefetch).not.toHaveBeenCalled();
    expect(mockAppStateListener).toBeNull();
    hook.unmount();
  });
});
