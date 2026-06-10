import {useContext, Context} from 'react';

export function useContextOrThrow<T>(context: Context<T | null>): T {
  const value = useContext(context);
  if (value === null) {
    throw new Error(
      `useContextOrThrow: ${context.displayName ?? 'Context'} not found`,
    );
  }
  return value;
}
