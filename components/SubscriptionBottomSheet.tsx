import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Dimensions,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { WebView } from 'react-native-webview';

import { AppText } from './AppText';
import { SkeletonBlock } from './RequestStates';
import { PaymentMethodLogo, type PaymentMethodLogoKey } from './PaymentMethodLogo';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { useI18n } from '../i18n/useI18n';
import { useAuth } from '../context/AuthContext';
import { useAppFlow } from '../context/AppFlowContext';
import { fetchLiveSubscriptionPlans, type LiveSubscriptionPlan } from '../services/backendPricing';
import { localeTagForContentLanguage } from '../services/paymentReceipt';
import { SubscriptionType } from '../services/api/subscriptionTypes';
import {
  checkPaymentStatus,
  initiateAirtelPayment,
  initiateCardPayment,
  initiateMomoPayment,
} from '../services/paymentApi';
import { extractPaymentReceipt } from '../services/paymentReceipt';
import { getMessageFromUnknownError } from '../services/api/client';
import { ApiError } from '../services/api/types';
import { toIntlRwandaPhone, toLocalRwandaPhone } from '../utils/phone';
import {
  clearPendingPayment,
  readPendingPayment,
  savePendingPayment,
  type PendingPaymentRecord,
} from '../services/pendingPaymentStore';
import {
  digitsOnly,
  validateCardExpiry,
  validateCardHolder,
  validateCardNumber,
  validateCvv,
} from '../utils/validation';
import { colors, radii, shadows, spacing, typography } from '../constants/theme';
import { MIN_TOUCH_TARGET } from '../constants/accessibility';

export type SubscriptionPlanItem = {
  subscriptionType: SubscriptionType;
  amountRwf: number;
  price: string;
  titleKey: string;
  featured?: boolean;
};

const PLAN_TITLE_KEYS: Record<SubscriptionType, string> = {
  monthly: 'payment.plan.month',
  'two-weekly': 'payment.plan.twoWeeks',
  weekly: 'payment.plan.week',
  daily: 'payment.plan.day',
  'five-exams': 'payment.plan.fiveExams',
  'two-exams': 'payment.plan.twoExams',
};

const PLAN_FEATURES_BY_LANGUAGE: Record<'rw' | 'en_fr', Record<SubscriptionType, string[]>> = {
  rw: {
    monthly: ['payment.feature.unlimited', 'payment.feature.videoAccess', 'payment.feature.readingAccess', 'payment.feature.duration30d'],
    'two-weekly': ['payment.feature.unlimited', 'payment.feature.videoAccess', 'payment.feature.readingAccess', 'payment.feature.duration14d'],
    weekly: ['payment.feature.unlimited', 'payment.feature.videoAccess', 'payment.feature.readingAccess', 'payment.feature.duration7d'],
    daily: ['payment.feature.unlimited', 'payment.feature.videoAccess', 'payment.feature.readingAccess', 'payment.feature.duration24h'],
    'five-exams': ['payment.feature.exams5', 'payment.feature.noVideo', 'payment.feature.noReading', 'payment.feature.attempts5'],
    'two-exams': ['payment.feature.exams2', 'payment.feature.noVideo', 'payment.feature.noReading', 'payment.feature.attempts2'],
  },
  en_fr: {
    monthly: ['payment.feature.unlimited', 'payment.feature.videoAccess', 'payment.feature.readingAccess', 'payment.feature.duration30d'],
    'two-weekly': ['payment.feature.unlimited', 'payment.feature.videoAccess', 'payment.feature.readingAccess', 'payment.feature.duration14d'],
    weekly: ['payment.feature.unlimited', 'payment.feature.videoAccess', 'payment.feature.readingAccess', 'payment.feature.duration7d'],
    daily: ['payment.feature.unlimited', 'payment.feature.videoAccess', 'payment.feature.readingAccess', 'payment.feature.duration24h'],
    'five-exams': ['payment.feature.exams5', 'payment.feature.noVideo', 'payment.feature.noReading', 'payment.feature.attempts5'],
    'two-exams': ['payment.feature.exams2', 'payment.feature.noVideo', 'payment.feature.noReading', 'payment.feature.attempts2'],
  },
};

const PLAN_DESCRIPTION_KEYS: Record<SubscriptionType, string> = {
  monthly: 'payment.planDescription.month',
  'two-weekly': 'payment.planDescription.twoWeeks',
  weekly: 'payment.planDescription.week',
  daily: 'payment.planDescription.day',
  'five-exams': 'payment.planDescription.fiveExams',
  'two-exams': 'payment.planDescription.twoExams',
};

const PRICE_BY_LANGUAGE: Record<'rw' | 'en_fr', Partial<Record<SubscriptionType, number>>> = {
  rw: {
    'five-exams': 500,
    daily: 2000,
    weekly: 5000,
    'two-weekly': 8000,
    monthly: 10000,
  },
  en_fr: {
    'five-exams': 1000,
    daily: 2000,
    weekly: 6000,
    'two-weekly': 10000,
    monthly: 15000,
  },
};

const PAYMENT_METHODS: Array<{ key: PaymentMethodLogoKey; labelKey: 'payment.methodMomo' | 'payment.methodAirtel' | 'payment.methodCard' }> = [
  { key: 'momo', labelKey: 'payment.methodMomo' },
  { key: 'airtel', labelKey: 'payment.methodAirtel' },
  { key: 'card', labelKey: 'payment.methodCard' },
];

function resolvePaymentLanguageForPlan(
  subscriptionType: SubscriptionType,
  amountRwf: number,
  preferredLanguage: 'en' | 'rw' | 'fr',
): 'en' | 'rw' | 'fr' {
  if (PRICE_BY_LANGUAGE.rw[subscriptionType] === amountRwf) {
    return 'rw';
  }
  if (PRICE_BY_LANGUAGE.en_fr[subscriptionType] === amountRwf) {
    return preferredLanguage === 'fr' ? 'fr' : 'en';
  }
  return preferredLanguage;
}

function toPlanItem(plan: LiveSubscriptionPlan, locale: string): SubscriptionPlanItem {
  return {
    subscriptionType: plan.subscriptionType,
    amountRwf: plan.amountRwf,
    price: plan.amountRwf.toLocaleString(locale),
    titleKey: PLAN_TITLE_KEYS[plan.subscriptionType],
  };
}

export type PaymentStatusKind = 'processing' | 'pending' | 'success' | 'failed' | 'cancelled' | 'timeout';

type PaymentStatusState = {
  kind: PaymentStatusKind;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  dismissible?: boolean;
};

const PAYMENT_POLL_INTERVAL_MS = 3000;
const PAYMENT_POLL_ATTEMPTS = 20;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractPaymentReference(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const objs: Record<string, unknown>[] = [];
  const root = payload as Record<string, unknown>;
  objs.push(root);
  if (root.data && typeof root.data === 'object' && !Array.isArray(root.data)) objs.push(root.data as Record<string, unknown>);
  if (root.payment && typeof root.payment === 'object' && !Array.isArray(root.payment)) objs.push(root.payment as Record<string, unknown>);
  if (root.result && typeof root.result === 'object' && !Array.isArray(root.result)) objs.push(root.result as Record<string, unknown>);
  const keys = [
    'reqRef', 'req_ref', 'requestRef', 'request_ref', 'requestId', 'request_id',
    'transaction_id', 'transactionId', 'orderId', 'order_id', 'reference', 'ref',
    'paymentId', 'payment_id', 'trx_id', 'trxId', 'uniqueTransactionId', 'unique_transaction_id', 'id', '_id',
  ];
  for (const obj of objs) {
    for (const key of keys) {
      const value = obj[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }
  return null;
}

function extractReqRef(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const root = payload as Record<string, unknown>;
  const objs: Record<string, unknown>[] = [root];
  if (root.data && typeof root.data === 'object' && !Array.isArray(root.data)) objs.push(root.data as Record<string, unknown>);
  if (root.payment && typeof root.payment === 'object' && !Array.isArray(root.payment)) objs.push(root.payment as Record<string, unknown>);
  if (root.result && typeof root.result === 'object' && !Array.isArray(root.result)) objs.push(root.result as Record<string, unknown>);

  for (const obj of objs) {
    const value = obj.reqRef ?? obj.req_ref ?? obj.requestRef ?? obj.request_ref ?? obj.requestId ?? obj.request_id;
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function extractPaymentMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const root = payload as Record<string, unknown>;
  const objs: Record<string, unknown>[] = [root];
  if (root.data && typeof root.data === 'object' && !Array.isArray(root.data)) objs.push(root.data as Record<string, unknown>);
  if (root.payment && typeof root.payment === 'object' && !Array.isArray(root.payment)) objs.push(root.payment as Record<string, unknown>);
  if (root.result && typeof root.result === 'object' && !Array.isArray(root.result)) objs.push(root.result as Record<string, unknown>);
  const keys = ['message', 'msg', 'error', 'details', 'reason', 'statusText'];
  for (const obj of objs) {
    for (const key of keys) {
      const value = obj[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }
  return null;
}

function extractCheckoutLink(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const root = payload as Record<string, unknown>;
  const objs: Record<string, unknown>[] = [root];
  if (root.data && typeof root.data === 'object' && !Array.isArray(root.data)) objs.push(root.data as Record<string, unknown>);
  if (root.payment && typeof root.payment === 'object' && !Array.isArray(root.payment)) objs.push(root.payment as Record<string, unknown>);
  if (root.result && typeof root.result === 'object' && !Array.isArray(root.result)) objs.push(root.result as Record<string, unknown>);

  for (const obj of objs) {
    const value = obj.link ?? obj.url ?? obj.checkoutUrl ?? obj.checkout_url ?? obj.redirectUrl ?? obj.redirect_url;
    if (typeof value === 'string' && /^https?:\/\//i.test(value.trim())) return value.trim();
  }
  return null;
}

function looksLikeSuccessfulPayment(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const root = payload as Record<string, unknown>;
  const objs: Record<string, unknown>[] = [root];
  if (root.data && typeof root.data === 'object' && !Array.isArray(root.data)) objs.push(root.data as Record<string, unknown>);
  if (root.payment && typeof root.payment === 'object' && !Array.isArray(root.payment)) objs.push(root.payment as Record<string, unknown>);
  if (root.result && typeof root.result === 'object' && !Array.isArray(root.result)) objs.push(root.result as Record<string, unknown>);
  const truthyKeys = ['paymentStatus', 'paid', 'success', 'successful', 'confirmed', 'active', 'status'];
  for (const obj of objs) {
    if (obj.paymentStatus === true || obj.paid === true || obj.success === true || obj.successful === true || obj.confirmed === true || obj.active === true) {
      return true;
    }
    const status = String(obj.status ?? obj.state ?? obj.paymentStatus ?? '').toLowerCase().trim();
    if (['approved', 'active', 'completed', 'success', 'paid', 'successful', 'confirmed', 'valid', 'activated'].includes(status)) {
      return true;
    }
    const message = String(obj.message ?? obj.msg ?? '').toLowerCase();
    if (message.includes('success')) return true;
    if (truthyKeys.some((k) => obj[k] === true)) return true;
  }
  return false;
}

function looksLikePendingPayment(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const root = payload as Record<string, unknown>;
  const objs: Record<string, unknown>[] = [root];
  if (root.data && typeof root.data === 'object' && !Array.isArray(root.data)) objs.push(root.data as Record<string, unknown>);
  if (root.payment && typeof root.payment === 'object' && !Array.isArray(root.payment)) objs.push(root.payment as Record<string, unknown>);
  if (root.result && typeof root.result === 'object' && !Array.isArray(root.result)) objs.push(root.result as Record<string, unknown>);
  for (const obj of objs) {
    const status = String(obj.status ?? obj.state ?? obj.paymentStatus ?? '').toLowerCase().trim();
    if (['pending', 'processing', 'initiated', 'waiting', 'queued', 'in progress', 'in-progress'].includes(status)) {
      return true;
    }
  }
  return false;
}

function looksLikeCancelledPayment(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const root = payload as Record<string, unknown>;
  const objs: Record<string, unknown>[] = [root];
  if (root.data && typeof root.data === 'object' && !Array.isArray(root.data)) objs.push(root.data as Record<string, unknown>);
  if (root.payment && typeof root.payment === 'object' && !Array.isArray(root.payment)) objs.push(root.payment as Record<string, unknown>);
  if (root.result && typeof root.result === 'object' && !Array.isArray(root.result)) objs.push(root.result as Record<string, unknown>);
  for (const obj of objs) {
    const status = String(obj.status ?? obj.state ?? obj.paymentStatus ?? '').toLowerCase().trim();
    const message = String(obj.message ?? obj.msg ?? obj.error ?? obj.reason ?? '').toLowerCase();
    if (['cancelled', 'canceled', 'cancelled_by_user', 'canceled_by_user', 'user_cancelled', 'user_canceled', 'aborted'].includes(status)) {
      return true;
    }
    if (message.includes('cancelled') || message.includes('canceled') || message.includes('cancel')) {
      return true;
    }
  }
  return false;
}

function looksLikeFailedPayment(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const root = payload as Record<string, unknown>;
  const objs: Record<string, unknown>[] = [root];
  if (root.data && typeof root.data === 'object' && !Array.isArray(root.data)) objs.push(root.data as Record<string, unknown>);
  if (root.payment && typeof root.payment === 'object' && !Array.isArray(root.payment)) objs.push(root.payment as Record<string, unknown>);
  if (root.result && typeof root.result === 'object' && !Array.isArray(root.result)) objs.push(root.result as Record<string, unknown>);
  for (const obj of objs) {
    const status = String(obj.status ?? obj.state ?? obj.paymentStatus ?? '').toLowerCase().trim();
    if (['failed', 'rejected', 'expired', 'declined', 'unsuccessful', 'error'].includes(status)) {
      return true;
    }
    const message = String(obj.message ?? obj.msg ?? obj.error ?? obj.reason ?? '').toLowerCase();
    if (message.includes('failed') || message.includes('declined') || message.includes('rejected') || message.includes('expired')) return true;
  }
  return false;
}

type PaymentStatusResolution = 'success' | 'pending' | 'cancelled' | 'failed' | 'unknown';

function resolvePaymentStatus(payload: unknown): PaymentStatusResolution {
  if (looksLikeSuccessfulPayment(payload)) return 'success';
  if (looksLikeCancelledPayment(payload)) return 'cancelled';
  if (looksLikeFailedPayment(payload)) return 'failed';
  if (looksLikePendingPayment(payload)) return 'pending';
  return 'unknown';
}

async function waitForPaymentConfirmation(
  probe: Record<string, unknown>,
  attempts = PAYMENT_POLL_ATTEMPTS,
): Promise<unknown> {
  let last: unknown = null;
  const reqRef = typeof probe.req_ref === 'string'
    ? probe.req_ref
    : typeof probe.reqRef === 'string'
      ? probe.reqRef
      : typeof probe.reference === 'string'
        ? probe.reference
        : '';
  for (let i = 0; i < attempts; i += 1) {
    last = await checkPaymentStatus(reqRef ? { req_ref: reqRef } : probe);
    const status = resolvePaymentStatus(last);
    if (status === 'success' || status === 'cancelled' || status === 'failed') {
      return last;
    }
    if (status === 'unknown' && i > 0) {
      return last;
    }
    if (i < attempts - 1) {
      await sleep(PAYMENT_POLL_INTERVAL_MS);
    }
  }
  return last;
}

export type SubscriptionBottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  preselectedType?: SubscriptionType;
  onSuccess?: () => void;
};

export function SubscriptionBottomSheet({
  visible,
  onClose,
  preselectedType,
  onSuccess,
}: SubscriptionBottomSheetProps) {
  const { t } = useI18n();
  const { insets, height: screenHeight, width: screenWidth, shortSide, scale, verticalScale, radius, font } = useResponsiveLayout();
  const { accessToken, refreshProfile, phone: profilePhone, userId } = useAuth();
  const { contentLanguage, hasSubscription } = useAppFlow();

  const [step, setStep] = useState<'plan' | 'payment'>('plan');
  const [selectedPlanIndex, setSelectedPlanIndex] = useState(0);

  // Payment Form States
  const [method, setMethod] = useState<'momo' | 'airtel' | 'card'>('momo');
  const [phoneInput, setPhoneInput] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    phone?: string;
    cardNumber?: string;
    cardHolder?: string;
    cardExpiry?: string;
    cardCvv?: string;
  }>({});
  const [payBusy, setPayBusy] = useState(false);
  const [statusModal, setStatusModal] = useState<PaymentStatusState | null>(null);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [validatedTargetPhone, setValidatedTargetPhone] = useState('');
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [pendingPayment, setPendingPayment] = useState<PendingPaymentRecord | null>(null);
  const [checkingPending, setCheckingPending] = useState(false);
  const isSubmittingRef = useRef(false);

  // Animations
  const sheetHeight = Math.min(screenHeight * 0.88, 720);
  const translateY = useRef(new Animated.Value(sheetHeight)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  // Live Plans Query
  const { data: plans = [], isPending: pricingLoading, error: queryError } = useQuery({
    queryKey: ['subscriptionPlans', contentLanguage],
    queryFn: async () => {
      const livePlans = await fetchLiveSubscriptionPlans(contentLanguage);
      const locale = localeTagForContentLanguage(contentLanguage);
      return [...livePlans]
        .sort((a, b) => a.amountRwf - b.amountRwf)
        .map((p) => toPlanItem(p, locale));
    },
    enabled: visible,
  });

  const pricingError = queryError ? getMessageFromUnknownError(queryError) : null;

  // Sync preselected type if provided
  useEffect(() => {
    if (preselectedType && plans.length > 0) {
      const idx = plans.findIndex((p) => p.subscriptionType === preselectedType);
      if (idx >= 0) {
        setSelectedPlanIndex(idx);
      }
    }
  }, [preselectedType, plans]);

  // Load pending payment when user changes or modal opens
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const loadPending = async () => {
      const stored = await readPendingPayment();
      if (cancelled) return;
      if (!stored) {
        setPendingPayment(null);
        return;
      }
      if (stored.userId && userId && stored.userId !== userId) {
        await clearPendingPayment();
        setPendingPayment(null);
        return;
      }
      setPendingPayment(stored);
      if (stored.checkoutUrl) {
        setCheckoutUrl(stored.checkoutUrl);
      }
    };
    void loadPending();
    return () => {
      cancelled = true;
    };
  }, [visible, userId]);

  // Slide In Animation
  const animateIn = useCallback(() => {
    translateY.setValue(sheetHeight);
    backdropOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        friction: 9,
        tension: 65,
        useNativeDriver: true,
      }),
    ]).start();
  }, [backdropOpacity, sheetHeight, translateY]);

  // Slide Out Animation
  const animateOut = useCallback((cb?: () => void) => {
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: sheetHeight,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      cb?.();
    });
  }, [backdropOpacity, sheetHeight, translateY]);

  // Handle visibility transitions
  useEffect(() => {
    if (visible) {
      setStep('plan');
      setFieldErrors({});
      animateIn();
    }
  }, [visible, animateIn]);

  const handleDismiss = useCallback(() => {
    Keyboard.dismiss();
    animateOut(() => {
      onClose();
    });
  }, [animateOut, onClose]);

  // Android Hardware Back Button Handling
  useEffect(() => {
    if (!visible) return;
    const backAction = () => {
      if (checkoutVisible) {
        setCheckoutVisible(false);
        return true;
      }
      if (confirmModalVisible) {
        setConfirmModalVisible(false);
        return true;
      }
      if (statusModal) {
        if (statusModal.dismissible !== false) {
          setStatusModal(null);
        }
        return true;
      }
      if (step === 'payment') {
        setStep('plan');
        return true;
      }
      handleDismiss();
      return true;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [visible, checkoutVisible, confirmModalVisible, statusModal, step, handleDismiss]);

  // PanResponder for drag-down gesture to dismiss
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 5,
        onPanResponderMove: (_, gestureState) => {
          if (gestureState.dy > 0) {
            translateY.setValue(gestureState.dy);
          }
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dy > 120 || gestureState.vy > 0.6) {
            handleDismiss();
          } else {
            Animated.spring(translateY, {
              toValue: 0,
              friction: 8,
              tension: 80,
              useNativeDriver: true,
            }).start();
          }
        },
      }),
    [handleDismiss, translateY],
  );

  const activePlan = plans[selectedPlanIndex] ?? plans[0];
  const subscriptionType = activePlan?.subscriptionType ?? 'monthly';
  const amountRwf = activePlan?.amountRwf ?? 0;
  const planTitle = activePlan ? t(PLAN_TITLE_KEYS[subscriptionType]) : '';
  const paymentLanguage = resolvePaymentLanguageForPlan(subscriptionType, amountRwf, contentLanguage);
  const locale = localeTagForContentLanguage(contentLanguage);
  const amountFormatted = amountRwf.toLocaleString(locale, { maximumFractionDigits: 0 });
  const isCard = method === 'card';
  const isMomo = method === 'momo';
  const fallbackCardPhone = profilePhone ? toLocalRwandaPhone(profilePhone.replace(/^250/, '0')) : null;
  const planActionLabel = hasSubscription ? t('payment.renewOrChangePlan') : t('payment.startNow');

  const showProcessingModal = () => {
    setStatusModal({
      kind: 'processing',
      title: t('payment.status.processingTitle'),
      dismissible: false,
    });
  };

  const showPendingModal = (message = t('payment.pendingNotice'), record?: PendingPaymentRecord | null) => {
    setStatusModal({
      kind: 'pending',
      title: t('payment.status.pendingTitle'),
      message,
      actionLabel: t('payment.resumePending'),
      onAction: () => {
        setStatusModal(null);
        const resumable = record ?? pendingPayment;
        if (resumable) {
          void resumePendingPayment(resumable);
        }
      },
    });
  };

  const showFailedModal = (message?: string) => {
    setStatusModal({
      kind: 'failed',
      title: t('payment.status.failedTitle'),
      message: message ?? t('payment.status.failedBody'),
      actionLabel: t('payment.status.failedAction'),
      onAction: () => setStatusModal(null),
    });
  };

  const showCancelledModal = (message?: string) => {
    setStatusModal({
      kind: 'cancelled',
      title: t('payment.status.cancelledTitle'),
      message: message ?? t('payment.status.cancelledBody'),
      actionLabel: t('payment.status.failedAction'),
      onAction: () => setStatusModal(null),
    });
  };

  const showTimeoutModal = (record?: PendingPaymentRecord | null) => {
    setStatusModal({
      kind: 'timeout',
      title: t('payment.status.timeoutTitle'),
      message: t('payment.status.timeoutBody'),
      actionLabel: t('payment.status.timeoutAction'),
      onAction: () => {
        setStatusModal(null);
        const resumable = record ?? pendingPayment;
        if (resumable) {
          void resumePendingPayment(resumable);
        }
      },
    });
  };

  const showSuccessModal = () => {
    setStatusModal({
      kind: 'success',
      title: t('payment.status.successTitle'),
      message: t('payment.status.successBody'),
      actionLabel: t('payment.startExam'),
      dismissible: false,
      onAction: () => {
        setStatusModal(null);
        handleDismiss();
        onSuccess?.();
      },
    });
  };

  const clearPendingState = async () => {
    setPendingPayment(null);
    setCheckoutUrl(null);
    setCheckoutVisible(false);
    await clearPendingPayment();
  };

  const finalizeSuccessfulPayment = async (record?: PendingPaymentRecord | null) => {
    let lastResult: Awaited<ReturnType<typeof refreshProfile>> | null = null;
    for (let i = 0; i < 3; i += 1) {
      lastResult = await refreshProfile();
      if (lastResult.status === 'active' && lastResult.hasSubscription === true) {
        await clearPendingState();
        showSuccessModal();
        return true;
      }
      if (lastResult.status === 'inactive' && i === 2) {
        await clearPendingState();
        showFailedModal(t('payment.status.failedBody'));
        return true;
      }
      await sleep(1500);
    }

    await clearPendingState();
    if (lastResult?.status === 'unknown') {
      showTimeoutModal(record);
    } else {
      showFailedModal(t('payment.status.failedBody'));
    }
    return true;
  };

  const handleTerminalPaymentStatus = async (
    payload: unknown,
    record?: PendingPaymentRecord | null,
  ): Promise<boolean> => {
    const status = resolvePaymentStatus(payload);
    if (status === 'success') {
      return await finalizeSuccessfulPayment(record);
    }
    if (status === 'cancelled') {
      await clearPendingState();
      showCancelledModal(extractPaymentMessage(payload) ?? t('payment.status.cancelledBody'));
      return true;
    }
    if (status === 'failed') {
      await clearPendingState();
      showFailedModal(extractPaymentMessage(payload) ?? t('payment.status.failedBody'));
      return true;
    }
    if (status === 'pending') {
      showTimeoutModal(record);
      return true;
    }
    return false;
  };

  const persistPending = async (
    reqRef: string,
    receipt: ReturnType<typeof extractPaymentReceipt>,
    nextCheckoutUrl?: string | null,
    phone?: string | null,
  ): Promise<PendingPaymentRecord> => {
    const record: PendingPaymentRecord = {
      reqRef,
      method,
      subscriptionType,
      amountRwf,
      language: paymentLanguage,
      planTitle,
      createdAt: new Date().toISOString(),
      orderId: receipt.orderId,
      checkoutUrl: nextCheckoutUrl ?? null,
      phone: phone ?? null,
      userId,
    };
    await savePendingPayment(record);
    setPendingPayment(record);
    setCheckoutUrl(nextCheckoutUrl ?? null);
    return record;
  };

  const resumePendingPayment = async (record: PendingPaymentRecord) => {
    if (!accessToken) {
      showFailedModal(t('payment.needSignIn'));
      return;
    }
    setCheckingPending(true);
    showProcessingModal();
    try {
      const statusPayload = await waitForPaymentConfirmation(
        {
          reqRef: record.reqRef,
          req_ref: record.reqRef,
          requestRef: record.reqRef,
          language: record.language,
          lang: record.language,
        },
        10,
      );

      if (await handleTerminalPaymentStatus(statusPayload, record)) {
        return;
      }

      if (record.checkoutUrl) {
        setStatusModal(null);
        setCheckoutUrl(record.checkoutUrl);
        setCheckoutVisible(true);
        return;
      }

      showTimeoutModal(record);
    } catch (e) {
      showFailedModal(getMessageFromUnknownError(e));
    } finally {
      setCheckingPending(false);
    }
  };

  const handlePressPayNow = () => {
    if (isSubmittingRef.current || payBusy || checkingPending) return;
    if (!accessToken) {
      showFailedModal(t('payment.needSignIn'));
      return;
    }
    if (amountRwf <= 0) {
      showPendingModal(t('payment.loadingPlans'));
      return;
    }

    if (!isCard) {
      const rawPhone = phoneInput.trim();
      if (!rawPhone) {
        setFieldErrors({ phone: t('validate.phoneRequired') });
        return;
      }
      const local = toLocalRwandaPhone(rawPhone);
      if (!local) {
        setFieldErrors({ phone: t('validate.phoneInvalid') });
        return;
      }
      setFieldErrors({});
      setValidatedTargetPhone(local);
      setConfirmModalVisible(true);
      return;
    }

    const err: typeof fieldErrors = {};
    const cn = validateCardNumber(cardNumber);
    if (!cn.ok) err.cardNumber = t(cn.key);
    const ch = validateCardHolder(cardHolder);
    if (!ch.ok) err.cardHolder = t(ch.key);
    const ce = validateCardExpiry(cardExpiry);
    if (!ce.ok) err.cardExpiry = t(ce.key);
    const cv = validateCvv(cardCvv);
    if (!cv.ok) err.cardCvv = t(cv.key);
    if (Object.keys(err).length > 0) {
      setFieldErrors(err);
      return;
    }
    const cardPhone = (phoneInput.trim() ? toLocalRwandaPhone(phoneInput.trim()) : null) || fallbackCardPhone;
    if (!cardPhone) {
      showFailedModal(t('payment.phoneInvalid'));
      return;
    }
    setFieldErrors({});
    setValidatedTargetPhone(cardPhone);
    setConfirmModalVisible(true);
  };

  const executePayment = async (targetPhone: string) => {
    if (isSubmittingRef.current || payBusy) return;
    isSubmittingRef.current = true;
    setPayBusy(true);
    showProcessingModal();

    try {
      await clearPendingPayment();
      setPendingPayment(null);

      if (!isCard) {
        const body = {
          amount: amountRwf,
          payment_method: method,
          phone: targetPhone,
          subscription_type: subscriptionType,
          language: paymentLanguage,
          lang: paymentLanguage,
        } as const;

        const paymentPayload =
          method === 'momo'
            ? await initiateMomoPayment(body, accessToken!)
            : await initiateAirtelPayment(body, accessToken!);
        const receipt = extractPaymentReceipt(paymentPayload, paymentLanguage);
        const reqRef = extractReqRef(paymentPayload);
        const reference = reqRef ?? extractPaymentReference(paymentPayload) ?? receipt.orderId.replace(/^#/, '');
        const probe = reqRef
          ? { reqRef, req_ref: reqRef, requestRef: reqRef, language: paymentLanguage, lang: paymentLanguage }
          : { amount: body.amount, phone: targetPhone, payment_method: body.payment_method, subscription_type: body.subscription_type, reference, language: body.language };

        let createdPending: PendingPaymentRecord | null = null;
        if (reqRef) {
          createdPending = await persistPending(reqRef, receipt, null, targetPhone);
        }

        const confirmedPayload = looksLikeSuccessfulPayment(paymentPayload)
          ? paymentPayload
          : reference
            ? await waitForPaymentConfirmation(probe)
            : paymentPayload;

        if (await handleTerminalPaymentStatus(confirmedPayload, createdPending)) {
          return;
        }
        throw new Error(extractPaymentMessage(confirmedPayload) ?? getMessageFromUnknownError(confirmedPayload));
      }

      // Card payment flow
      const paymentPayload = await initiateCardPayment(
        {
          amount: amountRwf,
          payment_method: 'card',
          subscription_type: subscriptionType,
          phone: targetPhone,
          language: paymentLanguage,
          lang: paymentLanguage,
          card_number: digitsOnly(cardNumber),
          card_name: cardHolder.trim(),
          card_cvc: digitsOnly(cardCvv),
          card_expdate: cardExpiry.trim(),
        },
        accessToken!,
      );
      const receipt = extractPaymentReceipt(paymentPayload, paymentLanguage);
      const reqRef = extractReqRef(paymentPayload);
      const nextCheckoutUrl = extractCheckoutLink(paymentPayload);
      const reference = reqRef ?? extractPaymentReference(paymentPayload) ?? receipt.orderId.replace(/^#/, '');

      if (reqRef) {
        await persistPending(reqRef, receipt, nextCheckoutUrl, targetPhone);
      }

      if (nextCheckoutUrl) {
        setStatusModal(null);
        setCheckoutVisible(true);
      }

      const immediateStatus = resolvePaymentStatus(paymentPayload);
      if (immediateStatus === 'success' || immediateStatus === 'cancelled' || immediateStatus === 'failed') {
        await handleTerminalPaymentStatus(paymentPayload, null);
        return;
      }

      if (looksLikePendingPayment(paymentPayload) || reqRef || nextCheckoutUrl) {
        if (!nextCheckoutUrl && reqRef) {
          await resumePendingPayment({
            reqRef,
            method: 'card',
            subscriptionType,
            amountRwf,
            language: paymentLanguage,
            planTitle,
            createdAt: new Date().toISOString(),
            orderId: receipt.orderId,
            checkoutUrl: nextCheckoutUrl,
            phone: targetPhone,
            userId,
          });
        } else if (!nextCheckoutUrl && !reqRef) {
          showTimeoutModal(null);
        }
        return;
      }

      throw new Error(reference ? `${t('payment.failed')} (${reference})` : t('payment.failed'));
    } catch (e) {
      showFailedModal(getMessageFromUnknownError(e));
    } finally {
      setPayBusy(false);
      isSubmittingRef.current = false;
    }
  };

  const isTablet = screenWidth >= 600;
  const sheetWidth = isTablet ? Math.min(540, screenWidth - 48) : screenWidth;

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleDismiss}>
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.modalBackdrop} onPress={handleDismiss}>
          <Animated.View style={[styles.backdropFill, { opacity: backdropOpacity }]} />
        </Pressable>

        <Animated.View
          style={[
            styles.sheetContainer,
            {
              width: sheetWidth,
              maxHeight: sheetHeight,
              transform: [{ translateY }],
              paddingBottom: Math.max(insets.bottom, spacing.md),
            },
          ]}
        >
          {/* Top Drag Handle Bar */}
          <View {...panResponder.panHandlers} style={styles.handleWrap}>
            <View style={styles.handleBar} />
          </View>

          {/* Sheet Header */}
          <View style={styles.headerRow}>
            {step === 'payment' ? (
              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => setStep('plan')}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Back to plans"
              >
                <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            ) : (
              <View style={styles.headerIconSquare}>
                <Ionicons name="card-outline" size={20} color={colors.primary} />
              </View>
            )}

            <View style={styles.headerTextWrap}>
              <AppText style={styles.sheetTitle}>
                {step === 'plan' ? t('subscription.title') : t('payment.title')}
              </AppText>
              <AppText style={styles.sheetSubtitle} lines={1}>
                {step === 'plan' ? t('payment.investTitle') : planTitle}
              </AppText>
            </View>

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={handleDismiss}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Sheet Content ScrollView */}
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {step === 'plan' ? (
              // Step 1: Subscription Plans
              <View style={styles.stepContent}>
                <AppText style={styles.sectionHeader}>{t('payment.selectAmountTitle')}</AppText>

                {pricingLoading ? (
                  <View style={{ gap: 12 }}>
                    <PlanCardSkeleton isActive />
                    <PlanCardSkeleton />
                    <PlanCardSkeleton />
                  </View>
                ) : pricingError ? (
                  <View style={styles.errorBox}>
                    <Ionicons name="alert-circle-outline" size={22} color={colors.error} />
                    <AppText style={styles.errorText} lines={null}>{pricingError}</AppText>
                  </View>
                ) : (
                  <View style={styles.plansList}>
                    {plans.map((p, index) => {
                      const isActive = index === selectedPlanIndex;
                      const features = PLAN_FEATURES_BY_LANGUAGE[contentLanguage === 'rw' ? 'rw' : 'en_fr'][p.subscriptionType] ?? [];
                      return (
                        <Pressable
                          key={p.subscriptionType}
                          style={[styles.planCard, isActive && styles.planCardActive]}
                          onPress={() => {
                            if (isActive) {
                              setStep('payment');
                            } else {
                              setSelectedPlanIndex(index);
                            }
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ selected: isActive }}
                        >
                          <View style={styles.planCardHeader}>
                            <View style={{ flex: 1, paddingRight: spacing.sm }}>
                              {isActive ? (
                                <View style={styles.bestValueBadge}>
                                  <AppText style={styles.bestValueText}>
                                    {t('payment.bestValue').toUpperCase()}
                                  </AppText>
                                </View>
                              ) : null}
                              <AppText style={[styles.planName, isActive && styles.planNameActive]} lines={2}>
                                {t(PLAN_TITLE_KEYS[p.subscriptionType])}
                              </AppText>
                              <AppText style={[styles.planDesc, isActive && styles.planDescActive]} lines={2}>
                                {t(PLAN_DESCRIPTION_KEYS[p.subscriptionType])}
                              </AppText>
                            </View>

                            <View style={styles.priceColumn}>
                              <AppText style={[styles.priceAmount, isActive && styles.priceAmountActive]}>
                                {p.price}
                              </AppText>
                              <AppText style={[styles.priceCurrency, isActive && styles.priceCurrencyActive]}>
                                RWF
                              </AppText>
                            </View>
                          </View>

                          {isActive && features.length > 0 ? (
                            <View style={styles.featuresBox}>
                              {features.map((k) => (
                                <View key={k} style={styles.featureItem}>
                                  <Ionicons name="checkmark-circle" size={15} color="#EFF6FF" />
                                  <AppText style={styles.featureItemText} lines={null}>
                                    {t(k)}
                                  </AppText>
                                </View>
                              ))}
                            </View>
                          ) : null}

                          <TouchableOpacity
                            style={[styles.cardActionBtn, isActive && styles.cardActionBtnActive]}
                            onPress={(e) => {
                              e.stopPropagation?.();
                              setSelectedPlanIndex(index);
                              setStep('payment');
                            }}
                            activeOpacity={0.88}
                            accessibilityRole="button"
                            accessibilityLabel={planActionLabel}
                          >
                            <AppText style={[styles.cardActionBtnText, isActive && styles.cardActionBtnTextActive]}>
                              {planActionLabel}
                            </AppText>
                            <Ionicons
                              name="arrow-forward"
                              size={16}
                              color={colors.primary}
                              style={{ marginLeft: 6 }}
                            />
                          </TouchableOpacity>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            ) : (
              // Step 2: Payment Methods & Checkout
              <View style={styles.stepContent}>
                {/* Plan Summary Row */}
                <View style={styles.planSummaryPill}>
                  <View style={styles.planSummaryLeft}>
                    <AppText style={styles.summaryPlanLabel}>{t('profile.subscriptionPlan')}</AppText>
                    <AppText style={styles.summaryPlanTitle}>{planTitle}</AppText>
                  </View>
                  <View style={styles.planSummaryRight}>
                    <AppText style={styles.summaryPlanAmount}>{amountFormatted} RWF</AppText>
                    <TouchableOpacity
                      style={styles.changePlanBtn}
                      onPress={() => setStep('plan')}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <AppText style={styles.changePlanText}>{t('payment.change')}</AppText>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Pending Payment Notice */}
                {pendingPayment ? (
                  <View style={styles.pendingCard}>
                    <Ionicons name="time-outline" size={20} color="#B45309" />
                    <View style={{ flex: 1, marginHorizontal: spacing.sm }}>
                      <AppText style={styles.pendingCardTitle}>{t('payment.pendingBannerTitle')}</AppText>
                      <AppText style={styles.pendingCardBody} lines={2}>
                        {t('payment.pendingBannerBody', { plan: pendingPayment.planTitle })}
                      </AppText>
                    </View>
                    <TouchableOpacity
                      style={styles.resumePendingBtn}
                      onPress={() => void resumePendingPayment(pendingPayment)}
                      disabled={payBusy || checkingPending}
                    >
                      <AppText style={styles.resumePendingText}>{t('payment.checkStatus')}</AppText>
                    </TouchableOpacity>
                  </View>
                ) : null}

                {/* Payment Methods */}
                <AppText style={styles.sectionHeader}>{t('payment.selectMethod')}</AppText>
                <AppText style={styles.sectionSubhint}>{t('payment.selectMethodHint')}</AppText>

                <View style={styles.methodsRow}>
                  {PAYMENT_METHODS.map((m) => {
                    const isSelected = method === m.key;
                    return (
                      <TouchableOpacity
                        key={m.key}
                        style={[styles.methodItem, isSelected && styles.methodItemActive]}
                        onPress={() => {
                          setMethod(m.key);
                          setFieldErrors({});
                        }}
                        activeOpacity={0.82}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                      >
                        <PaymentMethodLogo method={m.key} height={scale(34)} />
                        <AppText style={styles.methodTitle} lines={1}>
                          {t(m.labelKey)}
                        </AppText>
                        {isSelected ? (
                          <View style={styles.selectedMethodDot}>
                            <Ionicons name="checkmark" size={10} color="#FFFFFF" />
                          </View>
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Payment Form Fields */}
                <AppText style={[styles.sectionHeader, { marginTop: spacing.lg }]}>{t('payment.details')}</AppText>
                <View style={styles.inputsCard}>
                  {isCard ? (
                    <>
                      <AppText style={styles.fieldLabel}>{t('payment.cardNumber')}</AppText>
                      <TextInput
                        style={styles.input}
                        placeholder="1234 5678 9012 3456"
                        placeholderTextColor="#9CA3AF"
                        keyboardType="number-pad"
                        value={cardNumber}
                        onChangeText={(v) => {
                          setCardNumber(v);
                          setFieldErrors((prev) => ({ ...prev, cardNumber: undefined }));
                        }}
                      />
                      {fieldErrors.cardNumber ? (
                        <AppText style={styles.inputError}>{fieldErrors.cardNumber}</AppText>
                      ) : null}

                      <AppText style={[styles.fieldLabel, { marginTop: 12 }]}>{t('payment.cardHolder')}</AppText>
                      <TextInput
                        style={styles.input}
                        placeholder={t('payment.placeholderName')}
                        placeholderTextColor="#9CA3AF"
                        value={cardHolder}
                        onChangeText={(v) => {
                          setCardHolder(v);
                          setFieldErrors((prev) => ({ ...prev, cardHolder: undefined }));
                        }}
                      />
                      {fieldErrors.cardHolder ? (
                        <AppText style={styles.inputError}>{fieldErrors.cardHolder}</AppText>
                      ) : null}

                      <View style={styles.cardTwoCol}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <AppText style={[styles.fieldLabel, { marginTop: 12 }]}>{t('payment.expiry')}</AppText>
                          <TextInput
                            style={styles.input}
                            placeholder="MM/YY"
                            placeholderTextColor="#9CA3AF"
                            value={cardExpiry}
                            onChangeText={(v) => {
                              setCardExpiry(v);
                              setFieldErrors((prev) => ({ ...prev, cardExpiry: undefined }));
                            }}
                          />
                          {fieldErrors.cardExpiry ? (
                            <AppText style={styles.inputError}>{fieldErrors.cardExpiry}</AppText>
                          ) : null}
                        </View>
                        <View style={{ flex: 1, marginLeft: 8 }}>
                          <AppText style={[styles.fieldLabel, { marginTop: 12 }]}>{t('payment.cvv')}</AppText>
                          <TextInput
                            style={styles.input}
                            placeholder="123"
                            placeholderTextColor="#9CA3AF"
                            keyboardType="number-pad"
                            secureTextEntry
                            value={cardCvv}
                            onChangeText={(v) => {
                              setCardCvv(v);
                              setFieldErrors((prev) => ({ ...prev, cardCvv: undefined }));
                            }}
                          />
                          {fieldErrors.cardCvv ? (
                            <AppText style={styles.inputError}>{fieldErrors.cardCvv}</AppText>
                          ) : null}
                        </View>
                      </View>
                    </>
                  ) : (
                    <>
                      <AppText style={styles.fieldLabel}>{t('payment.phoneLabel')}</AppText>
                      <TextInput
                        style={styles.input}
                        placeholder={t('payment.phonePh')}
                        placeholderTextColor="#9CA3AF"
                        keyboardType="phone-pad"
                        value={phoneInput}
                        onChangeText={(v) => {
                          setPhoneInput(v);
                          setFieldErrors((prev) => ({ ...prev, phone: undefined }));
                        }}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      {fieldErrors.phone ? (
                        <AppText style={styles.inputError}>{fieldErrors.phone}</AppText>
                      ) : null}
                      <AppText style={styles.fieldHelper}>{t('payment.phoneFormatsHint')}</AppText>
                      <AppText style={styles.fieldHelper}>
                        {isMomo ? t('payment.momoHint') : t('payment.airtelHint')}
                      </AppText>
                    </>
                  )}
                </View>

                {/* Amount Due Card */}
                <View style={styles.totalDueCard}>
                  <View>
                    <AppText style={styles.totalDueLabel}>{t('payment.totalDue')}</AppText>
                    <AppText style={styles.totalDueMethod}>
                      {method === 'momo'
                        ? t('payment.methodMomo')
                        : method === 'airtel'
                          ? t('payment.methodAirtel')
                          : t('payment.methodCard')}
                    </AppText>
                  </View>
                  <View style={styles.totalDueRight}>
                    <AppText style={styles.totalDueAmount}>{amountFormatted}</AppText>
                    <AppText style={styles.totalDueCurrency}>RWF</AppText>
                  </View>
                </View>

                {/* Pay Now Button */}
                <TouchableOpacity
                  style={[styles.primaryActionBtn, (payBusy || checkingPending) && styles.disabledBtn]}
                  onPress={handlePressPayNow}
                  disabled={payBusy || checkingPending}
                  activeOpacity={0.88}
                >
                  {payBusy || checkingPending ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="lock-outline" size={17} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <AppText style={styles.primaryActionText}>
                        {hasSubscription ? t('payment.completeUpdate') : t('payment.payNow')}
                      </AppText>
                    </>
                  )}
                </TouchableOpacity>

                <View style={styles.securityBadge}>
                  <Ionicons name="shield-checkmark-outline" size={14} color={colors.textMuted} />
                  <AppText style={styles.securityText}>{t('payment.secure')}</AppText>
                </View>
              </View>
            )}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>

      {/* Confirmation Modal */}
      <Modal
        visible={confirmModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={payBusy ? undefined : () => setConfirmModalVisible(false)}
      >
        <Pressable
          style={styles.modalBackdropFill}
          onPress={payBusy ? undefined : () => setConfirmModalVisible(false)}
        >
          <Pressable style={styles.confirmDialog} onPress={(e) => e.stopPropagation()}>
            <View style={styles.confirmHeader}>
              <View style={styles.confirmShield}>
                <MaterialCommunityIcons name="shield-check" size={24} color={colors.primary} />
              </View>
              <AppText style={styles.confirmHeaderTitle}>{t('payment.confirmTitle')}</AppText>
            </View>

            <View style={styles.confirmSummary}>
              <View style={styles.confirmRow}>
                <AppText style={styles.confirmRowLabel}>{t('payment.planLabel')}</AppText>
                <AppText style={styles.confirmRowVal}>{planTitle}</AppText>
              </View>
              <View style={styles.confirmRow}>
                <AppText style={styles.confirmRowLabel}>{t('payment.amount')}</AppText>
                <AppText style={styles.confirmRowAmount}>{amountFormatted} RWF</AppText>
              </View>
              <View style={[styles.confirmRow, { borderBottomWidth: 0 }]}>
                <AppText style={styles.confirmRowLabel}>
                  {isCard ? t('payment.cardNumber') : t('payment.phoneLabel')}
                </AppText>
                <AppText style={styles.confirmRowVal}>
                  {isCard ? `•••• ${cardNumber.replace(/\D/g, '').slice(-4)}` : validatedTargetPhone}
                </AppText>
              </View>
            </View>

            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                onPress={() => setConfirmModalVisible(false)}
                disabled={payBusy}
              >
                <AppText style={styles.confirmCancelText}>{t('common.cancel')}</AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmPayBtn}
                onPress={() => {
                  setConfirmModalVisible(false);
                  void executePayment(validatedTargetPhone);
                }}
                disabled={payBusy}
              >
                <AppText style={styles.confirmPayText}>{t('payment.confirmAndPay')}</AppText>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Payment Status Modal */}
      {statusModal ? (
        <Modal
          visible={Boolean(statusModal)}
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={statusModal.dismissible === false ? undefined : () => setStatusModal(null)}
        >
          <Pressable
            style={styles.modalBackdropFill}
            onPress={statusModal.dismissible === false ? undefined : () => setStatusModal(null)}
          >
            <Pressable style={styles.statusDialog} onPress={(e) => e.stopPropagation()}>
              <View
                style={[
                  styles.statusIconCircle,
                  statusModal.kind === 'success' && styles.statusCircleSuccess,
                  (statusModal.kind === 'failed' || statusModal.kind === 'cancelled') && styles.statusCircleFailed,
                  statusModal.kind === 'processing' && styles.statusCircleProcessing,
                ]}
              >
                {statusModal.kind === 'processing' ? (
                  <ActivityIndicator size="large" color={colors.primary} />
                ) : (
                  <Ionicons
                    name={
                      statusModal.kind === 'success'
                        ? 'checkmark'
                        : statusModal.kind === 'failed' || statusModal.kind === 'cancelled'
                          ? 'alert-outline'
                          : 'time-outline'
                    }
                    size={32}
                    color={
                      statusModal.kind === 'success'
                        ? colors.success
                        : statusModal.kind === 'failed' || statusModal.kind === 'cancelled'
                          ? colors.error
                          : colors.primary
                    }
                  />
                )}
              </View>

              <AppText style={styles.statusTitle}>{statusModal.title}</AppText>
              {statusModal.message ? (
                <AppText style={styles.statusMessage} lines={null}>
                  {statusModal.message}
                </AppText>
              ) : null}

              {statusModal.actionLabel ? (
                <TouchableOpacity
                  style={[
                    styles.statusActionBtn,
                    statusModal.kind === 'success' ? styles.statusBtnSuccess : styles.statusBtnPrimary,
                  ]}
                  onPress={() => {
                    if (statusModal.onAction) {
                      statusModal.onAction();
                    } else {
                      setStatusModal(null);
                    }
                  }}
                  activeOpacity={0.88}
                >
                  <AppText style={styles.statusActionText}>{statusModal.actionLabel}</AppText>
                </TouchableOpacity>
              ) : null}
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}

      {/* 3D Secure Webview Modal */}
      {checkoutVisible && checkoutUrl ? (
        <Modal
          visible={checkoutVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setCheckoutVisible(false)}
        >
          <View style={styles.checkoutSheetWrap}>
            <View style={styles.checkoutSheetCard}>
              <View style={styles.checkoutHeader}>
                <AppText style={styles.checkoutTitle}>{t('payment.checkoutTitle')}</AppText>
                <TouchableOpacity
                  onPress={() => setCheckoutVisible(false)}
                  style={styles.checkoutClose}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={22} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>
              <WebView
                source={{ uri: checkoutUrl }}
                startInLoadingState
                setSupportMultipleWindows={false}
                javaScriptEnabled
                domStorageEnabled
                onShouldStartLoadWithRequest={(req) => req.url === 'about:blank' || /^https?:\/\//i.test(req.url)}
                onLoadEnd={() => {
                  if (pendingPayment) {
                    void resumePendingPayment(pendingPayment);
                  }
                }}
              />
            </View>
          </View>
        </Modal>
      ) : null}
    </Modal>
  );
}

function PlanCardSkeleton({ isActive }: { isActive?: boolean }) {
  return (
    <View style={[styles.planCard, isActive && styles.planCardActive]}>
      <View style={styles.planCardHeader}>
        <View style={{ flex: 1, gap: 8 }}>
          {isActive ? (
            <SkeletonBlock style={{ width: 80, height: 18, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)' }} />
          ) : null}
          <SkeletonBlock style={{ width: 120, height: 22, borderRadius: 4, backgroundColor: isActive ? 'rgba(255,255,255,0.4)' : undefined }} />
          <SkeletonBlock style={{ width: 180, height: 14, borderRadius: 4, backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : undefined }} />
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <SkeletonBlock style={{ width: 80, height: 28, borderRadius: 4, backgroundColor: isActive ? 'rgba(255,255,255,0.4)' : undefined }} />
          <SkeletonBlock style={{ width: 40, height: 14, borderRadius: 4, backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : undefined }} />
        </View>
      </View>
      <SkeletonBlock
        style={[
          styles.cardActionBtn,
          { width: '100%', backgroundColor: isActive ? 'rgba(255,255,255,0.35)' : undefined },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  backdropFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(17, 24, 39, 0.55)',
  },
  sheetContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    ...shadows.floating,
    overflow: 'hidden',
  },
  handleWrap: {
    width: '100%',
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleBar: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.line,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headerIconSquare: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  headerTextWrap: {
    flex: 1,
  },
  sheetTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
  sheetSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  scrollArea: {
    width: '100%',
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  stepContent: {
    width: '100%',
  },
  sectionHeader: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  sectionSubhint: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  plansList: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  planCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1.5,
    borderColor: colors.line,
    padding: spacing.lg,
    ...shadows.card,
  },
  planCardActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  planCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  bestValueBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
    marginBottom: 6,
  },
  bestValueText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 10,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  planName: {
    fontFamily: 'Poppins-Bold',
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  planNameActive: {
    color: '#FFFFFF',
  },
  planDesc: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  planDescActive: {
    color: 'rgba(255, 255, 255, 0.85)',
  },
  priceColumn: {
    alignItems: 'flex-end',
  },
  priceAmount: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 22,
    lineHeight: 28,
    color: colors.primary,
  },
  priceAmountActive: {
    color: '#FFFFFF',
  },
  priceCurrency: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 11,
    color: colors.textMuted,
  },
  priceCurrencyActive: {
    color: 'rgba(255, 255, 255, 0.85)',
  },
  featuresBox: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
    gap: 6,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureItemText: {
    ...typography.caption,
    color: '#FFFFFF',
    flex: 1,
  },
  cardActionBtn: {
    marginTop: spacing.md,
    minHeight: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.brandSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  cardActionBtnActive: {
    backgroundColor: '#FFFFFF',
    ...shadows.subtle,
  },
  cardActionBtnText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 14,
    color: colors.primary,
  },
  cardActionBtnTextActive: {
    color: colors.primary,
  },
  primaryActionBtn: {
    marginTop: spacing.xl,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.xl,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  disabledBtn: {
    opacity: 0.6,
  },
  primaryActionText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 15,
    color: '#FFFFFF',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.errorSoft,
    padding: spacing.md,
    borderRadius: radii.md,
    gap: 8,
    marginTop: spacing.sm,
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    flex: 1,
  },
  planSummaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  planSummaryLeft: {
    flex: 1,
  },
  summaryPlanLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  summaryPlanTitle: {
    fontFamily: 'Poppins-Bold',
    fontSize: 15,
    color: colors.textPrimary,
  },
  planSummaryRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  summaryPlanAmount: {
    fontFamily: 'Poppins-Bold',
    fontSize: 15,
    color: colors.primary,
  },
  changePlanBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: colors.brandSoft,
  },
  changePlanText: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 11,
    color: colors.primary,
  },
  pendingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    padding: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  pendingCardTitle: {
    fontFamily: 'Poppins-Bold',
    fontSize: 13,
    color: '#92400E',
  },
  pendingCardBody: {
    ...typography.caption,
    color: '#B45309',
  },
  resumePendingBtn: {
    backgroundColor: '#D97706',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  resumePendingText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 11,
    color: '#FFFFFF',
  },
  methodsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  methodItem: {
    flex: 1,
    minHeight: 82,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: 6,
    position: 'relative',
  },
  methodItemActive: {
    borderColor: colors.primary,
    backgroundColor: colors.brandSoft,
  },
  methodTitle: {
    ...typography.caption,
    fontFamily: 'Poppins-SemiBold',
    color: colors.textPrimary,
    marginTop: 4,
    textAlign: 'center',
  },
  selectedMethodDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputsCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.line,
    marginTop: spacing.sm,
  },
  fieldLabel: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: colors.textPrimary,
  },
  inputError: {
    ...typography.caption,
    color: colors.error,
    marginTop: 4,
  },
  fieldHelper: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 6,
    fontSize: 11,
  },
  cardTwoCol: {
    flexDirection: 'row',
    width: '100%',
  },
  totalDueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    marginTop: spacing.lg,
    ...shadows.subtle,
  },
  totalDueLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  totalDueMethod: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 13,
    color: colors.textSecondary,
  },
  totalDueRight: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  totalDueAmount: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 22,
    color: colors.primary,
  },
  totalDueCurrency: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 12,
    color: colors.textMuted,
  },
  securityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.md,
  },
  securityText: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
  },
  modalBackdropFill: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  confirmDialog: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.xl,
    ...shadows.floating,
  },
  confirmHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  confirmShield: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmHeaderTitle: {
    fontFamily: 'Poppins-Bold',
    fontSize: 17,
    color: colors.textPrimary,
  },
  confirmSummary: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: spacing.lg,
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  confirmRowLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  confirmRowVal: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 13,
    color: colors.textPrimary,
  },
  confirmRowAmount: {
    fontFamily: 'Poppins-Bold',
    fontSize: 14,
    color: colors.primary,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  confirmCancelBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCancelText: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 14,
    color: colors.textSecondary,
  },
  confirmPayBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmPayText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  statusDialog: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.xxl,
    alignItems: 'center',
    ...shadows.floating,
  },
  statusIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  statusCircleProcessing: {
    backgroundColor: colors.brandSoft,
  },
  statusCircleSuccess: {
    backgroundColor: '#DCFCE7',
  },
  statusCircleFailed: {
    backgroundColor: colors.errorSoft,
  },
  statusTitle: {
    fontFamily: 'Poppins-Bold',
    fontSize: 17,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  statusMessage: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  statusActionBtn: {
    width: '100%',
    minHeight: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBtnPrimary: {
    backgroundColor: colors.primary,
  },
  statusBtnSuccess: {
    backgroundColor: colors.success,
  },
  statusActionText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  checkoutSheetWrap: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  checkoutSheetCard: {
    height: '90%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    overflow: 'hidden',
  },
  checkoutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  checkoutTitle: {
    fontFamily: 'Poppins-Bold',
    fontSize: 16,
    color: colors.textPrimary,
  },
  checkoutClose: {
    padding: 4,
  },
});
