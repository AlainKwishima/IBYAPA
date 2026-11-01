import { AppText } from '../components/AppText';
import { SkeletonBlock } from '../components/RequestStates';
import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, Animated, Easing, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';

import { RootStackParamList } from '../navigation/types';
import { BottomNavBar } from '../components/BottomNavBar';
import { ScreenColumn } from '../components/ScreenColumn';
import { AppHeader } from '../components/AppHeader';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { useAppFlow } from '../context/AppFlowContext';
import { useAuth } from '../context/AuthContext';
import {
  checkPaymentStatus,
  initiateAirtelPayment,
  initiateCardPayment,
  initiateMomoPayment,
} from '../services/paymentApi';
import { extractPaymentReceipt, localeTagForContentLanguage } from '../services/paymentReceipt';
import { getMessageFromUnknownError } from '../services/api/client';
import { ApiError } from '../services/api/types';
import { toIntlRwandaPhone, toLocalRwandaPhone } from '../utils/phone';
import type { SubscriptionType } from '../services/api/subscriptionTypes';
import { fetchLiveSubscriptionPlans, type LiveSubscriptionPlan } from '../services/backendPricing';
import { clearPendingPayment, readPendingPayment, savePendingPayment, type PendingPaymentRecord } from '../services/pendingPaymentStore';
import { useI18n } from '../i18n/useI18n';
import {
  digitsOnly,
  validateCardNumber,
  validateCardExpiry,
  validateCvv,
  validateCardHolder,
} from '../utils/validation';
import { PaymentMethodLogo, type PaymentMethodLogoKey } from '../components/PaymentMethodLogo';
import { colors, radii, shadows, spacing, typography } from '../constants/theme';
import { TABLET_COLUMN_MAX } from '../utils/layoutMetrics';

const PAYMENT_METHODS: Array<{ key: PaymentMethodLogoKey; labelKey: 'payment.methodMomo' | 'payment.methodAirtel' | 'payment.methodCard' }> = [
  { key: 'momo', labelKey: 'payment.methodMomo' },
  { key: 'airtel', labelKey: 'payment.methodAirtel' },
  { key: 'card', labelKey: 'payment.methodCard' },
];

type SubscriptionProps = NativeStackScreenProps<RootStackParamList, 'SubscriptionNative'>;
type PaymentProps = NativeStackScreenProps<RootStackParamList, 'PaymentNative'>;
type Nav = SubscriptionProps['navigation'] | PaymentProps['navigation'];
export type PaymentStatusKind = 'processing' | 'pending' | 'success' | 'failed' | 'cancelled' | 'timeout';
export type PaymentStatusModalState = {
  kind: PaymentStatusKind;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  dismissible?: boolean;
};

const PAYMENT_POLL_INTERVAL_MS = 3000;
const PAYMENT_POLL_ATTEMPTS = 24;

function Header({ title, onBack, navigation }: { title: string; onBack: () => void; navigation: Nav }) {
  return <AppHeader title={title} onBack={onBack} navigation={navigation} />;
}

function BottomTabs({ navigation }: { navigation: Nav }) {
  return <BottomNavBar navigation={navigation} />;
}

export function PaymentStatusModal({
  state,
  onDismiss,
}: {
  state: PaymentStatusModalState | null;
  onDismiss: () => void;
}) {
  const visible = Boolean(state);
  const kind = state?.kind ?? 'processing';
  const isProcessing = kind === 'processing';
  const isSuccess = kind === 'success';
  const isFailed = kind === 'failed';
  const isCancelled = kind === 'cancelled';
  const isTimeout = kind === 'timeout';
  const iconName = isSuccess
    ? 'checkmark'
    : isFailed
      ? 'alert-outline'
      : isCancelled
        ? 'close'
        : kind === 'pending' || isTimeout
          ? 'time-outline'
          : null;

  const handleAction = () => {
    if (state?.onAction) {
      state.onAction();
      return;
    }
    onDismiss();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={state?.dismissible === false ? undefined : onDismiss}
    >
      <Pressable
        style={styles.statusBackdrop}
        onPress={state?.dismissible === false ? undefined : onDismiss}
      >
        <Pressable style={styles.statusCard} onPress={(event) => event.stopPropagation()}>
          <View
            style={[
              styles.statusIconWrap,
              isSuccess
                ? styles.statusIconSuccess
                : isFailed || isCancelled
                  ? styles.statusIconFailed
                  : isTimeout
                    ? styles.statusIconTimeout
                    : styles.statusIconProcessing,
            ]}
          >
            {isProcessing ? (
              <ProcessingDots />
            ) : (
              <Ionicons
                name={iconName as React.ComponentProps<typeof Ionicons>['name']}
                size={30}
                color={isSuccess ? colors.success : isFailed || isCancelled ? colors.error : colors.primary}
              />
            )}
          </View>
          <AppText style={styles.statusTitle}>{state?.title}</AppText>
          {state?.message ? <AppText style={styles.statusMessage} lines={null}>{state.message}</AppText> : null}
          {!isProcessing && state?.actionLabel ? (
            <TouchableOpacity
              style={[
                styles.statusAction,
                isSuccess ? styles.statusActionSuccess : isFailed || isCancelled ? styles.statusActionFailed : styles.statusActionPrimary,
              ]}
              onPress={handleAction}
              activeOpacity={0.88}
            >
              <AppText style={styles.statusActionText}>{state.actionLabel}</AppText>
            </TouchableOpacity>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ProcessingDots() {
  const dots = useRef([new Animated.Value(0.3), new Animated.Value(0.3), new Animated.Value(0.3)]).current;

  useEffect(() => {
    const animations = dots.map((dot, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 160),
          Animated.timing(dot, {
            toValue: 1,
            duration: 340,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0.3,
            duration: 340,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.delay((dots.length - index) * 120),
        ]),
      ),
    );
    animations.forEach((animation) => animation.start());
    return () => animations.forEach((animation) => animation.stop());
  }, [dots]);

  return (
    <View style={styles.processingDots}>
      {dots.map((dot, index) => (
        <Animated.View
          key={index}
          style={[
            styles.processingDot,
            {
              opacity: dot,
              transform: [
                {
                  translateY: dot.interpolate({
                    inputRange: [0.3, 1],
                    outputRange: [2, -3],
                  }),
                },
                {
                  scale: dot.interpolate({
                    inputRange: [0.3, 1],
                    outputRange: [0.86, 1.14],
                  }),
                },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

export function PaymentConfirmationModal({
  visible,
  planTitle,
  amountFormatted,
  method,
  phone,
  cardNumberLast4,
  onConfirm,
  onCancel,
  confirmBusy,
}: {
  visible: boolean;
  planTitle: string;
  amountFormatted: string;
  method: 'momo' | 'airtel' | 'card';
  phone?: string;
  cardNumberLast4?: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmBusy?: boolean;
}) {
  const { t } = useI18n();
  const isCard = method === 'card';
  const methodLabel =
    method === 'momo'
      ? t('payment.methodMomo')
      : method === 'airtel'
        ? t('payment.methodAirtel')
        : t('payment.methodCard');

  const promptMessage = isCard
    ? t('payment.confirmPromptCard', { amount: amountFormatted })
    : method === 'momo'
      ? t('payment.confirmPromptMomo', { amount: amountFormatted, phone: phone ?? '' })
      : t('payment.confirmPromptAirtel', { amount: amountFormatted, phone: phone ?? '' });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={confirmBusy ? undefined : onCancel}
    >
      <Pressable style={styles.confirmBackdrop} onPress={confirmBusy ? undefined : onCancel}>
        <Pressable style={styles.confirmCard} onPress={(event) => event.stopPropagation()}>
          <View style={styles.confirmHeader}>
            <View style={styles.confirmHeaderIcon}>
              <MaterialCommunityIcons name="shield-check" size={24} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText style={styles.confirmTitle}>{t('payment.confirmTitle')}</AppText>
            </View>
            {!confirmBusy ? (
              <TouchableOpacity onPress={onCancel} style={styles.confirmCloseBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={20} color={colors.inkMuted} />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.confirmSummaryBox}>
            <View style={styles.confirmRow}>
              <AppText style={styles.confirmLabel}>{t('payment.planLabel')}</AppText>
              <AppText style={styles.confirmValue}>{planTitle}</AppText>
            </View>
            <View style={styles.confirmRow}>
              <AppText style={styles.confirmLabel}>{t('payment.amount')}</AppText>
              <AppText style={styles.confirmAmountHighlight}>{amountFormatted} RWF</AppText>
            </View>
            <View style={styles.confirmRow}>
              <AppText style={styles.confirmLabel}>{t('payment.selectMethod')}</AppText>
              <View style={styles.confirmMethodBadge}>
                <PaymentMethodLogo method={method} height={18} />
                <AppText style={styles.confirmMethodText}>{methodLabel}</AppText>
              </View>
            </View>
            <View style={[styles.confirmRow, { borderBottomWidth: 0 }]}>
              <AppText style={styles.confirmLabel}>
                {isCard ? t('payment.cardNumber') : t('payment.phoneLabel')}
              </AppText>
              <AppText style={styles.confirmPhoneValue}>
                {isCard ? (cardNumberLast4 ? `•••• •••• •••• ${cardNumberLast4}` : 'Card') : phone}
              </AppText>
            </View>
          </View>

          <View style={styles.confirmPromptBox}>
            <Ionicons name="information-circle-outline" size={18} color={colors.brandStrong} />
            <AppText style={styles.confirmPromptText} lines={null}>
              {promptMessage}
            </AppText>
          </View>

          <View style={styles.confirmActions}>
            <TouchableOpacity
              style={[styles.confirmCancelBtn, confirmBusy && { opacity: 0.5 }]}
              onPress={onCancel}
              disabled={confirmBusy}
              activeOpacity={0.7}
            >
              <AppText style={styles.confirmCancelText}>{t('common.cancel')}</AppText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.confirmProceedBtn, confirmBusy && { opacity: 0.7 }]}
              onPress={onConfirm}
              disabled={confirmBusy}
              activeOpacity={0.88}
            >
              {confirmBusy ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <AppText style={styles.confirmProceedText}>{t('payment.confirmAndPay')}</AppText>
                </>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

type Plan = {
  titleKey: string;
  price: string;
  amountRwf: number;
  /** Must match backend enum for `subscription_type` on payment APIs */
  subscriptionType: SubscriptionType;
  featured?: boolean;
  isActive?: boolean;
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

function toPlanCard(plan: LiveSubscriptionPlan, locale: string): Plan {
  return {
    subscriptionType: plan.subscriptionType,
    amountRwf: plan.amountRwf,
    price: plan.amountRwf.toLocaleString(locale),
    titleKey: PLAN_TITLE_KEYS[plan.subscriptionType],
    featured: false, // Will be determined by scroll position
  };
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
    'reqRef',
    'req_ref',
    'requestRef',
    'request_ref',
    'requestId',
    'request_id',
    'transaction_id',
    'transactionId',
    'orderId',
    'order_id',
    'reference',
    'ref',
    'paymentId',
    'payment_id',
    'trx_id',
    'trxId',
    'uniqueTransactionId',
    'unique_transaction_id',
    'id',
    '_id',
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
    if (['approved', 'active', 'completed', 'success', 'paid', 'successful', 'confirmed', 'valid', 'activated', 'successful'].includes(status)) {
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

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
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

function buildPaymentProbe(
  body: {
    amount: number;
    payment_method: 'momo' | 'airtel' | 'card';
    phone: string;
    subscription_type: SubscriptionType;
    language?: 'en' | 'rw' | 'fr';
  },
  reference: string | null,
): Record<string, unknown> {
  const localPhone = toLocalRwandaPhone(body.phone) ?? body.phone;
  const intlPhone = toIntlRwandaPhone(body.phone) ?? (localPhone ? `250${localPhone.slice(1)}` : body.phone);
  return {
    amount: body.amount,
    amountRwf: body.amount,
    amount_rwf: body.amount,
    phone: localPhone,
    phoneIntl: intlPhone,
    msisdn: localPhone,
    msisdnIntl: intlPhone,
    customer_phone: localPhone,
    customer_phone_intl: intlPhone,
    phone_number: localPhone,
    phone_number_intl: intlPhone,
    phoneNumber: localPhone,
    payment_method: body.payment_method,
    paymentMethod: body.payment_method.toUpperCase(),
    subscription_type: body.subscription_type,
    subscriptionType: body.subscription_type,
    reference,
    ref: reference,
    orderId: reference,
    order_id: reference,
    transactionId: reference,
    transaction_id: reference,
    paymentId: reference,
    payment_id: reference,
    uniqueTransactionId: reference,
    reqRef: reference,
    req_ref: reference,
    requestRef: reference,
    language: body.language,
    lang: body.language,
  };
}

function PlanCard({
  plan,
  title,
  description,
  featureTexts,
  actionLabel,
  isActive,
  onPress,
  onCardPress,
}: {
  plan: Plan;
  title: string;
  description?: string;
  featureTexts?: string[];
  actionLabel: string;
  isActive?: boolean;
  onPress: () => void;
  onCardPress: () => void;
}) {
  const { t } = useI18n();

  return (
    <Pressable style={[styles.planCard, isActive && styles.planCardActive]} onPress={onCardPress}>
      <View style={styles.planCardHeader}>
        <View style={{ flex: 1 }}>
          {isActive ? <AppText style={styles.bestValue}>{t('payment.bestValue').toUpperCase()}</AppText> : null}
          <AppText style={[styles.planTitle, isActive && styles.planTitleActive]} lines={2}>{title}</AppText>
          {description ? <AppText style={[styles.planDescription, isActive && styles.planDescriptionActive]} lines={3}>{description}</AppText> : null}
        </View>
        <View style={styles.planPriceCol}>
          <AppText style={[styles.planPrice, isActive && styles.planPriceActive]}>{plan.price}</AppText>
          <AppText style={[styles.planCurrency, isActive && styles.planCurrencyActive]}>RWF</AppText>
        </View>
      </View>

      {isActive && featureTexts ? (
        <View style={styles.planFeatures}>
          {featureTexts.map((text) => (
            <View key={text} style={styles.featureRow}>
              <Ionicons name="checkmark-circle" size={14} color="#EFF6FF" />
              <AppText style={styles.featureText} lines={null}>{text}</AppText>
            </View>
          ))}
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.startNowBtn, isActive && styles.startNowBtnActive]}
        onPress={onPress}
      >
        <AppText style={[styles.startNowText, isActive && styles.startNowTextActive]}>{actionLabel}</AppText>
      </TouchableOpacity>
    </Pressable>
  );
}

function PlanCardSkeleton({ isActive }: { isActive?: boolean }) {
  return (
    <View style={[styles.planCard, isActive && styles.planCardActive]}>
      <View style={styles.planCardHeader}>
        <View style={{ flex: 1, gap: 8 }}>
          {isActive ? <SkeletonBlock style={{ width: 80, height: 18, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)' }} /> : null}
          <SkeletonBlock style={{ width: 120, height: 24, borderRadius: 4, backgroundColor: isActive ? 'rgba(255,255,255,0.4)' : undefined }} />
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <SkeletonBlock style={{ width: 90, height: 36, borderRadius: 4, backgroundColor: isActive ? 'rgba(255,255,255,0.4)' : undefined }} />
          <SkeletonBlock style={{ width: 40, height: 16, borderRadius: 4, backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : undefined }} />
        </View>
      </View>

      {isActive ? (
        <View style={styles.planFeatures}>
          {[1, 2, 3].map((i) => (
            <View key={i} style={styles.featureRow}>
              <SkeletonBlock style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.4)' }} />
              <SkeletonBlock style={{ width: 150, height: 14, borderRadius: 4, marginLeft: 10, backgroundColor: 'rgba(255,255,255,0.2)' }} />
            </View>
          ))}
        </View>
      ) : null}

      <SkeletonBlock style={[styles.startNowBtn, { width: '100%', backgroundColor: isActive ? 'rgba(255,255,255,0.4)' : undefined }]} />
    </View>
  );
}

export function SubscriptionNativeScreen({ navigation }: SubscriptionProps) {
  const { t } = useI18n();
  const { tabScrollBottomPad } = useResponsiveLayout();
  const { accessToken } = useAuth();
  const { hasSubscription, contentLanguage } = useAppFlow();
  const { data: plans = [], isPending: pricingLoading, error: queryError, refetch } = useQuery({
    queryKey: ['subscriptionPlans', contentLanguage],
    queryFn: async () => {
      const livePlans = await fetchLiveSubscriptionPlans(contentLanguage);
      const locale = localeTagForContentLanguage(contentLanguage);
      return [...livePlans]
        .sort((a, b) => a.amountRwf - b.amountRwf)
        .map((plan) => toPlanCard(plan, locale));
    }
  });

  const pricingError = queryError ? getMessageFromUnknownError(queryError) : null;
  const [activePlanIndex, setActivePlanIndex] = useState(0);
  const planActionLabel = hasSubscription ? t('payment.renewOrChangePlan') : t('payment.startNow');


  return (
    <ScreenColumn>
      <Header title={t('subscription.title')} onBack={() => navigation.goBack()} navigation={navigation} />
      <View style={styles.body}>
        <ScrollView
          contentContainerStyle={[styles.scrollPad, { paddingBottom: tabScrollBottomPad }]}
          showsVerticalScrollIndicator={false}
        >
          <AppText style={styles.subHeading}>{t('payment.investTitle')}</AppText>
          <AppText style={styles.subLead}>{t('payment.investBody')}</AppText>

          {hasSubscription ? (
            <View style={styles.renewBanner}>
              <Ionicons name="information-circle-outline" size={20} color="#1E3A8A" />
              <AppText style={styles.renewBannerText}>{t('payment.activePlanRenewHint')}</AppText>
            </View>
          ) : null}

          {pricingLoading ? (
            <View style={{ marginTop: 8 }}>
              <AppText style={styles.amountSectionTitle}>{t('payment.selectAmountTitle')}</AppText>
              <PlanCardSkeleton isActive={true} />
              <PlanCardSkeleton isActive={false} />
              <PlanCardSkeleton isActive={false} />
            </View>
          ) : pricingError ? (
            <View style={styles.pricingStatusCard}>
              <AppText style={styles.pricingStatusError}>{pricingError}</AppText>
            </View>
          ) : (
            <>
              <AppText style={styles.amountSectionTitle}>{t('payment.selectAmountTitle')}</AppText>
              {plans.map((plan, index) => (
              <PlanCard
                key={plan.subscriptionType}
                plan={plan}
                isActive={index === activePlanIndex}
                title={t(PLAN_TITLE_KEYS[plan.subscriptionType])}
                description={t(PLAN_DESCRIPTION_KEYS[plan.subscriptionType])}
                featureTexts={PLAN_FEATURES_BY_LANGUAGE[contentLanguage === 'rw' ? 'rw' : 'en_fr'][plan.subscriptionType].map((k) => t(k))}
                actionLabel={planActionLabel}
                onPress={() =>
                  navigation.navigate('PaymentNative', {
                    planTitle: t(PLAN_TITLE_KEYS[plan.subscriptionType]),
                    amountRwf: plan.amountRwf,
                    subscriptionType: plan.subscriptionType,
                    paymentLanguage: contentLanguage,
                  })
                }
                onCardPress={() => setActivePlanIndex(index)}
              />
            ))}
            </>
          )}

        </ScrollView>
      </View>
      <BottomTabs navigation={navigation} />
    </ScreenColumn>
  );
}

export function PaymentNativeScreen({ navigation, route }: PaymentProps) {
  const { t } = useI18n();
  const { tabScrollBottomPad, scale, shortSide } = useResponsiveLayout();
  const { accessToken, refreshProfile, phone: profilePhone, userId } = useAuth();
  const {
    contentLanguage,
    hasSubscription,
  } = useAppFlow();
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
  const [livePlans, setLivePlans] = useState<Plan[]>([]);
  const [pendingPayment, setPendingPayment] = useState<PendingPaymentRecord | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [checkingPending, setCheckingPending] = useState(false);
  const [statusModal, setStatusModal] = useState<PaymentStatusModalState | null>(null);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [validatedTargetPhone, setValidatedTargetPhone] = useState('');
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const live = await fetchLiveSubscriptionPlans(contentLanguage);
        if (!cancelled) {
          setLivePlans(live.map((plan) => toPlanCard(plan, localeTagForContentLanguage(contentLanguage))));
        }
      } catch {
        if (!cancelled) setLivePlans([]);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, contentLanguage]);

  const fallbackPlan =
    livePlans.find((plan) => plan.subscriptionType === route.params?.subscriptionType) ??
    livePlans[0] ??
    null;
  const subscriptionType =
    (route.params?.subscriptionType as SubscriptionType | undefined) ??
    fallbackPlan?.subscriptionType ??
    'daily';
  const amountRwf = route.params?.amountRwf ?? fallbackPlan?.amountRwf ?? 0;
  const planTitle = route.params?.planTitle ?? t(PLAN_TITLE_KEYS[subscriptionType]);
  const paymentLanguage = resolvePaymentLanguageForPlan(
    subscriptionType,
    amountRwf,
    route.params?.paymentLanguage ?? contentLanguage,
  );
  const fallbackCardPhone = profilePhone ? toLocalRwandaPhone(profilePhone.replace(/^250/, '0')) : null;

  // Auto-fill removed by user request

  useEffect(() => {
    setFieldErrors({});
  }, [method]);

  useEffect(() => {
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
  }, [userId]);

  const isCard = method === 'card';
  const isMomo = method === 'momo';
  const isCompactMethods = shortSide <= 360;
  const methodLogoHeight = scale(isCompactMethods ? 34 : 40);
  const locale = localeTagForContentLanguage(contentLanguage);
  const amountFormatted = amountRwf.toLocaleString(locale, { maximumFractionDigits: 0 });
  const selectedMethodLabel =
    method === 'momo'
      ? t('payment.methodMomo')
      : method === 'airtel'
        ? t('payment.methodAirtel')
        : t('payment.methodCard');
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
        navigation.navigate('ExamInstructionsNative');
      },
    });
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
      const statusPayload = await waitForPaymentConfirmation({
        reqRef: record.reqRef,
        req_ref: record.reqRef,
        requestRef: record.reqRef,
        language: record.language,
        lang: record.language,
      }, 10);

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

  const recoverAmbiguousPayment = async (
    probe: Record<string, unknown>,
    receipt: ReturnType<typeof extractPaymentReceipt>,
    nextMethod: 'momo' | 'airtel' | 'card',
    phone?: string | null,
  ): Promise<boolean> => {
    if (!accessToken) return false;
    try {
      const reqRef = typeof probe.req_ref === 'string'
        ? probe.req_ref
        : typeof probe.reqRef === 'string'
          ? probe.reqRef
          : typeof probe.reference === 'string'
            ? probe.reference
            : '';
      const statusPayload = await checkPaymentStatus(reqRef ? { req_ref: reqRef } : probe);
      const recoveredReqRef = extractReqRef(statusPayload) ?? (typeof probe.reqRef === 'string' ? probe.reqRef : null);
      const nextCheckoutUrl = extractCheckoutLink(statusPayload) ?? checkoutUrl;

      if (looksLikeSuccessfulPayment(statusPayload)) {
        await finalizeSuccessfulPayment(null);
        return true;
      }

      const status = resolvePaymentStatus(statusPayload);
      if (status === 'cancelled' || status === 'failed') {
        await handleTerminalPaymentStatus(statusPayload, null);
        return true;
      }

      if ((looksLikePendingPayment(statusPayload) || nextCheckoutUrl) && recoveredReqRef) {
        const record: PendingPaymentRecord = {
          reqRef: recoveredReqRef,
          method: nextMethod,
          subscriptionType,
          amountRwf,
          language: paymentLanguage,
          planTitle,
          createdAt: new Date().toISOString(),
          orderId: receipt.orderId,
          checkoutUrl: nextCheckoutUrl,
          phone: phone ?? null,
          userId,
        };
        await savePendingPayment(record);
        setPendingPayment(record);
        setCheckoutUrl(nextCheckoutUrl ?? null);
        if (nextCheckoutUrl) {
          setStatusModal(null);
          setCheckoutVisible(true);
          return true;
        }
        showPendingModal(t('payment.pendingNotice'), record);
        return true;
      }
    } catch {
      // Fall through to the original network error so the user can retry deliberately.
    }
    return false;
  };

  // Auto-resume removed: Selecting a plan or opening the payment screen only displays the checkout details.
  // Payment processing begins ONLY after the user enters their phone number and explicitly confirms.

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

  const handleConfirmPayment = () => {
    if (isSubmittingRef.current || payBusy) return;
    setConfirmModalVisible(false);
    void executePayment(validatedTargetPhone);
  };

  const executePayment = async (targetPhone: string) => {
    if (isSubmittingRef.current || payBusy) return;
    isSubmittingRef.current = true;
    setPayBusy(true);
    showProcessingModal();

    try {
      // Clear any prior stale pending payment before initiating new transaction
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
          : buildPaymentProbe(body, reference);

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
          await resumePendingPayment(
            {
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
            },
          );
        } else if (!nextCheckoutUrl && !reqRef) {
          showTimeoutModal(null);
        }
        return;
      }

      throw new Error(reference ? `${t('payment.failed')} (${reference})` : t('payment.failed'));
    } catch (e) {
      if (e instanceof ApiError && (e.status === 0 || e.status === 408)) {
        const recovered = await recoverAmbiguousPayment(
          buildPaymentProbe(
            {
              amount: amountRwf,
              payment_method: method,
              phone: targetPhone,
              subscription_type: subscriptionType,
              language: paymentLanguage,
            },
            null,
          ),
          extractPaymentReceipt({}, paymentLanguage),
          method,
          targetPhone,
        );
        if (recovered) return;
      }
      showFailedModal(getMessageFromUnknownError(e));
    } finally {
      setPayBusy(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <ScreenColumn>
      <Header title={t('payment.title')} onBack={() => navigation.goBack()} navigation={navigation} />
      <View style={styles.body}>
        <ScrollView contentContainerStyle={[styles.scrollPad, { paddingBottom: tabScrollBottomPad }]} showsVerticalScrollIndicator={false}>
          <View style={styles.subscriptionPlanCard}>
            <View style={styles.planSummaryHeader}>
              <View style={styles.planIconSquare}>
                <MaterialCommunityIcons name="calendar-check-outline" size={20} color="#FFFFFF" />
              </View>
              <View style={styles.planSummaryCopy}>
                <AppText style={styles.planSummaryLabel}>{t('profile.subscriptionPlan')}</AppText>
                <AppText style={styles.standardDaily}>{planTitle}</AppText>
              </View>
              <TouchableOpacity style={styles.changePill} onPress={() => navigation.navigate('SubscriptionNative')}>
                <AppText style={styles.changeLink}>{t('payment.change')}</AppText>
              </TouchableOpacity>
            </View>
            <View style={styles.planSummaryFooter}>
              <AppText style={styles.planSummaryCaption}>{t('payment.amount')}</AppText>
              <AppText style={styles.amountBlue}>{amountFormatted} RWF</AppText>
            </View>
          </View>

          {pendingPayment ? (
            <View style={styles.pendingBannerCard}>
              <View style={styles.pendingBannerIcon}>
                <Ionicons name="time-outline" size={20} color="#B45309" />
              </View>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <AppText style={styles.pendingBannerTitle}>
                  {t('payment.pendingBannerTitle')}
                </AppText>
                <AppText style={styles.pendingBannerBody} lines={2}>
                  {t('payment.pendingBannerBody', { plan: pendingPayment.planTitle })}
                </AppText>
              </View>
              <TouchableOpacity
                style={styles.pendingBannerCheckBtn}
                onPress={() => void resumePendingPayment(pendingPayment)}
                disabled={payBusy || checkingPending}
              >
                <AppText style={styles.pendingBannerCheckText}>{t('payment.checkStatus')}</AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.pendingBannerDismissBtn}
                onPress={() => void clearPendingState()}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={16} color={colors.inkMuted} />
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.paymentSectionCard}>
            <AppText style={styles.sectionTitle}>{t('payment.selectMethod')}</AppText>
            <AppText style={styles.sectionSupport} lines={null}>{t('payment.selectMethodHint')}</AppText>
            <View style={styles.methodsRow}>
              {PAYMENT_METHODS.map((m) => {
                const active = method === m.key;
                return (
                  <TouchableOpacity
                    key={m.key}
                    style={[styles.methodCard, active && styles.methodCardActive]}
                    onPress={() => {
                      setMethod(m.key);
                      setFieldErrors({});
                    }}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={t(m.labelKey)}
                  >
                    <PaymentMethodLogo method={m.key} height={methodLogoHeight} />
                    <AppText style={styles.methodLabel} lines={2}>
                      {t(m.labelKey)}
                    </AppText>
                    {active ? (
                      <View style={styles.checkDot}>
                        <Ionicons name="checkmark" size={10} color="#FFFFFF" />
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <AppText style={styles.sectionTitle}>{t('payment.details')}</AppText>
          <View style={styles.detailsCard}>
            {isCard ? (
              <>
                <AppText style={styles.inputLabel}>{t('payment.cardNumber')}</AppText>
                <TextInput
                  style={styles.inputField}
                  placeholder="1234 5678 9012 3456"
                  placeholderTextColor="#6B7280"
                  keyboardType="number-pad"
                  value={cardNumber}
                  onChangeText={(v) => {
                    setCardNumber(v);
                    setFieldErrors((e) => ({ ...e, cardNumber: undefined }));
                  }}
                />
                {fieldErrors.cardNumber ? <AppText style={styles.fieldError}>{fieldErrors.cardNumber}</AppText> : null}

                <AppText style={[styles.inputLabel, styles.inputLabelSpacing]}>{t('payment.cardHolder')}</AppText>
                <TextInput
                  style={styles.inputField}
                  placeholder={t('payment.placeholderName')}
                  placeholderTextColor="#6B7280"
                  value={cardHolder}
                  onChangeText={(v) => {
                    setCardHolder(v);
                    setFieldErrors((e) => ({ ...e, cardHolder: undefined }));
                  }}
                />
                {fieldErrors.cardHolder ? <AppText style={styles.fieldError}>{fieldErrors.cardHolder}</AppText> : null}

                <View style={styles.cardRow}>
                  <View style={styles.cardCol}>
                    <AppText style={styles.inputLabel}>{t('payment.expiry')}</AppText>
                    <TextInput
                      style={styles.inputField}
                      placeholder="MM/YY"
                      placeholderTextColor="#6B7280"
                      value={cardExpiry}
                      onChangeText={(v) => {
                        setCardExpiry(v);
                        setFieldErrors((e) => ({ ...e, cardExpiry: undefined }));
                      }}
                    />
                    {fieldErrors.cardExpiry ? <AppText style={styles.fieldError}>{fieldErrors.cardExpiry}</AppText> : null}
                  </View>
                  <View style={styles.cardCol}>
                    <AppText style={styles.inputLabel}>{t('payment.cvv')}</AppText>
                    <TextInput
                      style={styles.inputField}
                      placeholder="123"
                      placeholderTextColor="#6B7280"
                      keyboardType="number-pad"
                      secureTextEntry
                      value={cardCvv}
                      onChangeText={(v) => {
                        setCardCvv(v);
                        setFieldErrors((e) => ({ ...e, cardCvv: undefined }));
                      }}
                    />
                    {fieldErrors.cardCvv ? <AppText style={styles.fieldError}>{fieldErrors.cardCvv}</AppText> : null}
                  </View>
                </View>
                <AppText style={styles.inputHint} lines={null}>{t('payment.cardHint')}</AppText>
              </>
            ) : (
              <>
                <AppText style={styles.phoneSectionTitle}>{t('payment.phoneSectionTitle')}</AppText>
                <AppText style={styles.inputLabel}>{t('payment.phoneLabel')}</AppText>
                <TextInput
                  style={styles.inputField}
                  placeholder={t('payment.phonePh')}
                  placeholderTextColor="#6B7280"
                  keyboardType="phone-pad"
                  value={phoneInput}
                  onChangeText={(v) => {
                    setPhoneInput(v);
                    setFieldErrors((e) => ({ ...e, phone: undefined }));
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {fieldErrors.phone ? <AppText style={styles.fieldError}>{fieldErrors.phone}</AppText> : null}
                <AppText style={styles.inputHint} lines={null}>{t('payment.phoneFormatsHint')}</AppText>
                <AppText style={styles.inputHint} lines={null}>{isMomo ? t('payment.momoHint') : t('payment.airtelHint')}</AppText>
              </>
            )}
          </View>

          <View style={styles.amountSummaryCard}>
            <View>
              <AppText style={styles.amountSummaryLabel}>{t('payment.totalDue')}</AppText>
              <AppText style={styles.amountSummaryMethod}>{selectedMethodLabel}</AppText>
            </View>
            <View style={styles.amountSummaryRight}>
              <AppText style={styles.amountSummaryValue}>{amountFormatted}</AppText>
              <AppText style={styles.amountSummaryCurrency}>RWF</AppText>
            </View>
          </View>

          <TouchableOpacity
            style={styles.payNowBtn}
            onPress={handlePressPayNow}
            disabled={payBusy || checkingPending}
            activeOpacity={0.88}
          >
            {payBusy || checkingPending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <MaterialCommunityIcons name="lock-outline" size={16} color="#FFFFFF" />
                <AppText style={styles.payNowText}>
                  {hasSubscription ? t('payment.completeUpdate') : t('payment.payNow')}
                </AppText>
              </>
            )}
          </TouchableOpacity>
          <AppText style={styles.secureInfo}>{t('payment.secure')}</AppText>
        </ScrollView>
      </View>
      <BottomTabs navigation={navigation} />
      <Modal visible={checkoutVisible && !!checkoutUrl} transparent animationType="slide" onRequestClose={() => setCheckoutVisible(false)}>
        <View style={styles.checkoutBackdrop}>
          <View style={styles.checkoutSheet}>
            <View style={styles.checkoutHeader}>
              <AppText style={styles.checkoutTitle}>{t('payment.checkoutTitle')}</AppText>
              <TouchableOpacity onPress={() => setCheckoutVisible(false)} style={styles.checkoutCloseBtn}>
                <Ionicons name="close" size={22} color="#111827" />
              </TouchableOpacity>
            </View>
            {checkoutUrl ? (
              <WebView
                source={{ uri: checkoutUrl }}
                startInLoadingState
                setSupportMultipleWindows={false}
                javaScriptEnabled
                domStorageEnabled
                onShouldStartLoadWithRequest={(request) => request.url === 'about:blank' || /^https?:\/\//i.test(request.url)}
                onLoadEnd={() => {
                  if (pendingPayment) {
                    void resumePendingPayment(pendingPayment);
                  }
                }}
              />
            ) : null}
          </View>
        </View>
      </Modal>
      <PaymentConfirmationModal
        visible={confirmModalVisible}
        planTitle={planTitle}
        amountFormatted={amountFormatted}
        method={method}
        phone={validatedTargetPhone}
        cardNumberLast4={cardNumber.replace(/\D/g, '').slice(-4)}
        onConfirm={handleConfirmPayment}
        onCancel={() => setConfirmModalVisible(false)}
        confirmBusy={payBusy}
      />
      <PaymentStatusModal state={statusModal} onDismiss={() => setStatusModal(null)} />
    </ScreenColumn>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  scrollPad: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },

  subHeading: {
    textAlign: 'center',
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 20,
    lineHeight: 28,
    color: colors.ink,
  },
  subLead: {
    marginTop: 10,
    textAlign: 'center',
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    lineHeight: 18,
    color: colors.inkMuted,
  },
  renewBanner: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: colors.brandSoft,
  },
  renewBannerText: {
    flex: 1,
    marginLeft: 10,
    fontFamily: 'Poppins-Medium',
    fontSize: 12,
    lineHeight: 18,
    color: colors.brandStrong,
  },
  planCard: {
    marginTop: 16,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    padding: 20,
    borderWidth: 2,
    borderColor: 'transparent',
    ...shadows.card,
  },
  planCardActive: {
    backgroundColor: colors.brandStrong,
    borderColor: colors.brandStrong,
    shadowColor: colors.brandStrong,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 6,
  },
  planCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  bestValue: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 4,
    fontFamily: 'Poppins-Bold',
    fontSize: 10,
    lineHeight: 12,
    color: '#FFFFFF',
  },
  planTitle: { ...typography.title, fontSize: 20, color: colors.ink },
  planTitleActive: { color: '#FFFFFF' },
  planDescription: {
    marginTop: 6,
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    lineHeight: 18,
    color: colors.inkMuted,
  },
  planDescriptionActive: { color: '#EFF6FF' },
  planPriceCol: { alignItems: 'flex-end' },
  planPriceRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 2 },
  planPrice: { ...typography.display, fontSize: 32, color: colors.ink },
  planPriceActive: { color: '#FFFFFF' },
  planCurrency: { fontFamily: 'Poppins-Bold', fontSize: 14, color: '#6B7280' },
  planCurrencyActive: { color: '#EFF6FF' },
  planFeatures: { marginTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)', paddingTop: 16 },
  featureRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  featureText: { marginLeft: 10, fontFamily: 'Poppins-Medium', fontSize: 13, color: '#EFF6FF' },
  startNowBtn: {
    marginTop: 20,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startNowBtnActive: {
    backgroundColor: colors.surface,
  },
  startNowText: { fontFamily: 'Poppins-ExtraBold', fontSize: 15, color: colors.brand },
  startNowTextActive: { color: colors.brand },
  pricingStatusCard: {
    marginTop: 12,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 84,
  },
  pricingStatusText: {
    marginTop: 10,
    textAlign: 'center',
    fontFamily: 'Poppins-Medium',
    fontSize: 12,
    lineHeight: 17,
    color: '#374151',
  },
  pricingStatusError: {
    textAlign: 'center',
    fontFamily: 'Poppins-Medium',
    fontSize: 12,
    lineHeight: 17,
    color: '#F05252',
  },

  sectionTitle: { marginTop: 10, marginBottom: 10, ...typography.title, fontSize: 16, color: colors.ink },
  amountSectionTitle: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    ...typography.title,
    fontSize: 16,
    color: colors.ink,
  },
  phoneSectionTitle: {
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.warningSoft,
    ...typography.bodyStrong,
    color: colors.ink,
  },
  sectionSupport: {
    marginTop: -4,
    marginBottom: spacing.md,
    ...typography.caption,
    color: colors.inkMuted,
  },
  changeLink: { ...typography.caption, fontFamily: 'Poppins-Bold', color: colors.brand },
  subscriptionPlanCard: {
    marginTop: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    ...shadows.card,
  },
  planSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  planSummaryCopy: {
    flex: 1,
    marginLeft: spacing.md,
  },
  planSummaryLabel: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  planSummaryFooter: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  planSummaryCaption: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  changePill: {
    minHeight: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSoft,
  },
  planIconSquare: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  standardDaily: { fontFamily: 'Poppins-ExtraBold', fontSize: 16, lineHeight: 22, color: colors.ink },
  amountBlue: { fontFamily: 'Poppins-ExtraBold', fontSize: 18, lineHeight: 24, color: colors.brand },

  paymentSectionCard: {
    marginTop: spacing.lg,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadows.card,
  },
  methodsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  methodCard: {
    flex: 1,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    minHeight: 104,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    justifyContent: 'flex-start',
    borderWidth: 2,
    borderColor: colors.line,
  },
  methodCardActive: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  methodLabel: {
    marginTop: spacing.sm,
    fontFamily: 'Poppins-Bold',
    fontSize: 10,
    lineHeight: 14,
    color: colors.inkMuted,
    textAlign: 'center',
    paddingHorizontal: 2,
  },
  checkDot: { position: 'absolute', top: 7, right: 7, width: 16, height: 16, borderRadius: 8, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },

  detailsCard: {
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadows.card,
  },
  amountSummaryCard: {
    marginTop: spacing.lg,
    minHeight: 74,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.brand,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shadows.card,
  },
  amountSummaryLabel: {
    fontFamily: 'Poppins-Bold',
    fontSize: 12,
    lineHeight: 16,
    color: '#EFF6FF',
  },
  amountSummaryMethod: {
    marginTop: 3,
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 15,
    lineHeight: 20,
    color: colors.white,
  },
  amountSummaryRight: {
    alignItems: 'flex-end',
  },
  amountSummaryValue: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 24,
    lineHeight: 29,
    color: colors.white,
  },
  amountSummaryCurrency: {
    fontFamily: 'Poppins-Bold',
    fontSize: 12,
    color: '#EFF6FF',
  },
  inputLabel: { fontFamily: 'Poppins-ExtraBold', fontSize: 12, color: '#6B7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  inputLabelSpacing: { marginTop: 14 },
  inputField: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 14,
    fontFamily: 'Poppins-Bold',
    fontSize: 14,
    color: colors.ink,
  },
  cardRow: { marginTop: 10, flexDirection: 'row', justifyContent: 'space-between' },
  cardCol: { width: '48%' },
  phoneInputRow: {
    height: 42,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  flag: { fontSize: 12 },
  countryCode: { marginLeft: 6, fontFamily: 'Poppins-Medium', fontSize: 12, lineHeight: 16, color: '#374151' },
  phoneDivider: { width: 1, height: 18, backgroundColor: '#E5E7EB', marginHorizontal: 8 },
  phoneInput: { flex: 1, fontFamily: 'Poppins-Medium', fontSize: 12, lineHeight: 16, color: '#374151', paddingVertical: 0 },
  inputHint: { marginTop: 8, fontFamily: 'Poppins-Regular', fontStyle: 'italic', fontSize: 11, lineHeight: 16, color: '#6B7280' },
  fieldError: {
    marginTop: 6,
    fontFamily: 'Poppins-Medium',
    fontSize: 11,
    lineHeight: 15,
    color: '#F05252',
  },

  payNowBtn: {
    marginTop: 24,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brand,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.24,
    shadowRadius: 12,
    elevation: 4,
  },
  payNowText: { marginLeft: 8, fontFamily: 'Poppins-ExtraBold', fontSize: 16, color: '#FFFFFF' },
  secureInfo: { marginTop: 16, textAlign: 'center', ...typography.caption, color: colors.inkSoft },
  statusBackdrop: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  statusCard: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 22,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadows.floating,
  },
  statusIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  statusIconProcessing: {
    width: 96,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.blueTint,
    borderColor: colors.line,
  },
  statusIconSuccess: {
    backgroundColor: colors.successSoft,
    borderColor: colors.successSoft,
  },
  statusIconFailed: {
    backgroundColor: colors.errorSoft,
    borderColor: colors.errorSoft,
  },
  statusIconTimeout: {
    backgroundColor: colors.blueTint,
    borderColor: colors.line,
  },
  processingDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  processingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  statusTitle: {
    marginTop: spacing.xl,
    textAlign: 'center',
    ...typography.heading,
    fontSize: 20,
    lineHeight: 28,
    color: colors.textPrimary,
  },
  statusMessage: {
    marginTop: spacing.sm,
    textAlign: 'center',
    ...typography.body,
    color: colors.textSecondary,
  },
  statusAction: {
    width: '100%',
    minHeight: 56,
    marginTop: spacing.xl,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.subtle,
  },
  statusActionPrimary: {
    backgroundColor: colors.primary,
  },
  statusActionSuccess: {
    backgroundColor: colors.success,
  },
  statusActionFailed: {
    backgroundColor: colors.error,
  },
  statusActionText: {
    ...typography.bodyStrong,
    color: colors.white,
    fontSize: 16,
  },
  checkoutBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  checkoutSheet: {
    width: '100%',
    maxWidth: TABLET_COLUMN_MAX,
    alignSelf: 'center',
    height: '88%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    overflow: 'hidden',
  },
  checkoutHeader: {
    height: 58,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  checkoutTitle: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 16,
    color: colors.ink,
  },
  checkoutCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
  },

  tabs: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 74,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: '#F3F4F6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
  },
  tab: { alignItems: 'center' },
  tabBubble: { width: 46, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  tabBubbleActive: { backgroundColor: colors.brand },
  tabText: { marginTop: 2, fontFamily: 'Poppins-Medium', fontSize: 12, lineHeight: 14, color: '#6B7280' },
  tabTextActive: { color: colors.brand },

  pendingBannerCard: {
    marginTop: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pendingBannerIcon: {
    marginRight: spacing.sm,
  },
  pendingBannerTitle: {
    fontFamily: 'Poppins-Bold',
    fontSize: 12,
    color: '#92400E',
  },
  pendingBannerBody: {
    fontFamily: 'Poppins-Regular',
    fontSize: 11,
    color: '#B45309',
    marginTop: 2,
  },
  pendingBannerCheckBtn: {
    backgroundColor: '#92400E',
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    marginRight: spacing.xs,
  },
  pendingBannerCheckText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 11,
    color: '#FFFFFF',
  },
  pendingBannerDismissBtn: {
    padding: 4,
  },

  confirmBackdrop: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  confirmCard: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 22,
    padding: spacing.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadows.floating,
  },
  confirmHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  confirmHeaderIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  confirmTitle: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 18,
    lineHeight: 24,
    color: colors.ink,
  },
  confirmCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  confirmSummaryBox: {
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.line,
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  confirmLabel: {
    fontFamily: 'Poppins-Medium',
    fontSize: 12,
    color: colors.inkMuted,
  },
  confirmValue: {
    fontFamily: 'Poppins-Bold',
    fontSize: 13,
    color: colors.ink,
  },
  confirmAmountHighlight: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 15,
    color: colors.brand,
  },
  confirmMethodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  confirmMethodText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 12,
    color: colors.ink,
  },
  confirmPhoneValue: {
    fontFamily: 'Poppins-Bold',
    fontSize: 13,
    color: colors.ink,
  },
  confirmPromptBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.brandSoft,
    gap: spacing.sm,
  },
  confirmPromptText: {
    flex: 1,
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    lineHeight: 18,
    color: colors.brandStrong,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  confirmCancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCancelText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 14,
    color: colors.inkMuted,
  },
  confirmProceedBtn: {
    flex: 1.5,
    height: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.brand,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmProceedText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 14,
    color: '#FFFFFF',
  },
});
