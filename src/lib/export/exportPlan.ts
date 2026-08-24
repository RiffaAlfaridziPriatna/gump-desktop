import {mapUserPlan} from '@application/plan/mapUserPlan';
import type {APIResponse} from '@services/api';

/**
 * Resolves whether the user has a paid plan for export quality.
 * Uses the same mapper as the Your Plan modal.
 */
export function isPaidPlan(
  user: APIResponse.User | APIResponse.Guest | null,
): boolean {
  return mapUserPlan(user)?.plan.isPaid ?? false;
}

/**
 * @deprecated Prefer isPaidPlan(user). Kept for temporary preview flips.
 * Flip to `true` to force paid-plan export UI regardless of subscription.
 */
export const IS_PAID_PLAN: boolean | null = null;
