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
} from '@lib/authTokenStorage';
import {createStateStore, StateStore, useStateStore} from '@lib/state';
import {useContextOrThrow} from '@lib/context';
import {make} from '@lib/di';
import {APIService, APIResponse} from '@services/api';

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

  if (!storeRef.current) {
    storeRef.current = createStateStore<AuthState>({
      user: null,
      token: null,
      isLoading: true,
      isAuthenticated: false,
    });
  }

  const login = useCallback(async (email: string, password: string) => {
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
  }, []);

  const logout = useCallback(async () => {
    await deleteAuthToken();
    make(APIService).agent.setToken(null);

    storeRef.current!.setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });
  }, []);

  const loadStoredAuth = useCallback(async () => {
    try {
      const token = await getAuthToken();
      if (token) {
        const api = make(APIService);
        api.agent.setToken(token);
        const user = await api.auth.getCurrentUser();

        if (user && user.role !== 'guest') {
          storeRef.current!.setState({
            user,
            token,
            isAuthenticated: true,
            isLoading: false,
          });
          return;
        }
      }
    } catch {
      await deleteAuthToken();
    }

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
