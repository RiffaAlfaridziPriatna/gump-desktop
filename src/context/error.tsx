import {createContext, PropsWithChildren, useCallback, useRef} from 'react';
import {createStateStore, StateStore, useStateStore} from '@lib/react/state';
import {useContextOrThrow} from '@lib/react/context';
import {APIException} from '@services/api/exception';

export type ErrorState = {
  error: {
    id: string;
    message: string;
    code?: string;
    statusCode?: number;
  } | null;
  visible: boolean;
};

type ErrorActions = {
  showError: (error: Error | APIException | string) => void;
  hideError: () => void;
  clearError: () => void;
};

const ErrorContext = createContext<StateStore<ErrorState> | null>(null);
ErrorContext.displayName = 'ErrorContext';

const ErrorActionsContext = createContext<ErrorActions | null>(null);
ErrorActionsContext.displayName = 'ErrorActionsContext';

function generateErrorId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function ErrorProvider({children}: PropsWithChildren) {
  const storeRef = useRef<StateStore<ErrorState>>(null);

  if (!storeRef.current) {
    storeRef.current = createStateStore<ErrorState>({
      error: null,
      visible: false,
    });
  }

  const showError = useCallback((error: Error | APIException | string) => {
    let errorData: ErrorState['error'];

    if (typeof error === 'string') {
      errorData = {
        id: generateErrorId(),
        message: error,
      };
    } else if (error instanceof APIException) {
      errorData = {
        id: generateErrorId(),
        message: error.message,
        code: error.name,
        statusCode: error.statusCode,
      };
    } else {
      errorData = {
        id: generateErrorId(),
        message: error.message || 'An unexpected error occurred',
      };
    }

    storeRef.current!.setState({
      error: errorData,
      visible: true,
    });
  }, []);

  const hideError = useCallback(() => {
    storeRef.current!.setState(state => {
      state.visible = false;
    });
  }, []);

  const clearError = useCallback(() => {
    storeRef.current!.setState({
      error: null,
      visible: false,
    });
  }, []);

  const actions: ErrorActions = {showError, hideError, clearError};

  return (
    <ErrorContext.Provider value={storeRef.current}>
      <ErrorActionsContext.Provider value={actions}>
        {children}
      </ErrorActionsContext.Provider>
    </ErrorContext.Provider>
  );
}

export function useErrorState<R = ErrorState>(
  selector?: (state: ErrorState) => R,
): R {
  return useStateStore(useContextOrThrow(ErrorContext), selector);
}

export function useErrorActions(): ErrorActions {
  return useContextOrThrow(ErrorActionsContext);
}
