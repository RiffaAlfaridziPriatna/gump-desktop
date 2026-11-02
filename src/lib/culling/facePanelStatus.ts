import type {EyeStatus, FocusLevel} from '@domain/valueObjects/Face';

import {getEyeStatusMeta, type FaceStatusMeta} from './faceStatus';

const EYE_STATUSES: readonly EyeStatus[] = ['open', 'closed', 'partial'];
const FOCUS_LEVELS: readonly FocusLevel[] = ['good', 'soft', 'blurred'];

export type FacePanelLabel = {
  text: string;
  warning: boolean;
};

export type FacePanelStatus =
  | {kind: 'unknown'; labels: readonly FacePanelLabel[]}
  | {
      kind: 'assessed';
      labels: readonly FacePanelLabel[];
      /** Set when the eyes need a check; its icon sits in the badge. */
      eyeMeta: FaceStatusMeta | null;
      focusWarning: boolean;
    };

export function isValidFaceAssessment(face: {
  eyeStatus: string;
  focusLevel: string;
}): boolean {
  return (
    (EYE_STATUSES as readonly string[]).includes(face.eyeStatus) &&
    (FOCUS_LEVELS as readonly string[]).includes(face.focusLevel)
  );
}

/** Wording for the Faces in This Photo panel; the tooltip keeps faceStatus.ts labels. */
export function getFacePanelStatus(face: {
  eyeStatus: EyeStatus;
  focusLevel: FocusLevel;
}): FacePanelStatus {
  if (!isValidFaceAssessment(face)) {
    return {
      kind: 'unknown',
      labels: [{text: 'Unable to assess', warning: false}],
    };
  }
  const eyesWarn = face.eyeStatus !== 'open';
  const focusWarning = face.focusLevel !== 'good';
  const labels: FacePanelLabel[] = [
    eyesWarn
      ? {text: 'Check eyes', warning: true}
      : {text: 'Eyes open', warning: false},
  ];
  if (focusWarning) {
    labels.push({text: 'Possible soft focus', warning: true});
  }
  return {
    kind: 'assessed',
    labels,
    eyeMeta: eyesWarn ? getEyeStatusMeta(face.eyeStatus) : null,
    focusWarning,
  };
}
