import {SQLiteAdapter} from './SQLiteAdapter';
import {OpSQLiteAdapter} from './OpSQLiteAdapter';

let adapter: SQLiteAdapter | null = null;

export function getSQLiteAdapter(): SQLiteAdapter {
  if (adapter) return adapter;

  adapter = new OpSQLiteAdapter();
  adapter.initialize();
  return adapter;
}

export function resetSQLiteAdapter(): void {
  adapter = null;
}
