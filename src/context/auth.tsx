import {
  useRef,
  createContext,
  PropsWithChildren,
  useEffect,
  useCallback,
} from 'react';
import {
  deleteAuthToken,
  getAuthToken,
  setAuthToken,
} from '@lib/auth/authTokenStorage';
import {purgeAllLocalCulledAlbums} from '@lib/culledAlbum/service';
import {createStateStore, StateStore, useStateStore} from '@lib/react/state';
import {useContextOrThrow} from '@lib/react/context';
import {make} from '@di/tsyringe';
import {identifyUser, reportError, resetIdentifiedUser} from '@lib/observability';
import {APIService, APIResponse} from '@services/api';
import {useQuery, useQueryClient} from '@tanstack/react-query';

export type AuthState = {
  user: APIResponse.User | APIResponse.Guest | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
};

type AuthActions = {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loadStoredAuth: () => Promise<void>;
};

const AuthContext = createContext<StateStore<AuthState> | null>(null);
AuthContext.displayName = 'AuthContext';

const AuthActionsContext = createContext<AuthActions | null>(null);
AuthActionsContext.displayName = 'AuthActionsContext';

export function AuthProvider({children}: PropsWithChildren) {
  const storeRef = useRef<StateStore<AuthState>>(null);
  const queryClient = useQueryClient();

  if (!storeRef.current) {
    storeRef.current = createStateStore<AuthState>({
      user: null,
      token: null,
      isLoading: true,
      isAuthenticated: false,
    });
  }

  const login = useCallback(
    async (email: string, password: string) => {
      const api = make(APIService);
      const response = await api.auth.login({email, password});

      await setAuthToken(response.token);
      api.agent.setToken(response.token);

      storeRef.current!.setState({
        user: response.user,
        token: response.token,
        isAuthenticated: true,
        isLoading: false,
      });

      identifyUser(response.user);

      queryClient.setQueryData(['currentUser', response.token], response.user);
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await purgeAllLocalCulledAlbums();
    } catch (error) {
      reportError(error, {
        source: 'auth',
        operation: 'purge_local_albums_on_logout',
      });
    }

    await deleteAuthToken();
    make(APIService).agent.setToken(null);

    storeRef.current!.setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });

    queryClient.clear();
    resetIdentifiedUser();
  }, [queryClient]);

  const loadStoredAuth = useCallback(async () => {
    const AUTH_RESTORE_TIMEOUT_MS = 8_000;
    console.warn('[gump] auth: restore start');
    try {
      const token = await Promise.race([
        getAuthToken(),
        new Promise<string | null>((_, reject) => {
          setTimeout(
            () =>
              reject(
                new Error(
                  `getAuthToken timed out after ${AUTH_RESTORE_TIMEOUT_MS}ms`,
                ),
              ),
            AUTH_RESTORE_TIMEOUT_MS,
          );
        }),
      ]);
      console.warn(
        `[gump] auth: token ${token ? 'present' : 'missing'}`,
      );
      if (token) {
        const api = make(APIService);
        api.agent.setToken(token);
        const user = await Promise.race([
          api.auth.getCurrentUser(),
          new Promise<never>((_, reject) => {
            setTimeout(
              () =>
                reject(
                  new Error(
                    `getCurrentUser timed out after ${AUTH_RESTORE_TIMEOUT_MS}ms`,
                  ),
                ),
              AUTH_RESTORE_TIMEOUT_MS,
            );
          }),
        ]);

        if (user && user.role !== 'guest') {
          storeRef.current!.setState({
            user,
            token,
            isAuthenticated: true,
            isLoading: false,
          });
          console.warn('[gump] auth: restored session');
          identifyUser(user);
          return;
        }
      }
    } catch (error) {
      console.warn(
        `[gump] auth: restore failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      reportError(error, {source: 'auth', operation: 'restore_session'});
      try {
        await Promise.race([
          deleteAuthToken(),
          new Promise<never>((_, reject) => {
            setTimeout(
              () => reject(new Error('deleteAuthToken timed out')),
              2_000,
            );
          }),
        ]);
      } catch {
        // AsyncStorage may be wedged; continue to unauthenticated UI.
      }
    }

    console.warn('[gump] auth: restore done (unauthenticated)');
    storeRef.current!.setState({isLoading: false});
  }, []);

  useEffect(() => {
    loadStoredAuth();
  }, [loadStoredAuth]);

  const actions: AuthActions = {login, logout, loadStoredAuth};

  return (
    <AuthContext.Provider value={storeRef.current}>
      <AuthActionsContext.Provider value={actions}>
        {children}
      </AuthActionsContext.Provider>
    </AuthContext.Provider>
  );
}

export function useAuthState<R = AuthState>(
  selector?: (state: AuthState) => R,
): R {
  return useStateStore(useContextOrThrow(AuthContext), selector);
}

export function useAuthActions(): AuthActions {
  return useContextOrThrow(AuthActionsContext);
}

export function useCurrentUser(token: string | null) {
  const api = make(APIService);

  return useQuery({
    queryKey: ['currentUser', token],
    queryFn: async () => {
      if (!token) return null;
      api.agent.setToken(token);
      return await api.auth.getCurrentUser();
    },
    enabled: Boolean(token),
    staleTime: Infinity,
    retry: false,
  });
}
