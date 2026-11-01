import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SubscriptionType } from '../services/api/subscriptionTypes';

export type ContentLanguageCode = 'en' | 'rw' | 'fr';

type AppFlowState = {
  hasChosenLanguage: boolean;
  isSignedIn: boolean;
  hasUsedFreeTrial: boolean;
  hasSubscription: boolean;
  canTakeExams: boolean;
  hasReadingAccess: boolean;
  hasVideoAccess: boolean;
  hasTimeBasedSubscription: boolean;
  canChangeLanguage: boolean;
  subscriptionLanguage: ContentLanguageCode | null;
  subscriptionPlan: SubscriptionType | null;
  contentLanguage: ContentLanguageCode;
};

type AppFlowContextValue = AppFlowState & {
  hydrated: boolean;
  isSigningOut: boolean;
  setLanguageChosen: (chosen: boolean) => Promise<void>;
  setSignedIn: (signedIn: boolean) => Promise<void>;
  setHasUsedFreeTrial: (used: boolean) => Promise<void>;
  setHasSubscription: (subscribed: boolean) => Promise<void>;
  setCanTakeExams: (allowed: boolean) => Promise<void>;
  setHasReadingAccess: (allowed: boolean) => Promise<void>;
  setHasVideoAccess: (allowed: boolean) => Promise<void>;
  setHasTimeBasedSubscription: (subscribed: boolean) => Promise<void>;
  setCanChangeLanguage: (allowed: boolean) => Promise<void>;
  setSubscriptionLanguage: (lang: ContentLanguageCode | null) => Promise<void>;
  setSubscriptionPlan: (plan: SubscriptionType | null) => Promise<void>;
  setContentLanguage: (lang: ContentLanguageCode) => Promise<void>;
  setSigningOut: (signingOut: boolean) => void;
  /** First-run language: one persist so sequential updates cannot clobber each other. */
  commitLanguageSelection: (lang: ContentLanguageCode) => Promise<void>;
  resetFlow: () => Promise<void>;
};

const STORAGE_KEY = 'nkotanyi.app.flow.v1';

const defaultState: AppFlowState = {
  hasChosenLanguage: false,
  isSignedIn: false,
  hasUsedFreeTrial: false,
  hasSubscription: false,
  canTakeExams: false,
  hasReadingAccess: false,
  hasVideoAccess: false,
  hasTimeBasedSubscription: false,
  canChangeLanguage: false,
  subscriptionLanguage: null,
  subscriptionPlan: null,
  contentLanguage: 'en',
};

const AppFlowContext = createContext<AppFlowContextValue | null>(null);

export function AppFlowProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppFlowState>(defaultState);
  const [hydrated, setHydrated] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  /** Latest flow state for sequential updates (setters must not read a stale `state` closure). */
  const stateRef = useRef<AppFlowState>(defaultState);

  const persistPatch = useCallback(async (patch: Partial<AppFlowState>) => {
    const next = { ...stateRef.current, ...patch };
    stateRef.current = next;
    setState(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* keep in-memory state so the app stays usable */
    }
  }, []);

  useEffect(() => {
    const hydrate = async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<AppFlowState>;
          const loaded: AppFlowState = {
            hasChosenLanguage: Boolean(parsed.hasChosenLanguage),
            isSignedIn: Boolean(parsed.isSignedIn),
            hasUsedFreeTrial: Boolean(parsed.hasUsedFreeTrial),
            hasSubscription: Boolean(parsed.hasSubscription),
            canTakeExams: Boolean(parsed.canTakeExams),
            hasReadingAccess: Boolean(parsed.hasReadingAccess),
            hasVideoAccess: Boolean(parsed.hasVideoAccess),
            hasTimeBasedSubscription: Boolean(parsed.hasTimeBasedSubscription),
            canChangeLanguage: Boolean(parsed.canChangeLanguage),
            subscriptionLanguage:
              parsed.subscriptionLanguage === 'rw' || parsed.subscriptionLanguage === 'fr' || parsed.subscriptionLanguage === 'en'
                ? parsed.subscriptionLanguage
                : null,
            subscriptionPlan:
              parsed.subscriptionPlan === 'two-exams' ||
              parsed.subscriptionPlan === 'five-exams' ||
              parsed.subscriptionPlan === 'daily' ||
              parsed.subscriptionPlan === 'weekly' ||
              parsed.subscriptionPlan === 'two-weekly' ||
              parsed.subscriptionPlan === 'monthly'
                ? parsed.subscriptionPlan
                : null,
            contentLanguage:
              parsed.contentLanguage === 'rw' || parsed.contentLanguage === 'fr' ? parsed.contentLanguage : 'en',
          };
          stateRef.current = loaded;
          setState(loaded);
        }
      } finally {
        setHydrated(true);
      }
    };
    void hydrate();
  }, []);

  const setLanguageChosen = useCallback((chosen: boolean) => persistPatch({ hasChosenLanguage: chosen }), [persistPatch]);
  const setSignedIn = useCallback((signedIn: boolean) => persistPatch({ isSignedIn: signedIn }), [persistPatch]);
  const setHasUsedFreeTrial = useCallback((used: boolean) => persistPatch({ hasUsedFreeTrial: used }), [persistPatch]);
  const setHasSubscription = useCallback(
    (subscribed: boolean) =>
      persistPatch(
        subscribed
          ? { hasSubscription: true }
          : {
              hasSubscription: false,
              canTakeExams: false,
              hasReadingAccess: false,
              hasVideoAccess: false,
              canChangeLanguage: false,
              subscriptionLanguage: null,
              subscriptionPlan: null,
            },
      ),
    [persistPatch],
  );
  const setCanTakeExams = useCallback((allowed: boolean) => persistPatch({ canTakeExams: allowed }), [persistPatch]);
  const setHasReadingAccess = useCallback((allowed: boolean) => persistPatch({ hasReadingAccess: allowed }), [persistPatch]);
  const setHasVideoAccess = useCallback((allowed: boolean) => persistPatch({ hasVideoAccess: allowed }), [persistPatch]);
  const setHasTimeBasedSubscription = useCallback(
    (subscribed: boolean) => persistPatch({ hasTimeBasedSubscription: subscribed }),
    [persistPatch],
  );
  const setCanChangeLanguage = useCallback((allowed: boolean) => persistPatch({ canChangeLanguage: allowed }), [persistPatch]);
  const setSubscriptionLanguage = useCallback(
    (lang: ContentLanguageCode | null) => persistPatch({ subscriptionLanguage: lang }),
    [persistPatch],
  );
  const setSubscriptionPlan = useCallback(
    (plan: SubscriptionType | null) => persistPatch({ subscriptionPlan: plan }),
    [persistPatch],
  );
  const setContentLanguage = useCallback((lang: ContentLanguageCode) => persistPatch({ contentLanguage: lang }), [persistPatch]);
  const setSigningOut = useCallback((signingOut: boolean) => setIsSigningOut(signingOut), []);
  const commitLanguageSelection = useCallback(
    (lang: ContentLanguageCode) => persistPatch({ contentLanguage: lang, hasChosenLanguage: true }),
    [persistPatch]
  );
  const resetFlow = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    stateRef.current = defaultState;
    setState(defaultState);
  }, []);

  const value = useMemo<AppFlowContextValue>(
    () => ({
      ...state,
      hydrated,
      isSigningOut,
      setLanguageChosen,
      setSignedIn,
      setHasUsedFreeTrial,
      setHasSubscription,
      setCanTakeExams,
      setHasReadingAccess,
      setHasVideoAccess,
      setHasTimeBasedSubscription,
      setCanChangeLanguage,
      setSubscriptionLanguage,
      setSubscriptionPlan,
      setContentLanguage,
      setSigningOut,
      commitLanguageSelection,
      resetFlow,
    }),
    [
      hydrated,
      isSigningOut,
      state,
      setLanguageChosen,
      setSignedIn,
      setHasUsedFreeTrial,
      setHasSubscription,
      setCanTakeExams,
      setHasReadingAccess,
      setHasVideoAccess,
      setHasTimeBasedSubscription,
      setCanChangeLanguage,
      setSubscriptionLanguage,
      setSubscriptionPlan,
      setContentLanguage,
      setSigningOut,
      commitLanguageSelection,
      resetFlow,
    ],
  );

  return <AppFlowContext.Provider value={value}>{children}</AppFlowContext.Provider>;
}

export function useAppFlow() {
  const ctx = useContext(AppFlowContext);
  if (!ctx) {
    throw new Error('useAppFlow must be used within AppFlowProvider');
  }
  return ctx;
}
