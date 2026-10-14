import type {APIResponse} from '@services/api';

/**
 * Resolves whether the user has a paid plan for export quality.
 *
 * Plan gating is disabled for now — treat all users as paid so original
 * quality stays available without upgrade UI.
 */
export function isPaidPlan(
  _user: APIResponse.User | APIResponse.Guest | null,
): boolean {
  return true;
}

/**
 * @deprecated Prefer isPaidPlan(user). Kept for temporary preview flips.
 * Flip to `false` to force free-plan export UI regardless of subscription.
 */
export const IS_PAID_PLAN: boolean | null = true;
