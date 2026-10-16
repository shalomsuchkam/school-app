import { Linking, Platform } from 'react-native';
import Purchases, { INTRO_ELIGIBILITY_STATUS, LOG_LEVEL, type PurchasesPackage } from 'react-native-purchases';

// In-app subscription through App Store / Google Play, managed by RevenueCat.
// The server is the only judge of access: after any purchase the app asks the server to re-check (api.billingRefresh).
// Public SDK keys come from the build environment; without them (test builds) purchases are simply unavailable.
const KEY = Platform.select({ ios: process.env.EXPO_PUBLIC_RC_IOS_KEY, android: process.env.EXPO_PUBLIC_RC_ANDROID_KEY }) ?? '';
export const ENTITLEMENT = 'pro';

let configuredFor: string | null = null;

export const billingAvailable = () => !!KEY && Platform.OS !== 'web';

// The RevenueCat customer is the FAMILY: whoever pays (any parent phone), the whole family is unlocked.
async function ensure(familyId: string) {
  if (!billingAvailable()) throw new Error('unavailable');
  if (configuredFor === familyId) return;
  if (!configuredFor) {
    if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.WARN);
    Purchases.configure({ apiKey: KEY, appUserID: familyId });
  } else {
    // another family on this phone: the purchase must not land on the previous customer
    await Purchases.logIn(familyId);
  }
  configuredFor = familyId;
}

export type Plan = { pkg: PurchasesPackage; price: string; trialDays: number | null; period: string };

// The monthly plan of the current offering, with the store-localized price ("2 990 ₸", "$4.99", …).
export async function loadPlan(familyId: string): Promise<Plan | null> {
  await ensure(familyId);
  const offerings = await Purchases.getOfferings();
  const pkg = offerings.current?.monthly ?? offerings.current?.availablePackages[0];
  if (!pkg) return null;
  const intro = pkg.product.introPrice;
  const unitDays: Record<string, number> = { DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 };
  let trialDays = intro && intro.price === 0 ? intro.periodNumberOfUnits * (unitDays[intro.periodUnit] ?? 1) : null;
  // The App Store lists the trial even for an Apple ID that already used it: promise it only when eligible
  // (unknown counts as not eligible). Google Play only returns offers the account can still take.
  if (trialDays && Platform.OS === 'ios') {
    const id = pkg.product.identifier;
    const status = await Purchases.checkTrialOrIntroductoryPriceEligibility([id])
      .then((r) => r[id]?.status)
      .catch(() => undefined);
    if (status !== INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE) trialDays = null;
  }
  return { pkg, price: pkg.product.priceString, trialDays, period: pkg.product.subscriptionPeriod ?? 'P1M' };
}

// Returns false when the parent closed the store sheet.
export async function buy(familyId: string, plan: Plan): Promise<boolean> {
  await ensure(familyId);
  try {
    await Purchases.purchasePackage(plan.pkg);
    return true;
  } catch (e) {
    if ((e as { userCancelled?: boolean }).userCancelled) return false;
    throw e;
  }
}

export async function restore(familyId: string) {
  await ensure(familyId);
  await Purchases.restorePurchases();
}

// Cancelling or changing the plan is done in the store's own subscription settings.
export function openManage() {
  return Linking.openURL(
    Platform.OS === 'ios' ? 'https://apps.apple.com/account/subscriptions' : 'https://play.google.com/store/account/subscriptions?package=kz.uroki.app',
  );
}
