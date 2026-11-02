import {useEffect, useState} from 'react';

// TODO: simulated. Nothing is pending; remove when face assessment is real.
export const FACE_ASSESSMENT_DELAY_MS = 1000;

/** True for a fixed delay after `photoId` changes; the timer is cancelled on change. */
export function useFaceAssessmentLoading(photoId: string | null): boolean {
  const [readyId, setReadyId] = useState<string | null>(null);

  useEffect(() => {
    if (photoId === null) {
      return;
    }
    const timer = setTimeout(
      () => setReadyId(photoId),
      FACE_ASSESSMENT_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [photoId]);

  return photoId !== null && readyId !== photoId;
}
