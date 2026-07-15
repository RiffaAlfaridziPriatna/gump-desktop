/**
 * Windows uses react-native-turbo-sqlite via TurboSQLiteAdapter.
 * Keep this shim so Metro never pulls the native op-sqlite package.
 */
export type Scalar = string | number | boolean | null | ArrayBuffer | Uint8Array;

export type QueryResult = {
  rows: Array<Record<string, Scalar>>;
  rowsAffected?: number;
  insertId?: number;
};

export type DB = {
  executeSync: (query: string, params?: Scalar[]) => QueryResult;
  execute: (query: string, params?: Scalar[]) => Promise<QueryResult>;
};

export function open(_params: {name: string}): DB {
  throw new Error(
    '@op-engineering/op-sqlite is not available on Windows. Use TurboSQLiteAdapter.',
  );
}
