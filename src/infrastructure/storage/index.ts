import {Platform} from 'react-native';
import {SQLiteAdapter} from './SQLiteAdapter';
import {OpSQLiteAdapter} from './OpSQLiteAdapter';
import {TurboSQLiteAdapter} from './TurboSQLiteAdapter';

let adapter: SQLiteAdapter | null = null;

export function getSQLiteAdapter(): SQLiteAdapter {
  if (adapter) return adapter;

  if (Platform.OS === 'macos') {
    adapter = new OpSQLiteAdapter();
  } else if (Platform.OS === 'windows') {
    adapter = new TurboSQLiteAdapter();
  } else {
    throw new Error(`Unsupported platform: ${Platform.OS}`);
  }

  adapter.initialize();
  return adapter;
}

export function resetSQLiteAdapter(): void {
  adapter = null;
}
