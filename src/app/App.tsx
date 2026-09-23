import {AuthProvider, useAuthState} from '@context/auth';
import {CulledAlbumProvider} from '@context/culledAlbum';
import {ErrorProvider} from '@context/error';
import {AppErrorBoundary, ErrorToast} from '@components/error';
import {
  installGlobalErrorReporting,
  isPostHogEnabled,
  posthog,
  reportError,
} from '@lib/observability';
import {startupLog} from '@lib/observability/startupLog';
import {colors} from '@lib/ui/colors';
import {DefaultTheme, NavigationContainer} from '@react-navigation/native';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import {PostHogProvider} from 'posthog-react-native';
import {useEffect, useState} from 'react';
import {AuthNavigator} from './AuthNavigator';
import {MainNavigator} from './MainNavigator';

installGlobalErrorReporting();
startupLog(
  `App module load platform=${Platform.OS} posthog=${isPostHogEnabled}`,
);

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      reportError(error, {
        source: 'react_query',
        operation: 'query',
        queryKey: stringifyQueryKey(query.queryKey),
      });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      reportError(error, {
        source: 'react_query',
        operation: 'mutation',
        mutationKey: mutation.options.mutationKey
          ? stringifyQueryKey(mutation.options.mutationKey)
          : undefined,
      });
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 60000,
      retry: 1,
    },
  },
});

function stringifyQueryKey(queryKey: readonly unknown[]): string {
  try {
    return JSON.stringify(queryKey);
  } catch {
    return String(queryKey);
  }
}

const DarkTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.accent,
    background: colors.background,
    text: colors.text,
    border: colors.borderSubtle,
    notification: colors.accent,
  },
};

function RootNavigator() {
  const isLoading = useAuthState(state => state.isLoading);
  const isAuthenticated = useAuthState(state => state.isAuthenticated);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  return isAuthenticated ? <MainNavigator /> : <AuthNavigator />;
}

const AppRoot =
  Platform?.OS === 'windows'
    ? View
    : require('react-native-gesture-handler').GestureHandlerRootView;

function AppTree() {
  startupLog('AppTree render');
  const tree = (
    <AppRoot style={styles.root}>
      <AppErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <ErrorProvider>
            <AuthProvider>
              <CulledAlbumProvider>
                <NavigationContainer theme={DarkTheme}>
                  <RootNavigator />
                </NavigationContainer>
                <ErrorToast />
              </CulledAlbumProvider>
            </AuthProvider>
          </ErrorProvider>
        </QueryClientProvider>
      </AppErrorBoundary>
    </AppRoot>
  );

  // PostHogProvider has hung first paint on Windows Release before; mount
  // the rest of the tree without it, then wrap only when explicitly enabled
  // on non-Windows (Windows skips the provider shell for now).
  if (Platform.OS === 'windows' || !isPostHogEnabled || !posthog) {
    return tree;
  }

  return (
    <PostHogProvider client={posthog} autocapture={false}>
      {tree}
    </PostHogProvider>
  );
}

export default function App() {
  // On Windows Release, paint a trivial root once before mounting providers.
  // Sync native calls / heavy provider init during the first Fabric commit
  // have left the window permanently white after AppRegistry factory.
  const [bootstrapped, setBootstrapped] = useState(Platform.OS !== 'windows');

  useEffect(() => {
    startupLog('App mounted (effect)');
    if (Platform.OS !== 'windows') {
      return;
    }
    const timer = setTimeout(() => {
      startupLog('App windows bootstrap → full tree');
      setBootstrapped(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  if (!bootstrapped) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Starting…</Text>
      </View>
    );
  }

  return <AppTree />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    gap: 12,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 14,
  },
});
