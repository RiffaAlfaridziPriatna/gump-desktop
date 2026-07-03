import {AuthProvider, useAuthState} from '@context/auth';
import {CulledAlbumProvider} from '@context/culledAlbum';
import {ErrorProvider} from '@context/error';
import {ErrorToast} from '@components/error';
import {colors} from '@lib/colors';
import {DefaultTheme, NavigationContainer} from '@react-navigation/native';
import {ActivityIndicator, StyleSheet, View} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import 'reflect-metadata';
import {AuthNavigator} from './AuthNavigator';
import {MainNavigator} from './MainNavigator';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60000,
      retry: 1,
    },
  },
});

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

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
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
    </GestureHandlerRootView>
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
