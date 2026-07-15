import {SQLiteAdapter} from './SQLiteAdapter';
import {TurboSQLiteAdapter} from './TurboSQLiteAdapter';

let adapter: SQLiteAdapter | null = null;

export function getSQLiteAdapter(): SQLiteAdapter {
  if (adapter) return adapter;

  adapter = new TurboSQLiteAdapter();
  adapter.initialize();
  return adapter;
}

export function resetSQLiteAdapter(): void {
  adapter = null;
}
