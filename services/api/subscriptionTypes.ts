/**
 * Allowed `subscription_type` values for MoMo / Airtel / card payment endpoints.
 * Confirmed from live API validation (`POST /api/payment/momo-payment` with invalid type).
 *
 * @see https://www.ibyapa.com/docs/ — Payment section
 */
export const SUBSCRIPTION_TYPES = ['two-exams', 'five-exams', 'daily', 'weekly', 'two-weekly', 'monthly'] as const;

export type SubscriptionType = (typeof SUBSCRIPTION_TYPES)[number];

export type SubscriptionEntitlements = {
  canTakeExams: boolean;
  canReadDocuments: boolean;
  canWatchVideos: boolean;
  examAttemptLimit: number | null;
};

/**
 * Keep plan permissions centralized so plan cards and feature gates cannot
 * silently disagree about what a purchased plan unlocks.
 */
export const SUBSCRIPTION_ENTITLEMENTS: Record<SubscriptionType, SubscriptionEntitlements> = {
  'two-exams': {
    canTakeExams: true,
    canReadDocuments: false,
    canWatchVideos: false,
    examAttemptLimit: 2,
  },
  'five-exams': {
    canTakeExams: true,
    canReadDocuments: false,
    canWatchVideos: false,
    examAttemptLimit: 5,
  },
  daily: {
    canTakeExams: true,
    canReadDocuments: true,
    canWatchVideos: true,
    examAttemptLimit: null,
  },
  weekly: {
    canTakeExams: true,
    canReadDocuments: true,
    canWatchVideos: true,
    examAttemptLimit: null,
  },
  'two-weekly': {
    canTakeExams: true,
    canReadDocuments: true,
    canWatchVideos: true,
    examAttemptLimit: null,
  },
  monthly: {
    canTakeExams: true,
    canReadDocuments: true,
    canWatchVideos: true,
    examAttemptLimit: null,
  },
};
