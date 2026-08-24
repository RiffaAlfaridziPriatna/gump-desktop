import {Linking} from 'react-native';
import {WEB_APP_URL} from '@lib/config/constants';

function webUrl(path: string): string {
  const base = WEB_APP_URL.replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

export function getUpgradePlanUrl(): string {
  return webUrl('/upgrade');
}

export function getTopUpFallbackUrl(): string {
  return webUrl('/settings/profile/subscription');
}

export async function openUpgradePlan(): Promise<void> {
  await Linking.openURL(getUpgradePlanUrl());
}

/**
 * Opens photo-capacity top-up.
 *
 * TODO(backend): POST /photo-processing-plans/{planId}/checkout with
 * { successUrl, cancelUrl }, then Linking.openURL(session.url)
 * (StripeHostedCheckoutDto). Until that ships, fall back to the web
 * subscription settings page.
 */
export async function openPhotoTopUp(_planId?: string): Promise<void> {
  await Linking.openURL(getTopUpFallbackUrl());
}
