import {LOOK_IDS, isLookId, type LookId} from '@domain/valueObjects/Look';

export {LOOK_IDS, isLookId, type LookId};
export type {
  CustomLook,
  LookFinishing,
  LookFinishingField,
} from '@domain/valueObjects/LookFinishing';

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
};

/** 'custom' bakes as original until the custom bake path exists (s9 bake slice). */
export function hasAppliedLook(
  lookId: LookId | null | undefined,
): lookId is Exclude<LookId, 'original' | 'custom'> {
  return lookId != null && lookId !== 'original' && lookId !== 'custom';
}
