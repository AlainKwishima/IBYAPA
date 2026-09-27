import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { AppHeader } from '../components/AppHeader';
import { AppText } from '../components/AppText';
import { InlineErrorState } from '../components/RequestStates';
import { PaymentMethodLogo, type PaymentMethodLogoKey } from '../components/PaymentMethodLogo';
import { ScreenColumn } from '../components/ScreenColumn';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/useI18n';
import type { RootStackParamList } from '../navigation/types';
import {
  checkCertificatePaymentStatus,
  payCertificateRequest,
  type CertificatePaymentMethod,
} from '../services/certificatesApi';
import { getMessageFromUnknownError } from '../services/api/client';
import { toLocalRwandaPhone } from '../utils/phone';
import { colors, radii, shadows, spacing, typography } from '../constants/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { PaymentStatusModal, type PaymentStatusModalState } from './PaymentNativeScreens';

type Props = NativeStackScreenProps<RootStackParamList, 'CertificatePaymentNative'>;

const PAYMENT_METHODS: Array<{ key: CertificatePaymentMethod; labelKey: 'payment.methodMomo' | 'payment.methodAirtel' | 'payment.methodCard' }> = [
  { key: 'momo', labelKey: 'payment.methodMomo' },
  { key: 'airtel', labelKey: 'payment.methodAirtel' },
  { key: 'card', labelKey: 'payment.methodCard' },
];

const POLL_INTERVAL_MS = 3000;
const POLL_ATTEMPTS = 24;

function readPayloadObjects(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
  const root = payload as Record<string, unknown>;
  const objects = [root];
  for (const key of ['data', 'payment', 'result']) {
    const value = root[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) objects.push(value as Record<string, unknown>);
  }
  return objects;
}

function extractReqRef(payload: unknown): string | null {
  for (const object of readPayloadObjects(payload)) {
    const value = object.reqRef ?? object.req_ref ?? object.requestRef ?? object.request_ref;
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function extractLink(payload: unknown): string | null {
  for (const object of readPayloadObjects(payload)) {
    const value = object.link ?? object.url ?? object.redirectUrl;
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function resolveStatus(payload: unknown): 'success' | 'failed' | 'cancelled' | 'pending' | 'unknown' {
  for (const object of readPayloadObjects(payload)) {
    const status = String(object.status ?? object.state ?? object.paymentStatus ?? '').toLowerCase().trim();
    const message = String(object.message ?? object.msg ?? object.error ?? object.reason ?? '').toLowerCase();
    if (['successful', 'success', 'completed', 'paid', 'approved', 'confirmed'].includes(status) || object.success === true || object.paid === true) return 'success';
    if (['cancelled', 'canceled', 'cancelled_by_user', 'canceled_by_user', 'aborted'].includes(status) || message.includes('cancel')) return 'cancelled';
    if (['failed', 'rejected', 'expired', 'declined', 'unsuccessful', 'error'].includes(status) || message.includes('failed') || message.includes('declined')) return 'failed';
    if (['pending', 'processing', 'initiated', 'waiting', 'queued', 'in progress', 'in-progress'].includes(status)) return 'pending';
  }
  return 'unknown';
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function CertificatePaymentNativeScreen({ navigation, route }: Props) {
  const { t } = useI18n();
  const { accessToken, phone: profilePhone } = useAuth();
  const { scale, verticalScale, radius, touch, font, lineHeight } = useResponsiveLayout();
  const requestId = route.params?.requestId;
  const amountRwf = route.params?.amountRwf ?? 1000;
  const [method, setMethod] = useState<CertificatePaymentMethod>('momo');
  const [phone, setPhone] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastReqRef, setLastReqRef] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusModal, setStatusModal] = useState<PaymentStatusModalState | null>(null);

  useEffect(() => {
    if (!profilePhone) return;
    const local = toLocalRwandaPhone(profilePhone.replace(/^250/, '0'));
    if (local) setPhone(local);
  }, [profilePhone]);

  const amountFormatted = useMemo(() => amountRwf.toLocaleString('en-RW', { maximumFractionDigits: 0 }), [amountRwf]);
  const isCard = method === 'card';

  const showResult = (kind: PaymentStatusModalState['kind'], title: string, message: string, actionLabel: string, onAction?: () => void) => {
    setStatusModal({ kind, title, message, actionLabel, onAction });
  };

  const showSuccess = () => {
    setStatusModal({
      kind: 'success',
      title: 'Under review',
      message: 'Your request is being reviewed. We will notify you.',
      actionLabel: 'Dashboard',
      onAction: () => {
        setStatusModal(null);
        navigation.navigate('HomeNative');
      },
      dismissible: false,
    });
  };

  const pollPayment = async (reqRef: string) => {
    if (!accessToken) return;
    setLastReqRef(reqRef);
    setStatusModal({ kind: 'processing', title: t('certificate.paymentCheckingTitle'), dismissible: false });
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
      try {
        const result = await checkCertificatePaymentStatus(accessToken, reqRef);
        const status = resolveStatus(result);
        if (status === 'success') {
          showSuccess();
          return;
        }
        if (status === 'cancelled') {
          showResult('cancelled', t('payment.status.cancelledTitle'), t('payment.status.cancelledBody'), t('payment.status.failedAction'));
          return;
        }
        if (status === 'failed') {
          showResult('failed', t('payment.status.failedTitle'), t('payment.status.failedBody'), t('payment.status.failedAction'));
          return;
        }
      } catch {
        // Keep polling; a short network interruption should not turn a valid payment into a failure.
      }
      await sleep(POLL_INTERVAL_MS);
    }
    showResult('timeout', t('payment.status.timeoutTitle'), t('payment.status.timeoutBody'), t('payment.status.timeoutAction'), () => {
      setStatusModal(null);
      if (lastReqRef) void pollPayment(lastReqRef);
    });
  };

  const submit = async () => {
    if (!accessToken || !requestId) {
      showResult('failed', t('certificate.paymentFailedTitle'), t('certificate.paymentRequestMissing'), t('payment.status.failedAction'));
      return;
    }
    const localPhone = toLocalRwandaPhone(phone);
    if (!localPhone) {
      setError(t('certificate.paymentPhoneError'));
      return;
    }
    if (isCard && (cardNumber.replace(/\D/g, '').length < 16 || cardName.trim().length < 2 || cardCvv.replace(/\D/g, '').length < 3 || !cardExpiry)) {
      setError(t('certificate.paymentCardError'));
      return;
    }

    setError(null);
    setBusy(true);
    setStatusModal({ kind: 'processing', title: t('payment.status.processingTitle'), dismissible: false });
    try {
      const result = await payCertificateRequest(accessToken, requestId, {
        phone: localPhone,
        payment_method: method,
        amount: amountRwf,
        ...(isCard
          ? {
              card_number: cardNumber.replace(/\D/g, ''),
              card_name: cardName.trim(),
              card_cvc: cardCvv.replace(/\D/g, ''),
              card_expdate: cardExpiry,
            }
          : {}),
      });
      const status = resolveStatus(result);
      const reqRef = extractReqRef(result);
      const link = extractLink(result);

      if (link) {
        void Linking.openURL(link);
        showSuccess();
      } else if (status === 'success') {
        showSuccess();
      } else if (status === 'cancelled') {
        showResult('cancelled', t('payment.status.cancelledTitle'), t('payment.status.cancelledBody'), t('payment.status.failedAction'));
      } else if (status === 'failed') {
        showResult('failed', t('payment.status.failedTitle'), t('payment.status.failedBody'), t('payment.status.failedAction'));
      } else if (reqRef) {
        await pollPayment(reqRef);
      } else {
        showResult('pending', t('payment.status.pendingTitle'), t('certificate.paymentPendingMessage'), t('payment.status.timeoutAction'));
      }
    } catch (paymentError) {
      showResult('failed', t('payment.status.failedTitle'), getMessageFromUnknownError(paymentError), t('payment.status.failedAction'));
    } finally {
      setBusy(false);
    }
  };

  if (!requestId) {
    return (
      <ScreenColumn>
        <AppHeader title={t('certificate.paymentScreenTitle')} onBack={() => navigation.goBack()} navigation={navigation} />
        <View style={[styles.content, { padding: scale(spacing.lg) }]}>
          <InlineErrorState title={t('certificate.paymentFailedTitle')} message={t('certificate.paymentRequestMissing')} onRetry={() => navigation.goBack()} />
        </View>
      </ScreenColumn>
    );
  }

  return (
    <ScreenColumn>
      <AppHeader title={t('certificate.paymentScreenTitle')} onBack={() => navigation.goBack()} navigation={navigation} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.content, { padding: scale(spacing.lg), paddingBottom: verticalScale(40) }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[styles.card, { padding: scale(spacing.lg), borderRadius: radius(radii.xl) }]}>
            <View style={styles.paymentTopRow}>
              <AppText style={[styles.sectionTitle, styles.paymentTitle, { fontSize: font(16), lineHeight: lineHeight(21) }]}>{t('certificate.paymentBadge')}</AppText>
              <View style={[styles.feeBox, { padding: scale(spacing.sm), borderRadius: radius(radii.md) }]}>
                <AppText style={[styles.feeLabel, { fontSize: font(10), lineHeight: lineHeight(14) }]}>{t('certificate.paymentTotalLabel')}</AppText>
                <AppText style={[styles.feeAmount, { marginTop: verticalScale(2), fontSize: font(16), lineHeight: lineHeight(20) }]}>{amountFormatted} RWF</AppText>
              </View>
            </View>
            <AppText style={[styles.methodHint, { marginTop: verticalScale(spacing.md), fontSize: font(12), lineHeight: lineHeight(17) }]}>{t('certificate.paymentMethodTitle')}</AppText>
            <View style={[styles.methods, { gap: scale(spacing.sm), marginTop: verticalScale(spacing.md) }]}>
              {PAYMENT_METHODS.map((item) => (
                <TouchableOpacity key={item.key} onPress={() => { setMethod(item.key); setError(null); }} style={[styles.method, { minHeight: touch(92), borderRadius: radius(radii.md) }, method === item.key && styles.methodSelected]} activeOpacity={0.84}>
                  <PaymentMethodLogo method={item.key as PaymentMethodLogoKey} height={scale(34)} />
                  <AppText style={[styles.methodLabel, { fontSize: font(10), lineHeight: lineHeight(14) }]}>{t(item.labelKey)}</AppText>
                  {method === item.key ? <Ionicons name="checkmark-circle" size={scale(17)} color={colors.primary} style={styles.methodCheck} /> : null}
                </TouchableOpacity>
              ))}
            </View>

          </View>

          <View style={[styles.phoneCard, { marginTop: verticalScale(spacing.lg), padding: scale(spacing.lg), borderRadius: radius(radii.xl) }]}>
            <View style={[styles.paymentInstruction, { minHeight: touch(32), paddingHorizontal: scale(spacing.sm), borderRadius: radius(radii.sm) }]}>
              <AppText style={[styles.paymentInstructionText, { fontSize: font(11), lineHeight: lineHeight(15) }]}>{t('certificate.paymentPhoneInstruction')}</AppText>
            </View>
            {!isCard ? (
              <Field label={t('payment.phoneLabel')} value={phone} placeholder={t('payment.phonePh')} onChangeText={(value) => { setPhone(value.replace(/\D/g, '').slice(0, 10)); setError(null); }} keyboardType="phone-pad" />
            ) : (
              <>
                <Field label={t('payment.cardNumber')} value={cardNumber} placeholder={t('payment.cardNumber')} onChangeText={setCardNumber} keyboardType="number-pad" />
                <Field label={t('payment.cardHolder')} value={cardName} placeholder={t('payment.cardHolder')} onChangeText={setCardName} />
                <View style={styles.rowFields}>
                  <View style={styles.flexField}><Field label={t('payment.expiry')} value={cardExpiry} placeholder="MM/YY" onChangeText={setCardExpiry} /></View>
                  <View style={styles.flexField}><Field label={t('payment.cvv')} value={cardCvv} placeholder="CVV" onChangeText={setCardCvv} keyboardType="number-pad" /></View>
                </View>
                <Field label={t('payment.phoneLabel')} value={phone} placeholder={t('payment.phonePh')} onChangeText={(value) => setPhone(value.replace(/\D/g, '').slice(0, 10))} keyboardType="phone-pad" />
              </>
            )}
            {error ? <AppText style={styles.error}>{error}</AppText> : null}
          </View>
          <TouchableOpacity style={[styles.payButton, { minHeight: touch(50), marginTop: verticalScale(spacing.lg), borderRadius: radius(radii.md) }, busy && styles.disabled]} onPress={() => void submit()} disabled={busy} activeOpacity={0.86}>
            <AppText style={[styles.payButtonText, { fontSize: font(13), lineHeight: lineHeight(18) }]}>{busy ? t('common.loading') : t('certificate.payFeeAmount', { amount: amountFormatted })}</AppText>
            <Ionicons name="arrow-forward" size={scale(18)} color={colors.white} />
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
      <PaymentStatusModal state={statusModal} onDismiss={() => setStatusModal(null)} />
    </ScreenColumn>
  );
}

function Field({
  label,
  value,
  placeholder,
  onChangeText,
  keyboardType,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'phone-pad' | 'number-pad';
}) {
  const { scale, verticalScale, radius, touch, font, lineHeight } = useResponsiveLayout();
  return (
    <View style={{ marginTop: verticalScale(spacing.lg) }}>
      <AppText style={[styles.fieldLabel, { fontSize: font(12), lineHeight: lineHeight(16) }]}>{label}</AppText>
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.textMuted} keyboardType={keyboardType} style={[styles.input, { minHeight: touch(48), marginTop: verticalScale(spacing.xs), paddingHorizontal: scale(spacing.md), borderRadius: radius(radii.md), fontSize: font(13), lineHeight: lineHeight(17) }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, ...shadows.subtle },
  phoneCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, ...shadows.subtle },
  paymentTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  paymentTitle: { flex: 1 },
  feeBox: { alignItems: 'flex-end', backgroundColor: colors.blueTint, borderWidth: 1, borderColor: colors.primary },
  feeLabel: { ...typography.caption, color: colors.primary },
  feeAmount: { ...typography.bodyStrong, color: colors.textPrimary },
  methodHint: { ...typography.bodyStrong, color: colors.textPrimary },
  paymentInstruction: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blueTint },
  paymentInstructionText: { ...typography.bodyStrong, color: colors.textPrimary, textAlign: 'center' },
  sectionTitle: { ...typography.sectionTitle, color: colors.textPrimary },
  methods: { flexDirection: 'row' },
  method: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, position: 'relative' },
  methodSelected: { borderColor: colors.primary, backgroundColor: colors.blueTint },
  methodLabel: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs, textAlign: 'center' },
  methodCheck: { position: 'absolute', top: spacing.sm, right: spacing.sm },
  fieldLabel: { ...typography.bodyStrong, color: colors.textPrimary },
  input: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.textPrimary, fontFamily: 'Poppins-Regular' },
  rowFields: { flexDirection: 'row', gap: spacing.md },
  flexField: { flex: 1 },
  error: { ...typography.caption, color: colors.error, marginTop: spacing.md },
  payButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.primary },
  payButtonText: { ...typography.bodyStrong, color: colors.white },
  disabled: { opacity: 0.62 },
});
