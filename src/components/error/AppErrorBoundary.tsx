import {Component, type ErrorInfo, type ReactNode} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {reportError} from '@lib/observability/reportError';
import {colors} from '@lib/ui/colors';
import {fonts, sansBoldStyle} from '@lib/ui/typography';

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

export class AppErrorBoundary extends Component<Props, State> {
  state: State = {error: null};

  static getDerivedStateFromError(error: Error): State {
    return {error};
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError(error, {
      source: 'react_error_boundary',
      componentStack: info.componentStack ?? undefined,
    });
  }

  render(): ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.message}>
          {this.state.error.message || 'An unexpected error occurred'}
        </Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: colors.background,
    gap: 12,
  },
  title: {
    ...sansBoldStyle,
    fontSize: 20,
    color: colors.text,
  },
  message: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
