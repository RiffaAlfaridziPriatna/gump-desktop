import {
  importAlbumPreset,
  type ImportAlbumPresetResult,
  type ImportPresetErrorReason,
} from '@lib/look/importAlbumPreset';
import {useCallback, useEffect, useRef, useState} from 'react';

export type ImportAlbumPresetStatus = 'idle' | 'importing';

/**
 * Upload preset action for one album. `error` holds the last failure until the
 * next import starts; cancel clears nothing. A second call while one runs is
 * ignored and resolves `cancelled`.
 */
export function useImportAlbumPreset(albumId: string) {
  const [status, setStatus] = useState<ImportAlbumPresetStatus>('idle');
  const [error, setError] = useState<ImportPresetErrorReason | null>(null);
  const runningRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const importPreset = useCallback(async (): Promise<ImportAlbumPresetResult> => {
    if (runningRef.current) {
      return {status: 'cancelled'};
    }
    runningRef.current = true;
    setStatus('importing');
    try {
      const result = await importAlbumPreset(albumId);
      if (mountedRef.current && result.status !== 'cancelled') {
        setError(result.status === 'failed' ? result.reason : null);
      }
      return result;
    } finally {
      runningRef.current = false;
      if (mountedRef.current) {
        setStatus('idle');
      }
    }
  }, [albumId]);

  return {importPreset, status, error};
}
