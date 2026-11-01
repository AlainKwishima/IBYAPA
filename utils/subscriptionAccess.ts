import type { ContentLanguageCode } from '../context/AppFlowContext';
import type { SubscriptionType } from '../services/api/subscriptionTypes';

export type SubscriptionAccessState = {
  hasSubscription: boolean;
  canTakeExams?: boolean;
  hasReadingAccess?: boolean;
  hasVideoAccess?: boolean;
  canChangeLanguage?: boolean;
  subscriptionLanguage: ContentLanguageCode | null;
  subscriptionPlan?: SubscriptionType | null;
  contentLanguage: ContentLanguageCode;
};

export function hasLanguageAccess(state: SubscriptionAccessState): boolean {
  return state.hasSubscription && resolvePaidContentLanguage(state) != null;
}

export function hasExamAccess(state: SubscriptionAccessState): boolean {
  return hasLanguageAccess(state) && state.canTakeExams === true;
}

export function hasReadingAccess(state: SubscriptionAccessState): boolean {
  return hasLanguageAccess(state) && state.hasReadingAccess === true;
}

export function hasVideoAccess(state: SubscriptionAccessState): boolean {
  return hasLanguageAccess(state) && state.hasVideoAccess === true;
}

/**
 * Premium learning resources are licensed by the subscription language, not by
 * the currently selected interface language.
 */
export function resolvePaidContentLanguage(state: SubscriptionAccessState): ContentLanguageCode | null {
  if (!state.hasSubscription) return null;
  return state.subscriptionLanguage;
}

/**
 * Exams should always follow the language attached to the active subscription.
 * When we cannot resolve a subscription language, fall back to the app language
 * rather than defaulting to Kinyarwanda.
 */
export function resolveExamLanguage(state: SubscriptionAccessState): ContentLanguageCode {
  if (state.hasSubscription && state.subscriptionLanguage) {
    return state.subscriptionLanguage;
  }
  return state.contentLanguage;
}
