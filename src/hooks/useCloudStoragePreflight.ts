import {mapUserPlan} from '@application/plan/mapUserPlan';
import {useCurrentUser} from '@context/auth';
import {useAuthState} from '@hooks/useAuth';
import {
  NEAR_LIMIT_RATIO,
  type CloudStoragePreflight,
} from '@lib/culledAlbum/uploadPreflight';
import {reportError} from '@lib/observability/reportError';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {AppState} from 'react-native';

const BYTES_PER_GB = 1024 ** 3;

type CheckPhase = 'checking' | 'failed' | 'done';

/**
 * Refetches the current user on open, on `retry()` and when the app becomes
 * active while `isOpen`; derives the preflight from the fresh storage numbers.
 */
export function useCloudStoragePreflight(
  isOpen: boolean,
  uploadBytes: number,
): {preflight: CloudStoragePreflight; retry: () => void} {
  const token = useAuthState(state => state.token);
  const {data: user, refetch} = useCurrentUser(token);
  const [phase, setPhase] = useState<CheckPhase>('checking');
  const requestId = useRef(0);

  const check = useCallback(async () => {
    const id = ++requestId.current;
    setPhase('checking');
    let next: CheckPhase = 'done';
    try {
      const result = await refetch();
      if (result.isError) {
        throw result.error;
      }
    } catch (err) {
      reportError(err, {
        source: 'cloud_storage_preflight',
        operation: 'refetch',
      });
      next = 'failed';
    }
    if (id === requestId.current) {
      setPhase(next);
    }
  }, [refetch]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    check();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        check();
      }
    });
    return () => subscription.remove();
  }, [isOpen, check]);

  const preflight = useMemo<CloudStoragePreflight>(() => {
    if (phase === 'checking') {
      return {status: 'checking'};
    }
    const storage = mapUserPlan(user ?? null)?.usage.storageGb;
    if (phase === 'failed' || !storage) {
      return {status: 'unavailable'};
    }
    const usedBytes = storage.used * BYTES_PER_GB;
    const limitBytes =
      storage.limit == null ? null : storage.limit * BYTES_PER_GB;
    const afterBytes = usedBytes + uploadBytes;
    const numbers = {uploadBytes, usedBytes, limitBytes, afterBytes};
    if (limitBytes == null) {
      return {status: 'ok', ...numbers};
    }
    if (afterBytes > limitBytes) {
      return {status: 'exceeded', ...numbers};
    }
    if (limitBytes - afterBytes < limitBytes * NEAR_LIMIT_RATIO) {
      return {status: 'nearLimit', ...numbers};
    }
    return {status: 'ok', ...numbers};
  }, [phase, user, uploadBytes]);

  return {preflight, retry: check};
}
