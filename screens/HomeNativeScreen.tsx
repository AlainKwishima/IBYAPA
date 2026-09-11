import { AppText } from '../components/AppText';
import React, { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { RootStackParamList } from '../navigation/types';
import { ScreenColumn } from '../components/ScreenColumn';
import { AppHeader } from '../components/AppHeader';
import { BottomNavBar } from '../components/BottomNavBar';
import { SectionHeading } from '../components/SectionHeading';
import { PdfDocumentIcon } from '../components/PdfDocumentIcon';
import { SkeletonBlock } from '../components/RequestStates';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { useAppFlow } from '../context/AppFlowContext';
import { useGateModal } from '../context/GateModalContext';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/useI18n';
import { hasLanguageAccess, resolvePaidContentLanguage } from '../utils/subscriptionAccess';
import { getPerformanceHistory } from '../services/performanceApi';
import { readLocalExamRecords } from '../services/examHistoryStorage';
import { mergePerformanceHistory, type PerformanceHistoryRow } from '../services/performanceHistory';
import { getPdfs, getVideos, type PdfItem, type VideoItem } from '../services/contentApi';
import { colors, radii, shadows, spacing, typography } from '../constants/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'HomeNative'>;
type LearningRoute = 'ExamInstructionsNative' | 'ReadingNative' | 'RoadSigns' | 'VideoCourseList';

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
    route: 'ReadingNative',
    titleKey: 'home.action.reading',
    subtitleKey: 'home.action.readingSub',
    icon: 'book-open-page-variant-outline',
    color: colors.brandStrong,
    background: colors.brandSoft,
  },
  {
    route: 'VideoCourseList',
    titleKey: 'video.listTitle',
    subtitleKey: 'nav.watch',
    icon: 'play-circle-outline',
    color: '#2563EB',
    background: colors.amberSoft,
  },
  {
    route: 'RoadSigns',
    titleKey: 'home.action.roadSigns',
    subtitleKey: 'home.action.roadSignsSub',
    icon: 'sign-caution',
    color: colors.green,
    background: colors.greenSoft,
  },
];

function getInitials(name?: string | null) {
  if (!name?.trim()) return 'U';
  const parts = name.trim().split(/\s+/);
  return parts.length === 1
    ? parts[0].slice(0, 2).toUpperCase()
    : `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function calculateStreak(history: PerformanceHistoryRow[]) {
  if (history.length === 0) return 0;
  const uniqueDays = new Set(
    history.map((row) => {
      const day = new Date(row.date);
      day.setHours(0, 0, 0, 0);
      return day.getTime();
    }),
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let streak = 0;
  while (uniqueDays.has(today.getTime())) {
    streak += 1;
    today.setDate(today.getDate() - 1);
  }
  return streak;
}

export function HomeNativeScreen({ navigation }: Props) {
  const { t } = useI18n();
  const { tabScrollBottomPad } = useResponsiveLayout();
  const { accessToken, name } = useAuth();
  const { openGateModal } = useGateModal();
  const {
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
  const paidContentLanguage = resolvePaidContentLanguage({
    hasSubscription,
    canChangeLanguage,
    subscriptionLanguage,
    contentLanguage,
  });

  const { data, isPending: loading } = useQuery({
    queryKey: ['homeData', accessToken, paidContentLanguage],
    queryFn: async () => {
      let fetchedRows: PerformanceHistoryRow[] = [];
      let fetchedRecommendation: { type: 'pdf' | 'video'; item: PdfItem | VideoItem } | null = null;
      try {
        const local = await readLocalExamRecords();
        if (!accessToken) {
          fetchedRows = mergePerformanceHistory([], local);
          return { rows: fetchedRows, recommendation: null };
        }

        const [remote, pdfs, videos] = await Promise.all([
          getPerformanceHistory(accessToken).catch(() => []),
          paidContentLanguage ? getPdfs(accessToken, paidContentLanguage).catch(() => []) : Promise.resolve([]),
          paidContentLanguage ? getVideos(accessToken, paidContentLanguage).catch(() => []) : Promise.resolve([]),
        ]);
        fetchedRows = mergePerformanceHistory(remote, local);

        const newPdf = pdfs.find((item) => (item as PdfItem & { isNew?: boolean }).isNew === true);
        const newVideo = videos.find((item) => (item as VideoItem & { isNew?: boolean }).isNew === true);
        fetchedRecommendation = newPdf ? { type: 'pdf', item: newPdf } : newVideo ? { type: 'video', item: newVideo } : null;
      } catch (error) {
        if (__DEV__) console.warn('[Home] failed to load dashboard', error);
        const local = await readLocalExamRecords();
        fetchedRows = mergePerformanceHistory([], local);
      }
      return { rows: fetchedRows, recommendation: fetchedRecommendation };
    },
  });

  const rows = data?.rows ?? [];
  const recommendation = data?.recommendation ?? null;

  const handleLearningRoute = (route: LearningRoute) => {
    if (route === 'ExamInstructionsNative') {
      if (!isSigningOut && (!hasSubscription || !languageAccessGranted)) {
        openGateModal('subscription_exam', () => navigation.navigate('SubscriptionNative'));
        return;
      }
      navigation.navigate(route);
      return;
    }

    if (!languageAccessGranted && !isSigningOut) {
      openGateModal(route === 'VideoCourseList' ? 'subscription_watch' : 'subscription_read', () =>
        navigation.navigate('SubscriptionNative'),
      );
      return;
    }
    if (route === 'RoadSigns') {
      navigation.navigate('ReadingNative', { initialTab: 'signs' });
      return;
    }
    navigation.navigate(route);
  };

  const totalExams = rows.length;
  const average = totalExams ? Math.round(rows.reduce((sum, row) => sum + row.percent, 0) / totalExams) : 0;
  const passed = rows.filter((row) => row.status === 'PASSED').length;
  const successRate = totalExams ? Math.round((passed / totalExams) * 100) : 0;
  const lastExam = rows[0];
  const streak = calculateStreak(rows);
  const welcome = name?.trim() ? t('home.welcome', { name: name.trim() }) : t('home.welcomeGuest');
  const recommendationTitle =
    recommendation?.item.title ?? recommendation?.item.name ?? t('reading.documentFallback');

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
          <View style={styles.welcomeRow}>
            <View style={styles.welcomeCopy}>
              <AppText style={styles.welcome} lines={1}>
                {welcome}
              </AppText>
              <AppText style={styles.subwelcome} lines={null}>{t('home.subwelcome')}</AppText>
            </View>
            {streak > 0 ? (
              <View style={styles.streakBadge}>
                <Ionicons name="calendar-outline" size={16} color={colors.brandStrong} />
                <AppText style={styles.streakText}>{streak}</AppText>
              </View>
            ) : null}
          </View>



          <View style={styles.metricStrip}>
            <View style={styles.metric}>
              {loading ? <SkeletonBlock style={{ width: 32, height: 28, borderRadius: 4, marginBottom: 2 }} /> : <AppText style={styles.metricValue}>{totalExams}</AppText>}
              <AppText style={styles.metricLabel}>{t('performance.totalExams')}</AppText>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metric}>
              {loading ? <SkeletonBlock style={{ width: 44, height: 28, borderRadius: 4, marginBottom: 2 }} /> : <AppText style={styles.metricValue}>{average}%</AppText>}
              <AppText style={styles.metricLabel}>{t('performance.avgAccuracy')}</AppText>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metric}>
              {loading ? <SkeletonBlock style={{ width: 44, height: 28, borderRadius: 4, marginBottom: 2 }} /> : <AppText style={styles.metricValue}>{successRate}%</AppText>}
              <AppText style={styles.metricLabel}>{t('performance.successRate')}</AppText>
            </View>
          </View>

          <TouchableOpacity
            style={styles.primaryAction}
            onPress={() => handleLearningRoute('ExamInstructionsNative')}
            activeOpacity={0.88}
          >
            <View style={styles.primaryIcon}>
              <MaterialCommunityIcons name="steering" size={25} color={colors.white} />
            </View>
            <View style={styles.primaryCopy}>
              <AppText style={styles.primaryEyebrow}>{t('home.primaryEyebrow')}</AppText>
              <AppText style={styles.primaryTitle}>{t('home.action.exams')}</AppText>
            </View>
            <View style={styles.primaryArrow}>
              <Ionicons name="arrow-forward" size={19} color={colors.brandStrong} />
            </View>
          </TouchableOpacity>

          <View style={styles.sectionGap}>
            <SectionHeading title={t('home.learningPaths')} />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pathList}
            snapToInterval={292}
            snapToAlignment="start"
            decelerationRate="fast"
            disableIntervalMomentum
            directionalLockEnabled
            nestedScrollEnabled
            alwaysBounceHorizontal
            scrollEventThrottle={16}
            accessibilityRole="scrollbar"
            accessibilityLabel={t('home.learningPaths')}
          >
            {LEARNING_PATHS.map((path) => (
              <TouchableOpacity
                key={path.route}
                style={styles.pathCard}
                onPress={() => handleLearningRoute(path.route)}
                activeOpacity={0.84}
              >
                <View style={[styles.pathIcon, { backgroundColor: path.background }]}>
                  <MaterialCommunityIcons name={path.icon} size={25} color={path.color} />
                </View>
                <View style={styles.pathCopy}>
                  <AppText style={styles.pathTitle} lines={2}>
                    {t(path.titleKey).replace('\n', ' ')}
                  </AppText>
                  <AppText style={styles.pathSubtitle} lines={1}>
                    {t(path.subtitleKey).replace('\n', ' ')}
                  </AppText>
                </View>
                <Ionicons name="arrow-forward" size={21} color={path.color} />
              </TouchableOpacity>
            ))}
          </ScrollView>

          {recommendation ? (
            <View style={styles.sectionGap}>
              <SectionHeading title={t('home.recommended')} />
              <TouchableOpacity
                style={styles.recommendation}
                onPress={() => handleLearningRoute(recommendation.type === 'pdf' ? 'ReadingNative' : 'VideoCourseList')}
                activeOpacity={0.85}
              >
                <View style={styles.recommendationIcon}>
                  {recommendation.type === 'pdf' ? (
                    <PdfDocumentIcon size={44} />
                  ) : (
                    <Ionicons name="play-outline" size={22} color={colors.brand} />
                  )}
                </View>
                <View style={styles.recommendationCopy}>
                  <AppText style={styles.recommendationLabel}>{t('home.newContent')}</AppText>
                  <AppText style={styles.recommendationTitle} lines={1}>
                    {recommendationTitle}
                  </AppText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.sectionGap}>
            <SectionHeading
              title={t('home.recentInsight')}
              action={lastExam ? t('home.viewAll') : undefined}
              onAction={lastExam ? () => navigation.navigate('PerformanceNative') : undefined}
            />
            {lastExam ? (
              <TouchableOpacity
                style={styles.insightCard}
                onPress={() => navigation.navigate('PerformanceNative')}
                activeOpacity={0.85}
              >
                <View
                  style={[
                    styles.scoreBadge,
                    { backgroundColor: lastExam.status === 'PASSED' ? colors.greenSoft : colors.redSoft },
                  ]}
                >
                  <AppText
                    style={[
                      styles.scoreValue,
                      { color: lastExam.status === 'PASSED' ? colors.green : colors.red },
                    ]}
                  >
                    {lastExam.percent}%
                  </AppText>
                </View>
                <View style={styles.insightCopy}>
                  <AppText style={styles.insightTitle}>
                    {lastExam.title.startsWith('performance.') ? t(lastExam.title) : lastExam.title}
                  </AppText>
                  <AppText style={styles.insightMeta}>{new Date(lastExam.date).toLocaleDateString()}</AppText>
                </View>
                <Ionicons name="trending-up" size={20} color={colors.brand} />
              </TouchableOpacity>
            ) : (
              <View style={styles.emptyInsight}>
                <Ionicons name="analytics-outline" size={23} color={colors.inkSoft} />
                <AppText style={styles.emptyInsightText}>{t('performance.empty')}</AppText>
              </View>
            )}
          </View>

          {!hasSubscription ? (
            <TouchableOpacity
              style={styles.planBanner}
              onPress={() => navigation.navigate('SubscriptionNative')}
              activeOpacity={0.85}
            >
              <Ionicons name="sparkles-outline" size={21} color="#2563EB" />
              <View style={styles.planCopy}>
                <AppText style={styles.planTitle} lines={2}>{t('gate.subscription.title')}</AppText>
                <AppText style={styles.planBody}>{t('gate.subscription.exam')}</AppText>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#2563EB" />
            </TouchableOpacity>
          ) : null}
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
  welcomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  welcomeCopy: {
    flex: 1,
    paddingLeft: spacing.xs,
  },
  welcome: {
    ...typography.title,
    color: colors.ink,
  },
  subwelcome: {
    ...typography.caption,
    marginTop: 2,
    color: colors.inkMuted,
  },
  streakBadge: {
    minWidth: 44,
    height: 34,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.brandSoft,
  },
  streakText: {
    ...typography.bodyStrong,
    color: colors.brandStrong,
  },
  readinessCard: {
    minHeight: 110,
    overflow: 'hidden',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderRadius: 14,
    justifyContent: 'center',
    backgroundColor: colors.brandStrong,
    ...shadows.card,
  },
  heroTitle: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.25,
    color: colors.white,
  },
  heroBody: {
    ...typography.caption,
    marginTop: 3,
    maxWidth: 540,
    color: '#EFF6FF',
  },
  bannerStats: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  bannerPill: {
    minHeight: 28,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  bannerPillText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 12,
    lineHeight: 16,
    color: colors.white,
  },
  metricStrip: {
    minHeight: 82,
    marginTop: spacing.md,
    borderRadius: radii.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  metric: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  metricValue: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 18,
    color: colors.ink,
  },
  metricLabel: {
    ...typography.caption,
    marginTop: 3,
    fontSize: 10,
    color: colors.inkSoft,
    textAlign: 'center',
  },
  metricDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.line,
  },
  primaryAction: {
    minHeight: 76,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.md,
    borderRadius: radii.xl,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.brand,
    ...shadows.card,
  },
  primaryIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  primaryCopy: {
    flex: 1,
    marginLeft: spacing.md,
  },
  primaryEyebrow: {
    ...typography.eyebrow,
    color: '#EFF6FF',
    textTransform: 'uppercase',
  },
  primaryTitle: {
    ...typography.title,
    marginTop: 2,
    color: colors.white,
  },
  primaryArrow: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  sectionGap: {
    marginTop: spacing.xxl,
    gap: spacing.md,
  },
  pathList: {
    marginTop: spacing.md,
    paddingRight: spacing.xl,
    gap: spacing.md,
  },
  pathCard: {
    width: 280,
    minHeight: 112,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pathIcon: {
    width: 52,
    height: 52,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pathCopy: {
    flex: 1,
    marginHorizontal: spacing.lg,
  },
  pathTitle: {
    ...typography.sectionTitle,
    color: colors.ink,
  },
  pathSubtitle: {
    ...typography.body,
    marginTop: spacing.xs,
    color: colors.inkMuted,
  },
  recommendation: {
    minHeight: 72,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  recommendationIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recommendationCopy: {
    flex: 1,
    marginHorizontal: spacing.md,
  },
  recommendationLabel: {
    ...typography.eyebrow,
    color: colors.brand,
    textTransform: 'uppercase',
  },
  recommendationTitle: {
    ...typography.bodyStrong,
    marginTop: 2,
    color: colors.ink,
  },
  insightCard: {
    minHeight: 78,
    padding: spacing.md,
    borderRadius: radii.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  scoreBadge: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreValue: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 15,
  },
  insightCopy: {
    flex: 1,
    marginHorizontal: spacing.md,
  },
  insightTitle: {
    ...typography.bodyStrong,
    color: colors.ink,
  },
  insightMeta: {
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
  planBanner: {
    minHeight: 76,
    marginTop: spacing.xxl,
    padding: spacing.md,
    borderRadius: radii.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.amberSoft,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  planCopy: {
    flex: 1,
    marginHorizontal: spacing.md,
  },
  planTitle: {
    ...typography.bodyStrong,
    color: '#1E3A8A',
  },
  planBody: {
    ...typography.caption,
    marginTop: 3,
    color: '#374151',
  },
});
