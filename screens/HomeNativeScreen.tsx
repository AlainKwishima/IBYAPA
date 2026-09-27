import { AppText } from '../components/AppText';
import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { RootStackParamList } from '../navigation/types';
import { ScreenColumn } from '../components/ScreenColumn';
import { AppHeader } from '../components/AppHeader';
import { BottomNavBar } from '../components/BottomNavBar';
import { SectionHeading } from '../components/SectionHeading';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { useAppFlow } from '../context/AppFlowContext';
import { useGateModal } from '../context/GateModalContext';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/useI18n';
import { hasLanguageAccess } from '../utils/subscriptionAccess';
import { getPerformanceHistory } from '../services/performanceApi';
import { readLocalExamRecords } from '../services/examHistoryStorage';
import { mergePerformanceHistory, type PerformanceHistoryRow } from '../services/performanceHistory';
import { colors, radii, spacing, typography } from '../constants/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'HomeNative'>;
type LearningRoute = 'ExamInstructionsNative' | 'ReadingNative' | 'VideoCourseList' | 'PerformanceNative';

type LearningPath = {
  route: LearningRoute;
  titleKey: string;
  subtitleKey: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  color: string;
  background: string;
};

const LEARNING_PATHS: LearningPath[] = [
  {
    route: 'ExamInstructionsNative',
    titleKey: 'home.action.exams',
    subtitleKey: 'home.action.examsSub',
    icon: 'pencil-outline',
    color: colors.brandStrong,
    background: colors.brandSoft,
  },
  {
    route: 'ReadingNative',
    titleKey: 'home.action.reading',
    subtitleKey: 'home.action.readingSub',
    icon: 'book-open-page-variant-outline',
    color: colors.brandStrong,
    background: colors.brandSoft,
  },
  {
    route: 'VideoCourseList',
    titleKey: 'home.action.videos',
    subtitleKey: 'home.action.videosSub',
    icon: 'play-circle-outline',
    color: colors.brandStrong,
    background: colors.brandSoft,
  },
  {
    route: 'PerformanceNative',
    titleKey: 'home.action.performance',
    subtitleKey: 'home.action.performanceSub',
    icon: 'chart-line',
    color: colors.brand,
    background: colors.brandSoft,
  },
];

const HOME_EXAM_BANNER_KEY = 'ibyapa.home.exam-banner-dismissed.v1';
const HOME_EXAM_BANNER_ELIGIBLE_KEY = 'ibyapa.home.exam-banner-eligible.v1';

function getInitials(name?: string | null) {
  if (!name?.trim()) return 'U';
  const parts = name.trim().split(/\s+/);
  return parts.length === 1
    ? parts[0].slice(0, 2).toUpperCase()
    : `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function HomeNativeScreen({ navigation }: Props) {
  const { t, lang } = useI18n();
  const { tabScrollBottomPad } = useResponsiveLayout();
  const { accessToken, userId, name } = useAuth();
  const { openGateModal } = useGateModal();
  const {
    hasUsedFreeTrial,
    hasSubscription,
    canChangeLanguage,
    subscriptionLanguage,
    contentLanguage,
    isSigningOut,
  } = useAppFlow();

  const languageAccessGranted = hasLanguageAccess({
    hasSubscription,
    canChangeLanguage,
    subscriptionLanguage,
    contentLanguage,
  });

  const { data, isPending: loading } = useQuery({
    queryKey: ['homeHistory', accessToken],
    queryFn: async () => {
      let fetchedRows: PerformanceHistoryRow[] = [];
      try {
        const local = await readLocalExamRecords(userId);
        if (!accessToken) {
          fetchedRows = mergePerformanceHistory([], local);
          return { rows: fetchedRows };
        }
        const remote = await getPerformanceHistory(accessToken).catch(() => []);
        fetchedRows = mergePerformanceHistory(remote, local);
      } catch (error) {
        if (__DEV__) console.warn('[Home] failed to load dashboard', error);
        const local = await readLocalExamRecords(userId);
        fetchedRows = mergePerformanceHistory([], local);
      }
      return { rows: fetchedRows };
    },
  });

  const rows = data?.rows ?? [];

  const [examBannerDismissed, setExamBannerDismissed] = useState(false);
  const [examBannerEligible, setExamBannerEligible] = useState(false);
  const [examBannerReady, setExamBannerReady] = useState(false);

  useEffect(() => {
    let active = true;
    setExamBannerReady(false);
    setExamBannerDismissed(false);
    setExamBannerEligible(false);
    if (!userId) {
      setExamBannerReady(true);
      return () => {
        active = false;
      };
    }

    void Promise.all([
      AsyncStorage.getItem(`${HOME_EXAM_BANNER_KEY}.${userId}`),
      AsyncStorage.getItem(`${HOME_EXAM_BANNER_ELIGIBLE_KEY}.${userId}`),
    ])
      .then(([dismissedValue, eligibleValue]) => {
        if (!active) return;
        const isNewEligibleUser = !hasSubscription && !hasUsedFreeTrial;
        const eligible = eligibleValue === 'eligible' || isNewEligibleUser;
        setExamBannerDismissed(dismissedValue === 'dismissed');
        setExamBannerEligible(eligible);
        if (isNewEligibleUser && eligibleValue !== 'eligible') {
          void AsyncStorage.setItem(`${HOME_EXAM_BANNER_ELIGIBLE_KEY}.${userId}`, 'eligible');
        }
        setExamBannerReady(true);
      })
      .catch(() => {
        if (active) setExamBannerReady(true);
      });

    return () => {
      active = false;
    };
  }, [hasSubscription, hasUsedFreeTrial, userId]);

  const dismissExamBanner = async () => {
    setExamBannerDismissed(true);
    if (userId) {
      await AsyncStorage.setItem(`${HOME_EXAM_BANNER_KEY}.${userId}`, 'dismissed');
    }
  };

  const handleLearningRoute = (route: LearningRoute) => {
    if (route === 'ExamInstructionsNative') {
      if (!isSigningOut && (!hasSubscription || !languageAccessGranted)) {
        openGateModal('subscription_exam', () => navigation.navigate('SubscriptionNative'));
        return;
      }
      navigation.navigate(route);
      return;
    }

    if ((route === 'ReadingNative' || route === 'VideoCourseList') && !languageAccessGranted && !isSigningOut) {
      openGateModal(route === 'VideoCourseList' ? 'subscription_watch' : 'subscription_read', () =>
        navigation.navigate('SubscriptionNative'),
      );
      return;
    }
    navigation.navigate(route);
  };

  const welcome = name?.trim() ? t('home.welcome', { name: name.trim() }) : t('home.welcomeGuest');
  const recentRows = rows.slice(0, 3);
  const dateLocale = lang === 'rw' ? 'rw-RW' : lang === 'fr' ? 'fr-FR' : 'en-US';
  const formatExamDate = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat(dateLocale, { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
  };
  const showExamBanner = examBannerReady && examBannerEligible && !examBannerDismissed;

  return (
    <ScreenColumn>
      <AppHeader
        title={t('home.title')}
        navigation={navigation}
        titleOffsetX={6}
        left={
          <TouchableOpacity
            style={styles.headerAvatar}
            onPress={() => navigation.navigate('ProfileNative')}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('profile.title')}
          >
            <AppText style={styles.headerAvatarText}>{getInitials(name)}</AppText>
          </TouchableOpacity>
        }
      />

      <View style={styles.body}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: tabScrollBottomPad + spacing.xl }]}
        >
          <View style={styles.welcomeCard}>
            <View style={styles.welcomeCopy}>
              <AppText
                style={styles.welcome}
                lines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.82}
              >
                {welcome}
              </AppText>
              <AppText style={styles.subwelcome} lines={null}>{t('home.subwelcome')}</AppText>
            </View>
          </View>

          {showExamBanner ? (
            <View style={styles.trialBanner}>
              <View style={styles.trialIcon}>
                <MaterialCommunityIcons name="steering" size={24} color={colors.white} />
              </View>
              <TouchableOpacity
                style={styles.trialCopy}
                onPress={() => navigation.navigate('ExamInstructionsNative', { trial: true })}
                activeOpacity={0.82}
                accessibilityRole="button"
              >
                <AppText style={styles.trialEyebrow}>{t('home.trialAvailableTitle')}</AppText>
                <AppText style={styles.trialTitle} lines={2}>{t('home.action.exams')}</AppText>
                <AppText style={styles.trialBody} lines={2}>{t('home.trialAvailableBody')}</AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.trialClose}
                onPress={() => void dismissExamBanner()}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={t('home.dismissBanner')}
              >
                <Ionicons name="close" size={19} color={colors.white} />
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.sectionGap}>
            <View style={styles.grid}>
              {LEARNING_PATHS.map((path) => (
                <TouchableOpacity
                  key={path.route}
                  style={styles.gridCard}
                  onPress={() => handleLearningRoute(path.route)}
                  activeOpacity={0.84}
                  accessibilityRole="button"
                  accessibilityLabel={t(path.titleKey).replace('\n', ' ')}
                >
                  <View style={styles.gridCardHeader}>
                    <View style={[styles.gridIcon, { backgroundColor: path.background }]}>
                      <MaterialCommunityIcons name={path.icon} size={24} color={path.color} />
                    </View>
                    <Ionicons name="arrow-forward" size={18} color={path.color} />
                  </View>
                  <AppText style={styles.gridTitle} lines={2}>{t(path.titleKey).replace('\n', ' ')}</AppText>
                  <AppText style={styles.gridSubtitle} lines={3}>{t(path.subtitleKey).replace('\n', ' ')}</AppText>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.sectionGap}>
            <SectionHeading
              title={t('home.recentActivity')}
              action={rows.length ? t('home.viewAll') : undefined}
              onAction={rows.length ? () => navigation.navigate('PerformanceNative') : undefined}
            />
            {loading ? (
              <View style={styles.recentLoading}>
                <AppText style={styles.recentLoadingText}>{t('common.loading')}</AppText>
              </View>
            ) : recentRows.length ? (
              <View style={styles.recentList}>
                {recentRows.map((row, index) => {
                  const passed = row.status === 'PASSED';
                  const title = row.title.startsWith('performance.') ? t(row.title) : row.title;
                  return (
                    <TouchableOpacity
                      key={`${row.date}-${row.title}-${index}`}
                      style={styles.recentRow}
                      onPress={() => navigation.navigate('PerformanceNative')}
                      activeOpacity={0.84}
                    >
                      <View style={[styles.recentScore, { backgroundColor: passed ? colors.greenSoft : colors.redSoft }]}>
                        <AppText style={[styles.recentScoreText, { color: passed ? colors.green : colors.red }]}>
                          {row.percent}%
                        </AppText>
                      </View>
                      <View style={styles.recentCopy}>
                        <AppText style={styles.recentTitle} lines={1}>{title}</AppText>
                        <AppText style={styles.recentMeta} lines={1}>
                          {formatExamDate(row.date)} · {t(passed ? 'performance.passed' : 'performance.failed')}
                        </AppText>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.inkSoft} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyInsight}>
                <Ionicons name="analytics-outline" size={23} color={colors.inkSoft} />
                <AppText style={styles.emptyInsightText}>{t('performance.empty')}</AppText>
              </View>
            )}
          </View>
        </ScrollView>
      </View>

      <BottomNavBar navigation={navigation} />
    </ScreenColumn>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  content: {
    paddingTop: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    marginLeft: spacing.sm,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F05252',
  },
  headerAvatarText: {
    ...typography.caption,
    fontFamily: 'Poppins-Bold',
    color: colors.white,
  },
  welcomeCard: {
    marginBottom: spacing.xl,
    padding: spacing.lg,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: '#D8E7FB',
    backgroundColor: colors.blueTint,
  },
  welcomeCopy: {
    minWidth: 0,
  },
  welcome: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 18,
    lineHeight: 25,
    color: colors.darkEmphasis,
  },
  subwelcome: {
    ...typography.body,
    marginTop: spacing.sm,
    color: colors.inkMuted,
  },
  trialBanner: {
    minHeight: 116,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.xl,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.brand,
  },
  trialIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  trialCopy: {
    flex: 1,
    minWidth: 0,
    marginLeft: spacing.md,
    marginRight: spacing.sm,
  },
  trialEyebrow: {
    ...typography.eyebrow,
    color: '#EFF6FF',
    textTransform: 'uppercase',
  },
  trialTitle: {
    ...typography.title,
    marginTop: 1,
    color: colors.white,
  },
  trialBody: {
    ...typography.caption,
    marginTop: 2,
    color: '#EFF6FF',
  },
  trialClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  sectionGap: {
    marginTop: spacing.xxl,
    gap: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.md,
  },
  gridCard: {
    width: '48.2%',
    minHeight: 178,
    padding: spacing.md,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  gridCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gridIcon: {
    width: 46,
    height: 46,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridTitle: {
    ...typography.sectionTitle,
    marginTop: spacing.sm,
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
  },
  gridSubtitle: {
    ...typography.caption,
    marginTop: spacing.xs,
    color: colors.inkMuted,
  },
  recentList: {
    gap: spacing.sm,
  },
  recentLoading: {
    minHeight: 74,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  recentLoadingText: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  recentRow: {
    minHeight: 74,
    padding: spacing.md,
    borderRadius: radii.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  recentScore: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentScoreText: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 14,
  },
  recentCopy: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: spacing.md,
  },
  recentTitle: {
    ...typography.bodyStrong,
    color: colors.ink,
  },
  recentMeta: {
    ...typography.caption,
    marginTop: 3,
    color: colors.inkSoft,
  },
  emptyInsight: {
    minHeight: 78,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#E5E7EB',
  },
  emptyInsightText: {
    ...typography.body,
    flex: 1,
    color: colors.inkMuted,
  },
});
