export type PlanApiName =
  | 'basic'
  | 'lite'
  | 'pro'
  | 'super'
  | 'corp_free'
  | 'corp_basic'
  | 'corp_premium'
  | 'corp_enterprise';

export type ExportQuality = 'original' | 'compressed';

export type PhotoUsageState = 'normal' | 'warning' | 'limit';

export type Plan = {
  apiName: PlanApiName;
  displayName: string;
  isPaid: boolean;
  photoLimit: number;
  exportQuality: ExportQuality;
  description: string;
};

export type MeterUsage = {
  used: number;
  limit: number | null;
};

export type PlanUsage = {
  photos: MeterUsage;
  photoState: PhotoUsageState;
  storageGb: MeterUsage;
};

export type PhotoTopUpPackage = {
  id: string;
  photoAmount: number;
  priceUsd: number;
};

export type UserPlanSnapshot = {
  plan: Plan;
  usage: PlanUsage;
  topUpPackages: PhotoTopUpPackage[];
  showTopUp: boolean;
};
