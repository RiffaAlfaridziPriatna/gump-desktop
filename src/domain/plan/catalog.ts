import type {PhotoTopUpPackage, Plan, PlanApiName} from './types';

const FREE_PHOTO_LIMIT = 3000;
const PAID_PHOTO_LIMIT = 150_000;

const DISPLAY_NAMES: Record<PlanApiName, string> = {
  basic: 'Free',
  lite: 'Uprising',
  pro: 'Professional',
  super: 'Legend',
  corp_free: 'Free',
  corp_basic: 'Core',
  corp_premium: 'Premium',
  corp_enterprise: 'Enterprise',
};

function freePlan(apiName: PlanApiName): Plan {
  const displayName = DISPLAY_NAMES[apiName];
  return {
    apiName,
    displayName,
    isPaid: false,
    photoLimit: FREE_PHOTO_LIMIT,
    exportQuality: 'compressed',
    description: `On ${displayName}, Gump can process up to ${FREE_PHOTO_LIMIT.toLocaleString('en-US')} photos so you can try Gump.`,
  };
}

function paidPlan(apiName: PlanApiName): Plan {
  const displayName = DISPLAY_NAMES[apiName];
  return {
    apiName,
    displayName,
    isPaid: true,
    photoLimit: PAID_PHOTO_LIMIT,
    exportQuality: 'original',
    description: `On this plan, Gump can process up to ${PAID_PHOTO_LIMIT.toLocaleString('en-US')} photos for your account.`,
  };
}

export function resolvePlanFromApiName(apiName: PlanApiName | null): Plan {
  if (!apiName || apiName === 'basic' || apiName === 'corp_free') {
    return freePlan(apiName ?? 'basic');
  }
  return paidPlan(apiName);
}

/**
 * TODO(backend): replace with GET /photo-processing-plans
 * (amount = extra photos, prices.usd = USD).
 */
export const LOCAL_PHOTO_TOP_UP_PACKAGES: PhotoTopUpPackage[] = [
  {id: 'photo_10k', photoAmount: 10_000, priceUsd: 15},
  {id: 'photo_50k', photoAmount: 50_000, priceUsd: 60},
  {id: 'photo_100k', photoAmount: 100_000, priceUsd: 100},
];

export const PHOTO_USAGE_WARNING_RATIO = 0.9;
