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
import {colors} from '@lib/ui/colors';
import {DefaultTheme, NavigationContainer} from '@react-navigation/native';
import {ActivityIndicator, Platform, StyleSheet, View} from 'react-native';
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import {PostHogProvider} from 'posthog-react-native';
import {AuthNavigator} from './AuthNavigator';
import {MainNavigator} from './MainNavigator';

installGlobalErrorReporting();

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
      </View>
    );
  }

  return isAuthenticated ? <MainNavigator /> : <AuthNavigator />;
}

const AppRoot =
  Platform?.OS === 'windows'
    ? View
    : require('react-native-gesture-handler').GestureHandlerRootView;

export default function App() {
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

  if (!isPostHogEnabled || !posthog) {
    return tree;
  }

  return (
    <PostHogProvider client={posthog} autocapture={false}>
      {tree}
    </PostHogProvider>
  );
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
  },
});
