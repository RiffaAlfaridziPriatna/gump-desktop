import type {AiSelectionLevel} from '@domain/valueObjects/AiSelection';
import {cullingEngine} from '@lib/culling/cullingEngine';
import {reportError} from '@lib/observability/reportError';
import {useCallback, useEffect, useRef, useState} from 'react';

export type AiSelectionStatus = 'idle' | 'updating' | 'updated' | 'failed';

/**
 * Draft level + background re-mark of AI recommendations. Logic only: the
 * applied level is owned by the album record and passed in; the draft is
 * derived from it until the user picks another level.
 */
export function useAiSelectionFlow(
  albumId: string,
  appliedLevel: AiSelectionLevel,
) {
  const [pickedLevel, setPickedLevel] = useState<AiSelectionLevel | null>(null);
  const [status, setStatus] = useState<AiSelectionStatus>('idle');
  const [recommendedCount, setRecommendedCount] = useState<number | null>(null);
  const [lastAppliedLevel, setLastAppliedLevel] =
    useState<AiSelectionLevel | null>(null);
  const mountedRef = useRef(true);
  const runIdRef = useRef(0);
  const updatingRef = useRef(false);
  const draftLevel = pickedLevel ?? appliedLevel;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      runIdRef.current += 1;
      updatingRef.current = false;
      setPickedLevel(null);
      setStatus('idle');
      setRecommendedCount(null);
      setLastAppliedLevel(null);
    };
  }, [albumId]);

  const update = useCallback(() => {
    if (updatingRef.current) {
      return;
    }
    updatingRef.current = true;
    const runId = ++runIdRef.current;
    const level = draftLevel;
    setStatus('updating');
    cullingEngine
      .applyAiSelectionLevel(albumId, level)
      .then(count => {
        if (!mountedRef.current || runId !== runIdRef.current) {
          return;
        }
        updatingRef.current = false;
        setRecommendedCount(count);
        setLastAppliedLevel(level);
        setPickedLevel(null);
        setStatus('updated');
      })
      .catch(error => {
        if (!mountedRef.current || runId !== runIdRef.current) {
          return;
        }
        updatingRef.current = false;
        reportError(error, {step: 'applyAiSelectionLevel'});
        setStatus('failed');
      });
  }, [albumId, draftLevel]);

  const dismiss = useCallback(() => {
    setStatus('idle');
    setRecommendedCount(null);
  }, []);

  return {
    draftLevel,
    appliedLevel,
    status,
    recommendedCount,
    lastAppliedLevel,
    setDraftLevel: setPickedLevel,
    update,
    retry: update,
    dismiss,
  };
}
