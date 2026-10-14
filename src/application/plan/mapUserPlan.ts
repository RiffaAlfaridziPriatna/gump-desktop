import {
  LOCAL_PHOTO_TOP_UP_PACKAGES,
  resolvePlanFromApiName,
  resolvePhotoUsageState,
  type PlanApiName,
  type UserPlanSnapshot,
} from '@domain/plan';
import {APIResponse} from '@services/api';

function isPlanApiName(value: string): value is PlanApiName {
  return (
    value === 'basic' ||
    value === 'lite' ||
    value === 'pro' ||
    value === 'super' ||
    value === 'corp_free' ||
    value === 'corp_basic' ||
    value === 'corp_premium' ||
    value === 'corp_enterprise'
  );
}

/**
 * Maps authenticated user profile into the Your Plan UI snapshot.
 *
 * Backend gaps (remove fallbacks when APIs ship — see docs/photo-processing-backend.md):
 * - TODO(backend): read user.details.photoProcessing.count
 * - TODO(backend): read photoProcessing.limit + extra
 * - TODO(backend): GET /photo-processing-plans for top-up packages
 */
export function mapUserPlan(
  user: APIResponse.User | APIResponse.Guest | null,
): UserPlanSnapshot | null {
  if (!user || user.role === 'guest' || !('details' in user) || !user.details) {
    return null;
  }

  const subscription = user.details.subscription;
  const apiNameRaw = subscription?.plan.name ?? null;
  const apiName =
    apiNameRaw && isPlanApiName(apiNameRaw) ? apiNameRaw : null;
  const plan = resolvePlanFromApiName(apiName);

  // TODO(backend): read user.details.photoProcessing.count
  const photosUsed = 0;
  // TODO(backend): read photoProcessing.limit + extra (effective cap)
  const photosLimit = plan.photoLimit;

  const storage = user.details.storage;
  const storageLimit =
    storage.gbLimit == null ? null : storage.gbLimit + storage.gbExtra;

  // TODO(backend): GET /photo-processing-plans
  const topUpPackages = plan.isPaid ? LOCAL_PHOTO_TOP_UP_PACKAGES : [];

  return {
    plan,
    usage: {
      photos: {used: photosUsed, limit: photosLimit},
      photoState: resolvePhotoUsageState(photosUsed, photosLimit),
      storageGb: {used: storage.gbUsed, limit: storageLimit},
    },
    topUpPackages,
    showTopUp: plan.isPaid,
  };
}
