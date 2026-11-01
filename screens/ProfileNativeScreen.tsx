import { AppText } from '../components/AppText';
import React from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';

import { RootStackParamList } from '../navigation/types';
import { BottomNavBar } from '../components/BottomNavBar';
import { ScreenColumn } from '../components/ScreenColumn';
import { AppHeader } from '../components/AppHeader';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { useAppFlow } from '../context/AppFlowContext';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/useI18n';
import { SignOutConfirmationModal } from '../components/SignOutConfirmationModal';
import { colors, radii, spacing, typography } from '../constants/theme';
import { getMyCertificateStatus, hasConfirmedCertificatePayment } from '../services/certificatesApi';
import { toIntlRwandaPhone } from '../utils/phone';

type Props = NativeStackScreenProps<RootStackParamList, 'ProfileNative'>;

function formatSubscriptionDate(raw: string | number | null | undefined, fallback: string): string {
  if (raw == null) return fallback;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return String(raw);
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

function AccountRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  onPress?: () => void;
}) {
  const content = (
    <View style={styles.accountRow}>
      <View style={styles.accountIconBox}>
        <Ionicons name={icon} size={21} color={colors.brandStrong} />
      </View>
      <View style={styles.accountTextWrap}>
        <AppText style={styles.accountLabel}>{label}</AppText>
        <AppText style={styles.accountValue}>{value}</AppText>
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={19} color={colors.inkSoft} /> : null}
    </View>
  );

  return onPress ? (
    <TouchableOpacity activeOpacity={0.78} onPress={onPress}>
      {content}
    </TouchableOpacity>
  ) : content;
}

export function ProfileNativeScreen({ navigation }: Props) {
  const { hasSubscription, contentLanguage } = useAppFlow();
  const { tabScrollBottomPad, scale, verticalScale, radius } = useResponsiveLayout();
  const { t } = useI18n();
  const { name, phone, logout, updateProfile, accessToken, subscriptionSummary } = useAuth();
  const [showSignOutConfirm, setShowSignOutConfirm] = React.useState(false);
  const [showEditProfile, setShowEditProfile] = React.useState(false);
  const [editName, setEditName] = React.useState(name ?? '');
  const [editPhone, setEditPhone] = React.useState(phone ?? '');
  const [editError, setEditError] = React.useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = React.useState(false);
  const certificateQuery = useQuery({
    queryKey: ['certificateStatus', accessToken],
    enabled: Boolean(accessToken),
    retry: false,
    staleTime: 0,
    queryFn: () => getMyCertificateStatus(accessToken as string),
  });
  React.useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (accessToken) void certificateQuery.refetch();
    });
    return unsubscribe;
  }, [navigation, accessToken, certificateQuery.refetch]);

  const certificatePaid = hasConfirmedCertificatePayment(certificateQuery.data);
  const langLabel = t(`profile.lang.${contentLanguage}`);
  const subscriptionActive = hasSubscription || subscriptionSummary?.active === true;
  const subscriptionLanguageLabel = subscriptionSummary?.language ? t(`profile.lang.${subscriptionSummary.language}`) : t('common.na');
  const planName =
    subscriptionSummary?.planName ??
    (subscriptionActive ? t('profile.planActiveFallback') : t('profile.noPlan'));
  const expiryLabel = subscriptionActive
    ? formatSubscriptionDate(subscriptionSummary?.expiresAt, t('common.na'))
    : t('profile.noPlan');
  const initials = (name ?? 'N')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  const openEditProfile = () => {
    setEditName(name ?? '');
    setEditPhone(phone ?? '');
    setEditError(null);
    setShowEditProfile(true);
  };

  const saveProfile = async () => {
    const cleanName = editName.trim();
    const phoneIntl = toIntlRwandaPhone(editPhone);
    if (cleanName.length < 2) {
      setEditError(t('profile.nameRequired'));
      return;
    }
    if (!phoneIntl) {
      setEditError(t('profile.phoneInvalid'));
      return;
    }
    setIsSavingProfile(true);
    setEditError(null);
    try {
      await updateProfile(cleanName, phoneIntl);
      setShowEditProfile(false);
    } catch {
      setEditError(t('profile.profileUpdateFailed'));
    } finally {
      setIsSavingProfile(false);
    }
  };

  return (
    <ScreenColumn>
      <AppHeader title={t('profile.title')} navigation={navigation} onBack={() => navigation.goBack()} />

      <View style={styles.body}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: tabScrollBottomPad }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.identityCard}>
            <View style={styles.avatar}>
              <AppText style={styles.avatarText}>{initials || 'N'}</AppText>
            </View>
            <View style={styles.identityCopy}>
              <AppText style={styles.identityName}>{name ?? t('profile.myAccount')}</AppText>
              <AppText style={styles.identityPhone}>{phone ?? t('common.na')}</AppText>
            </View>
          </View>

          <View style={styles.profileSectionHeading}>
            <AppText style={[styles.profileSectionTitle, { fontSize: scale(17), lineHeight: verticalScale(23) }]}>
              {t('profile.myAccount')}
            </AppText>
            <TouchableOpacity
              style={styles.editProfileIconButton}
              onPress={openEditProfile}
              activeOpacity={0.78}
              accessibilityRole="button"
              accessibilityLabel={t('profile.edit')}
            >
              <Ionicons name="create-outline" size={20} color={colors.brand} />
            </TouchableOpacity>
          </View>
          <View style={styles.accountCard}>
            <AccountRow icon="person-outline" label={t('profile.fullName')} value={name ?? t('common.na')} />
            <View style={styles.divider} />
            <AccountRow
              icon="globe-outline"
              label={t('profile.language')}
              value={langLabel}
              onPress={() => navigation.navigate('LanguageSettings')}
            />
            <View style={styles.divider} />
            <AccountRow icon="call-outline" label={t('profile.phone')} value={phone ?? t('common.na')} />
          </View>

          {certificatePaid ? (
            <TouchableOpacity
              style={styles.certificateButton}
              onPress={() => navigation.navigate('CertificateNative')}
              activeOpacity={0.84}
              accessibilityRole="button"
            >
              <View style={styles.certificateButtonIcon}>
                <Ionicons name="ribbon-outline" size={21} color={colors.brandStrong} />
              </View>
              <AppText style={styles.certificateButtonText}>{t('profile.viewCertificate')}</AppText>
              <Ionicons name="chevron-forward" size={20} color={colors.inkSoft} />
            </TouchableOpacity>
          ) : null}
          {certificateQuery.isError ? (
            <TouchableOpacity
              style={styles.certificateUnavailable}
              onPress={() => void certificateQuery.refetch()}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              <AppText style={styles.certificateUnavailableText}>{t('profile.certificateStatusUnavailable')}</AppText>
              <Ionicons name="refresh" size={18} color={colors.brand} />
            </TouchableOpacity>
          ) : null}

          <View style={styles.profileSectionHeading}>
            <AppText style={[styles.profileSectionTitle, { fontSize: scale(17), lineHeight: verticalScale(23) }]}>
              {t('profile.paymentInfo')}
            </AppText>
            <TouchableOpacity
              style={styles.editProfileIconButton}
              onPress={() => navigation.navigate('SubscriptionNative')}
              activeOpacity={0.78}
              accessibilityRole="button"
              accessibilityLabel={t('profile.edit')}
            >
              <Ionicons name="create-outline" size={20} color={colors.brand} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.subscriptionCard}
            activeOpacity={0.86}
            onPress={() => navigation.navigate('SubscriptionNative')}
          >
            <View style={styles.subscriptionTop}>
              <View style={styles.subscriptionIcon}>
                <Ionicons name={subscriptionActive ? 'shield-checkmark' : 'shield-outline'} size={22} color={colors.brandStrong} />
              </View>
              <Ionicons name="arrow-forward" size={21} color={colors.inkSoft} />
            </View>
            <AppText style={styles.subscriptionEyebrow}>{t('profile.subscriptionPlan')}</AppText>
            <AppText style={styles.subscriptionTitle}>
              {planName}
            </AppText>
            <View style={styles.subscriptionDetails}>
              <View style={styles.subscriptionDetailRow}>
                <AppText style={styles.subscriptionMetaLabel}>{t('profile.endDate')}</AppText>
                <AppText style={styles.subscriptionDetailValue}>{expiryLabel}</AppText>
              </View>
              <View style={styles.subscriptionDetailRow}>
                <AppText style={styles.subscriptionMetaLabel}>{t('profile.subscriptionLanguage')}</AppText>
                <AppText style={styles.subscriptionDetailValue}>{subscriptionLanguageLabel}</AppText>
              </View>
            </View>
            <View style={styles.subscriptionMeta}>
              <AppText style={styles.subscriptionMetaLabel}>{t('profile.paymentStatus')}</AppText>
              <View style={styles.statusRow}>
                <Ionicons
                  name={subscriptionActive ? 'checkmark-circle' : 'information-circle'}
                  size={17}
                  color={subscriptionActive ? colors.success : colors.brand}
                />
                <AppText style={styles.statusText}>
                  {subscriptionActive ? t('profile.paid') : t('profile.noPlan')}
                </AppText>
              </View>
            </View>
          </TouchableOpacity>

          <View style={{ marginTop: spacing.xl, marginBottom: spacing.sm, alignItems: 'center' }}>
            <AppText style={{ fontSize: 13, color: colors.inkMuted }}>
              <AppText style={{ color: colors.brand }} onPress={() => Linking.openURL('https://ibyapa.com/terms-of-service')}>Terms</AppText>
              {'  •  '}
              <AppText style={{ color: colors.brand }} onPress={() => Linking.openURL('https://www.ibyapa.com/privacy')}>Privacy Policy</AppText>
            </AppText>
          </View>

          <TouchableOpacity style={styles.signOutBtn} onPress={() => setShowSignOutConfirm(true)} activeOpacity={0.82}>
            <MaterialCommunityIcons name="logout-variant" size={19} color={colors.ink} />
            <AppText style={styles.signOutText}>{t('profile.signOut')}</AppText>
          </TouchableOpacity>

        </ScrollView>
      </View>

      <BottomNavBar navigation={navigation} />
      <SignOutConfirmationModal
        visible={showSignOutConfirm}
        onCancel={() => setShowSignOutConfirm(false)}
        onConfirm={async () => {
          setShowSignOutConfirm(false);
          await logout();
        }}
      />
      <Modal
        visible={showEditProfile}
        transparent
        animationType="fade"
        onRequestClose={() => !isSavingProfile && setShowEditProfile(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.editModal, { borderRadius: radius(radii.xl), padding: scale(spacing.xl) }]}>
            <View style={styles.editModalHeader}>
              <AppText style={[styles.editModalTitle, { fontSize: scale(20) }]}>{t('profile.edit')}</AppText>
              <TouchableOpacity
                onPress={() => setShowEditProfile(false)}
                disabled={isSavingProfile}
                style={styles.modalClose}
                accessibilityLabel={t('common.cancel')}
              >
                <Ionicons name="close" size={22} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>
            <AppText style={styles.inputLabel}>{t('profile.fullName')}</AppText>
            <TextInput
              value={editName}
              onChangeText={setEditName}
              autoCapitalize="words"
              returnKeyType="next"
              style={[styles.editInput, { minHeight: Math.max(48, verticalScale(48)), borderRadius: radius(radii.md) }]}
            />
            <AppText style={styles.inputLabel}>{t('profile.phone')}</AppText>
            <TextInput
              value={editPhone}
              onChangeText={setEditPhone}
              keyboardType="phone-pad"
              returnKeyType="done"
              style={[styles.editInput, { minHeight: Math.max(48, verticalScale(48)), borderRadius: radius(radii.md) }]}
            />
            {editError ? <AppText style={styles.editError}>{editError}</AppText> : null}
            <View style={styles.editActions}>
              <TouchableOpacity
                style={styles.cancelEditButton}
                onPress={() => setShowEditProfile(false)}
                disabled={isSavingProfile}
              >
                <AppText style={styles.cancelEditText}>{t('common.cancel')}</AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveEditButton, isSavingProfile && styles.disabledButton]}
                onPress={() => void saveProfile()}
                disabled={isSavingProfile}
              >
                <AppText style={styles.saveEditText}>{isSavingProfile ? t('common.loading') : t('profile.save')}</AppText>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenColumn>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  identityCard: {
    minHeight: 108,
    padding: spacing.lg,
    borderRadius: radii.xl,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F05252',
  },
  avatarText: {
    ...typography.title,
    color: colors.white,
  },
  identityCopy: {
    flex: 1,
    marginLeft: spacing.md,
  },
  identityName: {
    ...typography.title,
    color: colors.ink,
  },
  identityPhone: {
    ...typography.caption,
    marginTop: spacing.xs,
    color: colors.inkMuted,
  },
  accountCard: {
    paddingHorizontal: spacing.lg,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  profileSectionHeading: {
    minHeight: 48,
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  profileSectionTitle: {
    ...typography.sectionTitle,
    flex: 1,
    color: colors.ink,
  },
  editProfileIconButton: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSoft,
  },
  accountRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
  },
  accountIconBox: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSoft,
  },
  accountTextWrap: {
    flex: 1,
    marginLeft: spacing.md,
  },
  accountLabel: {
    ...typography.caption,
    color: colors.inkSoft,
  },
  accountValue: {
    ...typography.bodyStrong,
    marginTop: 2,
    color: colors.ink,
  },
  divider: {
    height: 1,
    marginLeft: 56,
    backgroundColor: colors.line,
  },
  subscriptionCard: {
    position: 'relative',
    overflow: 'hidden',
    minHeight: 170,
    padding: spacing.lg,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  subscriptionTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subscriptionIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSoft,
  },
  subscriptionEyebrow: {
    ...typography.eyebrow,
    marginTop: spacing.lg,
    color: colors.inkSoft,
    textTransform: 'uppercase',
  },
  subscriptionTitle: {
    ...typography.heading,
    marginTop: spacing.xs,
    color: colors.ink,
  },
  subscriptionMeta: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subscriptionDetails: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  subscriptionDetailRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  subscriptionDetailValue: {
    ...typography.bodyStrong,
    flexShrink: 1,
    color: colors.ink,
    textAlign: 'right',
  },
  subscriptionMetaLabel: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    ...typography.bodyStrong,
    marginLeft: spacing.xs,
    color: colors.ink,
  },
  certificateButton: {
    minHeight: 60,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.xl,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  certificateButtonIcon: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSoft,
  },
  certificateButtonText: {
    ...typography.bodyStrong,
    flex: 1,
    marginLeft: spacing.md,
    color: colors.ink,
  },
  certificateUnavailable: {
    minHeight: 44,
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  certificateUnavailableText: {
    ...typography.caption,
    flex: 1,
    marginRight: spacing.sm,
    color: colors.inkMuted,
  },
  signOutBtn: {
    height: 54,
    marginTop: spacing.xxl,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  signOutText: {
    ...typography.bodyStrong,
    marginLeft: spacing.sm,
    color: colors.ink,
  },
  modalBackdrop: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
  },
  editModal: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  editModalHeader: {
    minHeight: 40,
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editModalTitle: {
    ...typography.sectionTitle,
    flex: 1,
    color: colors.ink,
  },
  modalClose: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputLabel: {
    ...typography.caption,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    color: colors.inkSoft,
  },
  editInput: {
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.canvas,
    color: colors.ink,
    ...typography.body,
  },
  editError: {
    ...typography.caption,
    marginTop: spacing.sm,
    color: colors.danger,
  },
  editActions: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  cancelEditButton: {
    minWidth: 92,
    minHeight: 46,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  cancelEditText: {
    ...typography.bodyStrong,
    color: colors.ink,
  },
  saveEditButton: {
    minWidth: 112,
    minHeight: 46,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
  },
  saveEditText: {
    ...typography.bodyStrong,
    color: colors.white,
  },
  disabledButton: {
    opacity: 0.65,
  },
});
