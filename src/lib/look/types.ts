import {LOOK_IDS, isLookId, type LookId} from '@domain/valueObjects/Look';
import type {LookFinishing} from '@domain/valueObjects/LookFinishing';

export {LOOK_IDS, isLookId, type LookId};
export type {
  CustomLook,
  LookFinishing,
  LookFinishingField,
} from '@domain/valueObjects/LookFinishing';

/**
 * Finishing sent to native applyLook: the Lightroom sliders plus GUMP-only
 * fields that have no slider. Native clamps every value to its range.
 */
export type NativeLookFinishing = LookFinishing & {
  /** 0..1 warm color-matrix nudge. */
  warmNudge: number;
  /** 0..1 shadow-settle bias. */
  settleNudge: number;
  /** Frame-ellipse vignette instead of the circular one. */
  vignetteFrameEllipse: boolean;
};

/** Only strength value ever sent to the native bake. */
export const LOOK_BAKE_INTENSITY = 100;

export type LookDefinition = {
  id: LookId;
  label: string;
  /**
   * Bundled .cube basename without extension (macOS Looks/, Windows Assets/Looks/).
   * Omitted for original.
   */
  lutName?: string;
  /** Native finishing for this built-in; omitted means none. */
  finishing?: NativeLookFinishing;
};

/** 'custom' bakes as original until the custom bake path exists (s9 bake slice). */
export function hasAppliedLook(
  lookId: LookId | null | undefined,
): lookId is Exclude<LookId, 'original' | 'custom'> {
  return lookId != null && lookId !== 'original' && lookId !== 'custom';
}
