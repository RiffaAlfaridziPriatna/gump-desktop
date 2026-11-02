import {LOOK_IDS, isLookId, type LookId} from '@domain/valueObjects/Look';

export {LOOK_IDS, isLookId, type LookId};

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

export function hasAppliedLook(
  lookId: LookId | null | undefined,
): lookId is Exclude<LookId, 'original'> {
  return lookId != null && lookId !== 'original';
}
