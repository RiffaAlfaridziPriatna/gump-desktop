import {cullingEngine} from '@lib/culling/cullingEngine';
import type {ApplyAlbumLookScope} from '@lib/culling/applyAlbumLook';
import {getLookLabel} from '@lib/look/lookCatalog';
import type {LookId} from '@lib/look/types';
import {captureAppEvent} from '@lib/observability/posthogClient';
import {reportError} from '@lib/observability/reportError';
import {focusDesktopNode} from '@components/modals/focusDesktopNode';
import {useCallback, useEffect, useRef, useState} from 'react';
import {AccessibilityInfo, type View} from 'react-native';

type Step = 'idle' | 'picker' | 'scope';
type Trigger = 'edit' | 'change';

/**
 * Picker -> scope popup -> background apply. Logic only: the screen renders
 * the modals from the returned flags. The chosen look is transient UI state.
 */
export function useAlbumLookFlow(albumId: string, hasPhotos: boolean) {
  const [step, setStep] = useState<Step>('idle');
  const [chosenLook, setChosenLook] = useState<LookId>('original');
  const triggerRef = useRef<Trigger>('edit');
  const editPhotosRef = useRef<View | null>(null);
  const changeLookRef = useRef<View | null>(null);
  const wasOpenRef = useRef(false);
  const stepRef = useRef<Step>('idle');
  const runIdRef = useRef(0);
  const toEditRef = useRef(false);

  useEffect(() => {
    if (step !== 'idle') {
      wasOpenRef.current = true;
      return;
    }
    if (!wasOpenRef.current) {
      return;
    }
    wasOpenRef.current = false;
    // The status line unmounts when the new default is Original.
    const preferred =
      triggerRef.current === 'change' && !toEditRef.current
        ? changeLookRef.current
        : null;
    focusDesktopNode(preferred ?? editPhotosRef.current);
  }, [step]);

  const open = useCallback(
    (trigger: Trigger) => {
      if (!hasPhotos) {
        return;
      }
      triggerRef.current = trigger;
      toEditRef.current = false;
      stepRef.current = 'picker';
      setStep('picker');
    },
    [hasPhotos],
  );
  const openFromEdit = useCallback(() => open('edit'), [open]);
  const openFromChange = useCallback(() => open('change'), [open]);

  const close = useCallback(() => {
    stepRef.current = 'idle';
    setStep('idle');
  }, []);
  const chooseLook = useCallback((lookId: LookId) => {
    setChosenLook(lookId);
    stepRef.current = 'scope';
    setStep('scope');
  }, []);

  const apply = useCallback(
    (scope: ApplyAlbumLookScope) => {
      if (stepRef.current !== 'scope') {
        return;
      }
      const lookId = chosenLook;
      const runId = ++runIdRef.current;
      toEditRef.current = lookId === 'original';
      stepRef.current = 'idle';
      setStep('idle');
      captureAppEvent('apply_look_started', {
        albumId,
        lookId,
        scope,
      });
      cullingEngine
        .applyAlbumLook(albumId, lookId, scope)
        .then(photoCount => {
          const superseded = runId !== runIdRef.current;
          captureAppEvent('apply_look_completed', {
            albumId,
            lookId,
            scope,
            photoCount,
            ...(superseded ? {superseded: true} : {}),
          });
          if (superseded) {
            return;
          }
          AccessibilityInfo.announceForAccessibility(
            `Look: ${getLookLabel(lookId)} applied`,
          );
        })
        .catch(error => {
          reportError(error, {step: 'applyAlbumLook'});
          captureAppEvent('apply_look_failed', {
            albumId,
            lookId,
            scope,
          });
        });
    },
    [albumId, chosenLook],
  );
  const applyAll = useCallback(() => apply('allPhotos'), [apply]);
  const applyNewOnly = useCallback(() => apply('newPhotosOnly'), [apply]);

  return {
    pickerVisible: step === 'picker',
    scopeVisible: step === 'scope',
    chosenLookLabel: getLookLabel(chosenLook),
    openFromEdit,
    openFromChange,
    chooseLook,
    close,
    applyAll,
    applyNewOnly,
    editPhotosRef,
    changeLookRef,
  };
}
