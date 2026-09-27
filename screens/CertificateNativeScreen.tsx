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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { AppHeader } from '../components/AppHeader';
import { AppText } from '../components/AppText';
import { InlineErrorState, SkeletonBlock } from '../components/RequestStates';
import { ScreenColumn } from '../components/ScreenColumn';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/useI18n';
import type { RootStackParamList } from '../navigation/types';
import {
  createCertificateRequest,
  getMyCertificateStatus,
  reapplyCertificateRequest,
  type CertificateRequirement,
  type CertificateStatus,
} from '../services/certificatesApi';
import { getMessageFromUnknownError } from '../services/api/client';
import { colors, radii, shadows, spacing, typography } from '../constants/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

type Props = NativeStackScreenProps<RootStackParamList, 'CertificateNative'>;

type FieldName = 'legalName' | 'nationalId' | 'contactPhone';
type FormValues = Record<FieldName, string>;

function requirementValue(requirement?: CertificateRequirement) {
  if (!requirement) return '0';
  return `${requirement.current ?? 0}`;
}

function requirementLimit(requirement?: CertificateRequirement, suffix = '') {
  if (!requirement) return '0';
  return `${requirement.required ?? 0}${suffix}`;
}

function progressPercent(requirement?: CertificateRequirement) {
  const current = Number(requirement?.current ?? 0);
  const required = Number(requirement?.required ?? 0);
  if (!required) return 0;
  return Math.min(100, Math.max(0, (current / required) * 100));
}

function RequirementRow({
  label,
  detail,
  requirement,
  suffix = '',
}: {
  label: string;
  detail: string;
  requirement?: CertificateRequirement;
  suffix?: string;
}) {
  const { scale, verticalScale, radius, font, icon } = useResponsiveLayout();
  const met = requirement?.met === true;
  const width = `${progressPercent(requirement)}%` as `${number}%`;

  return (
    <View style={[styles.requirementRow, { padding: scale(spacing.md), borderRadius: radius(radii.md) }]}>
      <View style={styles.requirementHeader}>
        <View style={styles.requirementCopy}>
          <AppText style={[styles.requirementLabel, { fontSize: font(13), lineHeight: font(18) }]}>{label}</AppText>
          <AppText style={[styles.requirementDetail, { marginTop: verticalScale(2), fontSize: font(11), lineHeight: font(15) }]}>
            {detail}
          </AppText>
        </View>
        <View style={[styles.requirementMark, { width: icon(20), height: icon(20), borderRadius: radius(radii.pill) }, met ? styles.requirementMarkMet : styles.requirementMarkOpen]}>
          <Ionicons name={met ? 'checkmark' : 'ellipse-outline'} size={icon(13)} color={met ? colors.white : colors.textMuted} />
        </View>
      </View>
      <View style={[styles.progressTrack, { height: verticalScale(6), borderRadius: radius(radii.pill), marginTop: verticalScale(spacing.sm) }]}>
        <View style={[styles.progressFill, { width, borderRadius: radius(radii.pill) }]} />
      </View>
      {suffix ? <AppText style={styles.requirementSuffix}>{suffix}</AppText> : null}
    </View>
  );
}

function CertificateSkeleton() {
  const { scale, verticalScale, radius } = useResponsiveLayout();
  return (
    <View style={[styles.content, { padding: scale(spacing.lg) }]}>
      <SkeletonBlock style={{ height: verticalScale(132), borderRadius: radius(radii.xl) }} />
      <SkeletonBlock style={{ height: verticalScale(260), marginTop: verticalScale(spacing.lg), borderRadius: radius(radii.xl) }} />
      <SkeletonBlock style={{ height: verticalScale(320), marginTop: verticalScale(spacing.lg), borderRadius: radius(radii.xl) }} />
    </View>
  );
}

export function CertificateNativeScreen({ navigation }: Props) {
  const { t } = useI18n();
  const { accessToken, name } = useAuth();
  const queryClient = useQueryClient();
  const { scale, verticalScale, radius, touch, font, lineHeight } = useResponsiveLayout();
  const [form, setForm] = useState<FormValues>({ legalName: name ?? '', nationalId: '', contactPhone: '' });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (name && !form.legalName) setForm((current) => ({ ...current, legalName: name }));
  }, [form.legalName, name]);

  const statusQuery = useQuery({
    queryKey: ['certificateStatus', accessToken],
    enabled: Boolean(accessToken),
    retry: false,
    staleTime: 60 * 1000,
    queryFn: () => getMyCertificateStatus(accessToken as string),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!accessToken) throw new Error(t('certificate.sessionRequired'));
      return createCertificateRequest(accessToken, {
        legalName: form.legalName.trim(),
        nationalId: form.nationalId.trim(),
        contactPhone: form.contactPhone.trim(),
      });
    },
    onSuccess: async () => {
      setSubmitError(null);
      await queryClient.invalidateQueries({ queryKey: ['certificateStatus', accessToken] });
    },
    onError: (error) => setSubmitError(getMessageFromUnknownError(error)),
  });

  const reapplyMutation = useMutation({
    mutationFn: async (requestId: string) => {
      if (!accessToken) throw new Error(t('certificate.sessionRequired'));
      return reapplyCertificateRequest(accessToken, requestId);
    },
    onSuccess: async () => {
      setSubmitError(null);
      await queryClient.invalidateQueries({ queryKey: ['certificateStatus', accessToken] });
    },
    onError: (error) => setSubmitError(getMessageFromUnknownError(error)),
  });

  const certificate = statusQuery.data;
  const eligibility = certificate?.eligibility;
  const requirements = eligibility?.requirements;
  const request = certificate?.request;
  const issued = certificate?.certificate?.status === 'issued';
  const requestStatus = request?.status?.toLowerCase();
  const isPendingPayment = requestStatus === 'pending_payment' || request?.paymentStatus?.toLowerCase() === 'pending';
  const isUnderReview = requestStatus === 'under_review' || requestStatus === 'paid';
  const isRejected = requestStatus === 'rejected';
  const metCount = [requirements?.minimumExams, requirements?.minimumAverage, requirements?.qualifyingPlan]
    .filter((item) => item?.met === true).length;
  const isEligible = eligibility?.eligible === true;

  const planLabel = useMemo(() => {
    const plan = requirements?.qualifyingPlan?.planType?.toLowerCase();
    if (plan === 'monthly') return t('certificate.planMonthly');
    if (plan === 'weekly' || plan === 'two_weeks') return t('certificate.planTwoWeeks');
    return requirements?.qualifyingPlan?.planType || t('certificate.planUnknown');
  }, [requirements?.qualifyingPlan?.planType, t]);

  const updateField = (field: FieldName, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setSubmitError(null);
  };

  const validateForm = () => {
    const nextErrors: Partial<Record<FieldName, string>> = {};
    if (form.legalName.trim().length < 3) nextErrors.legalName = t('certificate.validationName');
    if (!/^\d{16}$/.test(form.nationalId.trim())) nextErrors.nationalId = t('certificate.validationNationalId');
    if (!/^07\d{8}$/.test(form.contactPhone.trim())) nextErrors.contactPhone = t('certificate.validationPhone');
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const openCertificateWebsite = () => {
    navigation.navigate('CertificateWebViewer', {
      title: t('certificate.title'),
      url: 'https://www.ibyapa.com/certificate',
    });
  };

  const submit = () => {
    if (validateForm()) submitMutation.mutate();
  };

  if (statusQuery.isPending) {
    return (
      <ScreenColumn>
        <AppHeader title={t('certificate.title')} onBack={() => navigation.goBack()} navigation={navigation} />
        <CertificateSkeleton />
      </ScreenColumn>
    );
  }

  if (statusQuery.isError || !certificate) {
    return (
      <ScreenColumn>
        <AppHeader title={t('certificate.title')} onBack={() => navigation.goBack()} navigation={navigation} />
        <View style={[styles.content, { padding: scale(spacing.lg) }]}>
          <InlineErrorState
            title={t('certificate.loadErrorTitle')}
            message={getMessageFromUnknownError(statusQuery.error)}
            onRetry={() => void statusQuery.refetch()}
          />
        </View>
      </ScreenColumn>
    );
  }

  return (
    <ScreenColumn>
      <AppHeader title={t('certificate.title')} onBack={() => navigation.goBack()} navigation={navigation} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.content, { padding: scale(spacing.lg), paddingBottom: verticalScale(40) }]}
        >
          <View style={[styles.hero, { padding: scale(spacing.lg), borderRadius: radius(radii.xl) }]}>
            <View style={styles.heroTop}>
              <View style={[styles.heroIcon, { width: touch(44), height: touch(44), borderRadius: radius(radii.md) }]}>
                <Ionicons name="ribbon" size={scale(22)} color={colors.white} />
              </View>
              <View style={styles.heroCopy}>
                <AppText style={[styles.heroTitle, { fontSize: font(20), lineHeight: lineHeight(24) }]}>{t('certificate.heroTitle')}</AppText>
                <AppText style={[styles.heroMessage, { marginTop: verticalScale(spacing.xs), fontSize: font(12), lineHeight: lineHeight(17) }]} lines={null}>
                  {t('certificate.heroMessage')}
                </AppText>
              </View>
            </View>
            <AppText style={[styles.heroProgress, { marginTop: verticalScale(spacing.lg), fontSize: font(12), lineHeight: lineHeight(16) }]}>
              {metCount}/3 · {isEligible ? t('certificate.eligible') : t('certificate.completeRequirements')}
            </AppText>
          </View>

          {!issued ? (
            <View style={[styles.card, { marginTop: verticalScale(spacing.lg), padding: scale(spacing.lg), borderRadius: radius(radii.xl) }]}>
              <View style={styles.cardHeader}>
                <AppText style={[styles.sectionTitle, { fontSize: font(16), lineHeight: lineHeight(21) }]}>{t('certificate.progressTitle')}</AppText>
                <View style={[styles.feeBadge, { paddingHorizontal: scale(spacing.sm), minHeight: touch(30), borderRadius: radius(radii.pill) }]}>
                  <AppText style={[styles.feeText, { fontSize: font(11), lineHeight: lineHeight(14) }]}>
                    {t('certificate.fee', { amount: String(eligibility?.fee ?? 1000) })}
                  </AppText>
                </View>
              </View>
              <View style={{ gap: verticalScale(spacing.sm), marginTop: verticalScale(spacing.md) }}>
                <RequirementRow
                  label={t('certificate.completedExams')}
                  detail={`${requirementValue(requirements?.minimumExams)} / ${requirementLimit(requirements?.minimumExams)}`}
                  requirement={requirements?.minimumExams}
                />
                <RequirementRow
                  label={t('certificate.averageScore')}
                  detail={`${requirementValue(requirements?.minimumAverage)}% / ${requirementLimit(requirements?.minimumAverage, '%')}`}
                  requirement={requirements?.minimumAverage}
                />
                <RequirementRow
                  label={t('certificate.qualifyingPlan')}
                  detail={planLabel}
                  requirement={requirements?.qualifyingPlan}
                />
              </View>
            </View>
          ) : null}

          {issued ? (
            <View style={{ marginTop: verticalScale(spacing.lg), borderRadius: radius(radii.xl), overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: '#A7F3D0' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', padding: scale(spacing.lg), borderBottomWidth: 1, borderBottomColor: '#A7F3D0' }}>
                <Ionicons name="checkmark-circle" size={scale(20)} color="#065F46" />
                <AppText style={{ marginLeft: scale(spacing.sm), fontFamily: 'Poppins-Bold', fontSize: font(15), color: '#065F46' }}>
                  {t('certificate.issuedTitle')}
                </AppText>
              </View>
              <View style={{ padding: scale(spacing.lg) }}>
                {certificate.certificate?.certificateNumber ? (
                  <AppText style={{ fontFamily: 'Poppins-Bold', fontSize: font(15), color: '#1E3A8A' }}>
                    {certificate.certificate.certificateNumber}
                  </AppText>
                ) : null}
                <AppText style={{ fontFamily: 'Poppins-Regular', fontSize: font(14), color: '#4B5563', marginTop: verticalScale(4) }}>
                  {form.legalName || name}
                </AppText>
                {certificate.certificate?.hasDocument ? (
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, marginTop: verticalScale(spacing.xl), paddingVertical: verticalScale(14), borderRadius: radius(radii.md) }}
                    onPress={openCertificateWebsite}
                    activeOpacity={0.86}
                  >
                    <Ionicons name="download" size={scale(18)} color="#FFFFFF" />
                    <AppText style={{ fontFamily: 'Poppins-Bold', fontSize: font(14), color: '#FFFFFF', marginLeft: scale(spacing.sm) }}>
                      {t('certificate.openCertificate')}
                    </AppText>
                  </TouchableOpacity>
                ) : (
                  <View style={{ marginTop: verticalScale(spacing.xl), paddingVertical: verticalScale(14), alignItems: 'center' }}>
                    <AppText style={{ fontFamily: 'Poppins-Regular', fontSize: font(12), color: colors.textMuted }}>
                      {t('certificate.issuedMessage')}
                    </AppText>
                  </View>
                )}
              </View>
            </View>
          ) : isPendingPayment ? (
            <View style={[styles.paymentCard, { marginTop: verticalScale(spacing.lg), borderRadius: radius(radii.xl) }]}>
              <View style={[styles.paymentHeader, { padding: scale(spacing.lg) }]}>
                <AppText style={[styles.sectionTitle, { fontSize: font(16), lineHeight: lineHeight(21) }]}>{t('certificate.paymentStageTitle')}</AppText>
                <View style={[styles.paymentBadge, { paddingHorizontal: scale(spacing.sm), minHeight: touch(30), borderRadius: radius(radii.pill) }]}>
                  <AppText style={[styles.paymentBadgeText, { fontSize: font(10), lineHeight: lineHeight(14) }]}>{t('certificate.paymentBadge')}</AppText>
                </View>
              </View>
              <View style={[styles.paymentBody, { padding: scale(spacing.lg), paddingTop: verticalScale(spacing.md) }]}>
                <AppText style={styles.statusMessage}>{t('certificate.paymentMessage')}</AppText>
                <PrimaryButton
                  label={t('certificate.payFeeAmount', { amount: String(eligibility?.fee ?? 1000) })}
                  onPress={() => navigation.navigate('CertificatePaymentNative', {
                    requestId: request?.id || request?._id,
                    amountRwf: eligibility?.fee ?? 1000,
                  })}
                />
              </View>
            </View>
          ) : isUnderReview ? (
            <View style={[styles.statusCard, { marginTop: verticalScale(spacing.lg), padding: scale(spacing.lg), borderRadius: radius(radii.xl) }]}>
              <StatusIcon icon="time-outline" />
              <AppText style={[styles.statusTitle, { marginTop: verticalScale(spacing.sm), fontSize: font(18), lineHeight: lineHeight(23) }]}>{t('certificate.reviewTitle')}</AppText>
              <AppText style={styles.statusMessage}>{t('certificate.reviewMessage')}</AppText>
            </View>
          ) : isRejected ? (
            <View style={[styles.statusCard, styles.statusCardRejected, { marginTop: verticalScale(spacing.lg), padding: scale(spacing.lg), borderRadius: radius(radii.xl) }]}>
              <StatusIcon icon="alert-outline" />
              <AppText style={[styles.statusTitle, { marginTop: verticalScale(spacing.sm), fontSize: font(18), lineHeight: lineHeight(23) }]}>{t('certificate.rejectedTitle')}</AppText>
              {request?.rejectionReason ? <AppText style={styles.statusMessage}>{request.rejectionReason}</AppText> : null}
              {(request?.id || request?._id) ? <PrimaryButton label={t('certificate.reapply')} onPress={() => reapplyMutation.mutate((request.id || request._id) as string)} disabled={reapplyMutation.isPending} /> : null}
            </View>
          ) : isEligible ? (
            <View style={[styles.card, { marginTop: verticalScale(spacing.lg), padding: scale(spacing.lg), borderRadius: radius(radii.xl) }]}>
              <View style={styles.formHeadingRow}>
                <View style={[styles.heroIcon, { width: touch(40), height: touch(40), borderRadius: radius(radii.md) }]}>
                  <Ionicons name="ribbon-outline" size={scale(21)} color={colors.white} />
                </View>
                <View style={styles.heroCopy}>
                  <AppText style={[styles.sectionTitle, { fontSize: font(16), lineHeight: lineHeight(21) }]}>{t('certificate.requestTitle')}</AppText>
                  <AppText style={styles.formIntro}>{t('certificate.requestIntro')}</AppText>
                </View>
              </View>
              <View style={[styles.eligibleBadge, { marginTop: verticalScale(spacing.md), minHeight: touch(34), borderRadius: radius(radii.sm) }]}>
                <Ionicons name="checkmark-circle" size={scale(16)} color={colors.primary} />
                <AppText style={styles.eligibleText}>{t('certificate.eligible')}</AppText>
              </View>
              <FormField label={t('certificate.legalName')} placeholder={t('certificate.legalNamePlaceholder')} value={form.legalName} error={fieldErrors.legalName} onChangeText={(value) => updateField('legalName', value)} />
              <FormField label={t('certificate.nationalId')} placeholder={t('certificate.nationalIdPlaceholder')} value={form.nationalId} error={fieldErrors.nationalId} onChangeText={(value) => updateField('nationalId', value.replace(/\D/g, '').slice(0, 16))} keyboardType="number-pad" />
              <FormField label={t('certificate.contactPhone')} placeholder={t('certificate.contactPhonePlaceholder')} value={form.contactPhone} error={fieldErrors.contactPhone} onChangeText={(value) => updateField('contactPhone', value.replace(/\D/g, '').slice(0, 10))} keyboardType="phone-pad" />
              {submitError ? <AppText style={styles.formError}>{submitError}</AppText> : null}
              <PrimaryButton label={submitMutation.isPending ? t('common.loading') : t('certificate.submit')} onPress={submit} disabled={submitMutation.isPending} />
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenColumn>
  );
}

function StatusIcon({ icon }: { icon: React.ComponentProps<typeof Ionicons>['name'] }) {
  const { scale, touch, radius } = useResponsiveLayout();
  return (
    <View style={[styles.statusIcon, { width: touch(48), height: touch(48), borderRadius: radius(radii.pill) }]}>
      <Ionicons name={icon} size={scale(25)} color={colors.primary} />
    </View>
  );
}

function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const { scale, verticalScale, radius, touch, font, lineHeight } = useResponsiveLayout();
  return (
    <TouchableOpacity
      style={[styles.primaryButton, { minHeight: touch(48), marginTop: verticalScale(spacing.lg), paddingHorizontal: scale(spacing.lg), borderRadius: radius(radii.md) }, disabled && styles.primaryButtonDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.86}
    >
      <AppText style={[styles.primaryButtonText, { fontSize: font(13), lineHeight: lineHeight(18) }]}>{label}</AppText>
      <Ionicons name="arrow-forward" size={scale(18)} color={colors.white} />
    </TouchableOpacity>
  );
}

function FormField({
  label,
  placeholder,
  value,
  error,
  onChangeText,
  keyboardType,
}: {
  label: string;
  placeholder: string;
  value: string;
  error?: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'number-pad' | 'phone-pad';
}) {
  const { scale, verticalScale, radius, touch, font, lineHeight } = useResponsiveLayout();
  return (
    <View style={{ marginTop: verticalScale(spacing.md) }}>
      <AppText style={[styles.fieldLabel, { fontSize: font(12), lineHeight: lineHeight(16) }]}>{label} <AppText style={styles.required}>*</AppText></AppText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType ? 'none' : 'words'}
        style={[styles.input, { minHeight: touch(48), marginTop: verticalScale(spacing.xs), paddingHorizontal: scale(spacing.md), borderRadius: radius(radii.md), fontSize: font(13), lineHeight: lineHeight(17) }, error && styles.inputError]}
      />
      {error ? <AppText style={styles.fieldError}>{error}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1 },
  hero: { backgroundColor: colors.darkEmphasis, ...shadows.card },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start' },
  heroIcon: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  heroCopy: { flex: 1, marginLeft: spacing.md },
  heroTitle: { ...typography.heading, color: colors.white },
  heroMessage: { color: 'rgba(255,255,255,0.82)' },
  heroProgress: { ...typography.bodyStrong, color: colors.white },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, ...shadows.subtle },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  sectionTitle: { ...typography.sectionTitle, color: colors.textPrimary },
  feeBadge: { justifyContent: 'center', backgroundColor: colors.blueTint },
  feeText: { ...typography.caption, color: colors.primary },
  requirementRow: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  requirementHeader: { flexDirection: 'row', alignItems: 'center' },
  requirementCopy: { flex: 1 },
  requirementLabel: { ...typography.bodyStrong, color: colors.textPrimary },
  requirementDetail: { ...typography.caption, color: colors.textMuted },
  requirementMark: { alignItems: 'center', justifyContent: 'center' },
  requirementMarkMet: { backgroundColor: colors.primary },
  requirementMarkOpen: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt },
  progressTrack: { overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  progressFill: { height: '100%', minWidth: 4, backgroundColor: colors.primary },
  requirementSuffix: { position: 'absolute', right: spacing.md, bottom: spacing.sm, color: colors.textMuted, fontSize: 10 },
  statusCard: { alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, ...shadows.subtle },
  statusCardSuccess: { backgroundColor: colors.blueTint, borderColor: colors.primary },
  statusCardRejected: { backgroundColor: colors.errorSoft, borderColor: colors.error },
  statusIcon: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blueTint },
  statusTitle: { ...typography.sectionTitle, color: colors.textPrimary, textAlign: 'center' },
  statusDetail: { ...typography.bodyStrong, color: colors.primary, marginTop: spacing.xs },
  statusMessage: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm },
  paymentCard: { overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, ...shadows.subtle },
  paymentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  paymentBadge: { justifyContent: 'center', backgroundColor: colors.warningSoft },
  paymentBadgeText: { ...typography.caption, color: colors.warning },
  paymentBody: { alignItems: 'stretch' },
  formHeadingRow: { flexDirection: 'row', alignItems: 'flex-start' },
  formIntro: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  eligibleBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, backgroundColor: colors.blueTint },
  eligibleText: { ...typography.caption, color: colors.primary, marginLeft: spacing.xs },
  fieldLabel: { ...typography.bodyStrong, color: colors.textPrimary },
  required: { color: colors.error },
  input: { borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.surface, color: colors.textPrimary, fontFamily: 'Poppins-Regular' },
  inputError: { borderColor: colors.error },
  fieldError: { ...typography.caption, color: colors.error, marginTop: spacing.xs },
  formError: { ...typography.caption, color: colors.error, marginTop: spacing.md },
  primaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.primary },
  primaryButtonDisabled: { opacity: 0.62 },
  primaryButtonText: { ...typography.bodyStrong, color: colors.white },
});
