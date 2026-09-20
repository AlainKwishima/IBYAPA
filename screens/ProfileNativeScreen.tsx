import { AppText } from '../components/AppText';
import React from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Alert, Linking, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { RootStackParamList } from '../navigation/types';
import { BottomNavBar } from '../components/BottomNavBar';
import { ScreenColumn } from '../components/ScreenColumn';
import { AppHeader } from '../components/AppHeader';
import { SectionHeading } from '../components/SectionHeading';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { useAppFlow } from '../context/AppFlowContext';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/useI18n';
import { SignOutConfirmationModal } from '../components/SignOutConfirmationModal';
import { colors, radii, spacing, typography } from '../constants/theme';

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
  const { tabScrollBottomPad } = useResponsiveLayout();
  const { t } = useI18n();
  const { name, phone, logout, deleteAccount, subscriptionSummary } = useAuth();
  const [showSignOutConfirm, setShowSignOutConfirm] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const langLabel = t(`profile.lang.${contentLanguage}`);
  const subscriptionActive = hasSubscription || subscriptionSummary?.active === true;
  const subscriptionLanguageLabel = subscriptionSummary?.language ? t(`profile.lang.${subscriptionSummary.language}`) : t('common.na');
  const planName =
    subscriptionSummary?.planName ??
    (subscriptionActive ? t('profile.planActiveFallback') : t('profile.noPlan'));
  const expiryLabel = subscriptionActive
    ? formatSubscriptionDate(subscriptionSummary?.expiresAt, t('profile.expiryUnavailable'))
    : t('profile.noPlan');
  const initials = (name ?? 'N')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  const handleDeleteAccount = () => {
    Alert.alert(
      t('profile.deleteAccountTitle'),
      t('profile.deleteAccountConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('profile.deleteAccountTitle'),
          style: 'destructive',
          onPress: async () => {
            if (isDeleting) return;
            setIsDeleting(true);
            try {
              await deleteAccount();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete account. Please try again later.');
              setIsDeleting(false);
            }
          },
        },
      ]
    );
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
            <View style={[styles.planPill, subscriptionActive ? styles.planPillActive : styles.planPillInactive]}>
              <View style={[styles.planDot, subscriptionActive ? styles.planDotActive : styles.planDotInactive]} />
              <AppText style={[styles.planPillText, subscriptionActive ? styles.planPillTextActive : styles.planPillTextInactive]}>
                {subscriptionActive ? t('profile.planActive') : t('profile.noPlan')}
              </AppText>
            </View>
          </View>

          <SectionHeading title={t('profile.myAccount')} />
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

          <SectionHeading
            title={t('profile.paymentInfo')}
            action={t('profile.update')}
            onAction={() => navigation.navigate('SubscriptionNative')}
          />
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

          <TouchableOpacity style={[styles.deleteAccountBtn, isDeleting && { opacity: 0.5 }]} onPress={handleDeleteAccount} activeOpacity={0.82} disabled={isDeleting}>
            <MaterialCommunityIcons name="delete-outline" size={19} color={colors.danger} />
            <AppText style={styles.deleteAccountText}>{isDeleting ? t('common.loading') : t('profile.deleteAccountTitle')}</AppText>
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
  planPill: {
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
  },
  planPillActive: {
    backgroundColor: colors.successSoft,
  },
  planPillInactive: {
    backgroundColor: colors.brandSoft,
  },
  planDot: {
    width: 6,
    height: 6,
    marginRight: 6,
    borderRadius: 3,
  },
  planDotActive: {
    backgroundColor: colors.success,
  },
  planDotInactive: {
    backgroundColor: colors.brand,
  },
  planPillText: {
    ...typography.caption,
    fontFamily: 'Poppins-Bold',
  },
  planPillTextActive: {
    color: colors.success,
  },
  planPillTextInactive: {
    color: colors.brandStrong,
  },
  accountCard: {
    paddingHorizontal: spacing.lg,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
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
  deleteAccountBtn: {
    height: 54,
    marginTop: spacing.md,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.dangerSoft,
  },
  deleteAccountText: {
    ...typography.bodyStrong,
    marginLeft: spacing.sm,
    color: colors.danger,
  },
});
