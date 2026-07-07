import {Text, View, StyleSheet} from 'react-native';

/**
 * Minimal Windows entry for startup diagnosis.
 * If you see this screen, JS + Metro are working — remove this file to load the full app.
 */
export default function App() {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Gump Windows OK</Text>
      <Text style={styles.subtitle}>
        JS bundle loaded. Delete src/app/App.windows.tsx to run the full app.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f0f0f',
    padding: 24,
  },
  title: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 12,
  },
  subtitle: {
    color: '#a0a0a0',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
