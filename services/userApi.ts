import { apiRequest, unwrapApiPayload } from './api/client';
import type { ContentLanguageCode } from '../context/AppFlowContext';

export type UserAndPayment = {
  user: {
    _id: string;
    name: string;
    phone: string;
    hasAttemptedTrial?: boolean;
    trialAttempts?: number;
    language?: string;
    /** Privileged roles (admin / tester) always get full access. */
    role?: string;
    /** Some backends set this directly on the user object. */
    isSubscribed?: boolean;
    subscriptionStatus?: string;
    subscriptionActive?: boolean;
    hasActiveSubscription?: boolean;
    /** Plan object or plan name stored on the user. */
    plan?: unknown;
    planName?: string;
    /** Expiry date stored as ISO string or timestamp. */
    subscriptionExpiry?: string | number | null;
    subscriptionExpiresAt?: string | number | null;
    expiresAt?: string | number | null;
  };
  payment: unknown[];
};

export type SubscriptionSummary = {
  active: boolean;
  planName: string | null;
  expiresAt: string | number | null;
  language: ContentLanguageCode | null;
  source: 'role' | 'user' | 'payment' | 'none';
};

export const PRIVILEGED_ROLES = new Set([
  'admin',
  'administrator',
  'superadmin',
  'super_admin',
  'tester',
  'test',
  'staff',
  'moderator',
]);

export function profileHasPrivilegedAccess(profile: UserAndPayment): boolean {
  return Boolean(profile.user.role && PRIVILEGED_ROLES.has(String(profile.user.role).toLowerCase().trim()));
}

function normalizeLanguageCode(raw: unknown): ContentLanguageCode | null {
  const value = String(raw ?? '').toLowerCase().trim();
  if (!value) return null;
  if (value === 'en' || value.includes('english')) return 'en';
  if (value === 'rw' || value.includes('kinyarwanda') || value.includes('rwanda')) return 'rw';
  if (value === 'fr' || value.includes('french') || value.includes('français') || value.includes('francais')) return 'fr';
  return null;
}

function toTimestamp(raw: unknown): number {
  if (raw == null) return 0;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const parsed = Date.parse(String(raw));
  return Number.isFinite(parsed) ? parsed : 0;
}

function paymentSortKey(payment: unknown): number {
  if (!payment || typeof payment !== 'object') return 0;
  const o = payment as Record<string, unknown>;
  return Math.max(
    toTimestamp(o.createdAt),
    toTimestamp(o.created_at),
    toTimestamp(o.updatedAt),
    toTimestamp(o.updated_at),
    toTimestamp(o.paymentDate),
    toTimestamp(o.payment_date),
    toTimestamp(o.subscriptionEnd),
    toTimestamp(o.subscriptionExpiry),
    toTimestamp(o.subscriptionExpiresAt),
    toTimestamp(o.expiresAt),
  );
}

function paymentLanguage(payment: unknown): ContentLanguageCode | null {
  if (!payment || typeof payment !== 'object') return null;
  const o = payment as Record<string, unknown>;
  return normalizeLanguageCode(
    o.language ??
      o.lang ??
      o.locale ??
      o.subscriptionLanguage ??
      o.subscription_language ??
      o.contentLanguage ??
      o.content_language,
  );
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function planNameFromRaw(raw: unknown): string | null {
  if (raw == null || raw === false) return null;
  if (typeof raw === 'string' || typeof raw === 'number') {
    const value = String(raw).trim();
    return value && value.toLowerCase() !== 'none' ? value : null;
  }
  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    return firstNonEmptyString(o.name, o.title, o.label, o.planName, o.subscription_type, o.subscriptionType, o.type);
  }
  return null;
}

function paymentExpiry(payment: Record<string, unknown>): string | number | null {
  return (
    (payment.subscriptionEnd as string | number | null | undefined) ??
    (payment.subscriptionExpiry as string | number | null | undefined) ??
    (payment.subscriptionExpiresAt as string | number | null | undefined) ??
    (payment.expiresAt as string | number | null | undefined) ??
    (payment.expiry as string | number | null | undefined) ??
    (payment.validUntil as string | number | null | undefined) ??
    (payment.endDate as string | number | null | undefined) ??
    (payment.end_date as string | number | null | undefined) ??
    null
  );
}

const ACTIVE_SUBSCRIPTION_STATUSES = new Set([
  'approved',
  'active',
  'completed',
  'success',
  'paid',
  'successful',
  'confirmed',
  'valid',
  'activated',
  'subscribed',
  'enabled',
]);

export async function getUserAndPayment(userId: string, accessToken: string): Promise<UserAndPayment> {
  const json = await apiRequest<unknown>(`/api/user/get-user-and-payment/${userId}`, {
    method: 'GET',
    accessToken,
  });
  const data = unwrapApiPayload<UserAndPayment>(json);
  if (!data || typeof data !== 'object' || !('user' in data)) {
    throw new Error('Profile response missing data');
  }
  return data;
}

export async function updateUserProfile(
  userId: string,
  accessToken: string,
  body: { name?: string; phone?: string; lang?: ContentLanguageCode },
): Promise<unknown> {
  const json = await apiRequest<unknown>(`/api/user/update-user/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    accessToken,
    headers: { token: `Bearer ${accessToken}` },
    body,
  });
  try {
    return unwrapApiPayload(json);
  } catch {
    return json;
  }
}

export async function deleteAccountProfile(userId: string, accessToken: string): Promise<unknown> {
  const json = await apiRequest<unknown>(`/api/user/delete-user/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    accessToken,
    headers: { token: `Bearer ${accessToken}` },
  });
  try {
    return unwrapApiPayload(json);
  } catch {
    return json;
  }
}

/**
 * Checks whether an expiry date string/timestamp is in the future.
 * Returns true (still valid) for any value we can't parse — fail open.
 */
function expiryIsValid(raw: string | number | null | undefined): boolean {
  if (raw == null) return false;
  const ts = typeof raw === 'number' ? raw : Date.parse(String(raw));
  if (!Number.isFinite(ts)) return true; // unparseable — assume valid
  return ts > Date.now();
}

/**
 * Returns true if the payment record's subscription has not yet expired.
 * Falls back to true when no expiry field is present (treat as unlimited).
 *
 * Known backend expiry field names:
 *   subscriptionEnd  ← confirmed from live API response
 */
function paymentNotExpired(o: Record<string, unknown>): boolean {
  const exp =
    o.subscriptionEnd ??       // ← live backend field
    o.subscriptionExpiry ??
    o.subscriptionExpiresAt ??
    o.expiresAt ??
    o.expiry ??
    o.validUntil ??
    o.endDate ??
    o.end_date;
  if (exp == null) return true; // no expiry field → treat as active
  return expiryIsValid(exp as string | number);
}

/**
 * Detects an active subscription from the raw payment array returned by the
 * backend.
 *
 * Live API shape (confirmed from logs):
 *   { paymentStatus: true, subscriptionEnd: "2026-05-13T…", subscription_type: "monthly", … }
 */
export function paymentsIndicateActiveSubscription(payments: unknown): boolean {
  if (!Array.isArray(payments) || payments.length === 0) return false;

  const activeStatuses = ACTIVE_SUBSCRIPTION_STATUSES;

  return payments.some((p) => {
    if (!p || typeof p !== 'object') return false;
    const o = p as Record<string, unknown>;

    // ── Boolean flags ────────────────────────────────────────────────────────
    // Live backend: `paymentStatus: true` (boolean, not a string)
    if (o.paymentStatus === true) return paymentNotExpired(o);
    if (o.isActive === true) return paymentNotExpired(o);
    if (o.subscriptionActive === true) return paymentNotExpired(o);
    if (o.hasActiveSubscription === true) return paymentNotExpired(o);
    if (o.isSubscribed === true) return paymentNotExpired(o);
    if (o.active === true) return paymentNotExpired(o);

    // ── Status-string checks ─────────────────────────────────────────────────
    const rawStatus = o.status ?? o.state ?? o.subscriptionStatus;
    // Only cast paymentStatus to string if it's actually a string
    const statusStr =
      typeof o.paymentStatus === 'string' ? o.paymentStatus : '';
    const status = String(rawStatus ?? statusStr ?? '').toLowerCase().trim();
    if (status && activeStatuses.has(status)) return paymentNotExpired(o);

    // ── Expiry-only records ──────────────────────────────────────────────────
    const hasExpiry =
      o.subscriptionEnd != null ||      // ← confirmed backend field
      o.subscriptionExpiry != null ||
      o.subscriptionExpiresAt != null ||
      o.expiresAt != null ||
      o.expiry != null ||
      o.validUntil != null ||
      o.endDate != null ||
      o.end_date != null;
    if (hasExpiry) return false;

    return false;
  });
}

/**
 * Master subscription check: inspects BOTH the user object and the payment
 * array.  Web-based subscriptions often leave a flag directly on the user
 * record rather than (or in addition to) creating a payment entry that the
 * mobile flow would recognise.
 *
 * Precedence:
 *   1. Privileged role → always granted.
 *   2. User-level subscription fields → checked next.
 *   3. Payment array → final fallback.
 */
export function profileIndicatesActiveSubscription(profile: UserAndPayment): boolean {
  const u = profile.user;

  // 1. Privileged roles always get full access
  if (profileHasPrivilegedAccess(profile)) {
    return true;
  }

  const userExpiry = u.subscriptionExpiry ?? u.subscriptionExpiresAt ?? u.expiresAt;
  const userNotExpired = userExpiry == null || expiryIsValid(userExpiry);

  // 2. Direct boolean flags on the user object
  if ((u.isSubscribed === true || u.subscriptionActive === true || u.hasActiveSubscription === true) && userNotExpired) {
    return true;
  }

  // 3. Subscription status string on the user object
  const uStatus = String(u.subscriptionStatus ?? '').toLowerCase().trim();
  if (uStatus && ACTIVE_SUBSCRIPTION_STATUSES.has(uStatus) && userNotExpired) {
    return true;
  }

  // 4. Non-null plan stored on user + valid expiry
  if (u.plan != null && u.plan !== '' && u.plan !== false) {
    if (userExpiry != null && userNotExpired) return true;
  }

  // 5. Plan name stored on user (non-empty, non-"none")
  if (u.planName && u.planName.trim() !== '' && u.planName.toLowerCase() !== 'none') {
    if (userExpiry != null && userNotExpired) return true;
  }

  // 6. Expiry date on user object is in the future
  if (userExpiry != null && userNotExpired) return false;

  // 7. Fall back to scanning the payment array
  return paymentsIndicateActiveSubscription(profile.payment);
}

/**
 * Highest-tier rule for language switching:
 * only "monthly" (or equivalent plan naming) is allowed.
 */
export function profileHasHighestSubscription(profile: UserAndPayment): boolean {
  if (profileHasPrivilegedAccess(profile)) {
    return true;
  }

  if (!profileIndicatesActiveSubscription(profile)) {
    return false;
  }

  const userPlanRaw = String(profile.user.planName ?? profile.user.plan ?? '').toLowerCase();
  const userLooksMonthly =
    userPlanRaw.includes('monthly') ||
    userPlanRaw.includes('one month') ||
    userPlanRaw.includes('month');
  if (userLooksMonthly) return true;

  if (!Array.isArray(profile.payment)) return false;
  return profile.payment.some((p) => {
    if (!p || typeof p !== 'object') return false;
    const o = p as Record<string, unknown>;
    if (!paymentsIndicateActiveSubscription([o])) return false;
    const subType = String(o.subscription_type ?? o.subscriptionType ?? o.planType ?? '').toLowerCase().trim();
    if (subType === 'monthly') return true;
    const planName = String(o.planName ?? o.plan ?? '').toLowerCase();
    return planName.includes('monthly') || planName.includes('one month') || planName.includes('month');
  });
}

export function profileSubscriptionSummary(profile: UserAndPayment): SubscriptionSummary {
  if (profileHasPrivilegedAccess(profile)) {
    return {
      active: true,
      planName: profile.user.planName ?? planNameFromRaw(profile.user.plan) ?? 'Full access',
      expiresAt: profile.user.subscriptionExpiry ?? profile.user.subscriptionExpiresAt ?? profile.user.expiresAt ?? null,
      language: normalizeLanguageCode(profile.user.language),
      source: 'role',
    };
  }

  const userExpiry = profile.user.subscriptionExpiry ?? profile.user.subscriptionExpiresAt ?? profile.user.expiresAt ?? null;
  const userPlan = profile.user.planName ?? planNameFromRaw(profile.user.plan);
  const userActive = profileIndicatesActiveSubscription({ ...profile, payment: [] });
  if (userActive || userPlan || userExpiry != null) {
    return {
      active: userActive,
      planName: userPlan,
      expiresAt: userExpiry,
      language: normalizeLanguageCode(profile.user.language),
      source: 'user',
    };
  }

  if (Array.isArray(profile.payment)) {
    const activePayments = profile.payment
      .filter((payment) => payment && typeof payment === 'object' && paymentsIndicateActiveSubscription([payment]))
      .sort((a, b) => paymentSortKey(b) - paymentSortKey(a));
    const selected = activePayments[0] ?? [...profile.payment].filter((payment) => payment && typeof payment === 'object').sort((a, b) => paymentSortKey(b) - paymentSortKey(a))[0];
    if (selected && typeof selected === 'object') {
      const o = selected as Record<string, unknown>;
      return {
        active: paymentsIndicateActiveSubscription([o]),
        planName: firstNonEmptyString(o.planName, o.plan, o.subscription_type, o.subscriptionType, o.planType, o.type),
        expiresAt: paymentExpiry(o),
        language: paymentLanguage(o) ?? normalizeLanguageCode(profile.user.language),
        source: 'payment',
      };
    }
  }

  return {
    active: false,
    planName: null,
    expiresAt: null,
    language: normalizeLanguageCode(profile.user.language),
    source: 'none',
  };
}

/**
 * Determines whether the active subscription is time-based rather than a
 * permanently privileged account.
 */
export function profileHasTimeBasedSubscription(profile: UserAndPayment): boolean {
  if (profileHasPrivilegedAccess(profile)) {
    return true;
  }

  if (!profileIndicatesActiveSubscription(profile)) {
    return false;
  }

  const userExpiry = profile.user.subscriptionExpiry ?? profile.user.subscriptionExpiresAt ?? profile.user.expiresAt;
  if (userExpiry != null) {
    return expiryIsValid(userExpiry);
  }

  if (!Array.isArray(profile.payment)) return false;
  return profile.payment.some((p) => {
    if (!p || typeof p !== 'object') return false;
    const o = p as Record<string, unknown>;
    const hasExpiry =
      o.subscriptionEnd != null ||
      o.subscriptionExpiry != null ||
      o.subscriptionExpiresAt != null ||
      o.expiresAt != null ||
      o.expiry != null ||
      o.validUntil != null ||
      o.endDate != null ||
      o.end_date != null;
    return hasExpiry && paymentNotExpired(o) && paymentsIndicateActiveSubscription([o]);
  });
}

/**
 * Extracts the language tied to the latest active subscription/payment.
 * Returns null when the backend profile does not expose a usable active language.
 */
export function latestActiveSubscriptionLanguage(profile: UserAndPayment): ContentLanguageCode | null {
  const userLanguage = normalizeLanguageCode(profile.user.language);

  if (!Array.isArray(profile.payment) || profile.payment.length === 0) {
    return userLanguage;
  }

  const activePayments = profile.payment
    .filter((payment) => {
      if (!payment || typeof payment !== 'object') return false;
      const o = payment as Record<string, unknown>;
      return paymentNotExpired(o) && (
        o.paymentStatus === true ||
        o.isActive === true ||
        o.subscriptionActive === true ||
        o.hasActiveSubscription === true ||
        o.isSubscribed === true ||
        o.active === true ||
        Array.from(ACTIVE_SUBSCRIPTION_STATUSES).includes(
          String(o.status ?? o.state ?? o.paymentStatus ?? '').toLowerCase().trim(),
        )
      );
    })
    .sort((a, b) => paymentSortKey(b) - paymentSortKey(a));

  for (const payment of activePayments) {
    const lang = paymentLanguage(payment);
    if (lang) return lang;
  }

  return userLanguage;
}
