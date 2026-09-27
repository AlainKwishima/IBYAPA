import { AppText } from '../components/AppText';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Animated, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { RootStackParamList } from '../navigation/types';
import { BottomNavBar } from '../components/BottomNavBar';
import { ScreenColumn } from '../components/ScreenColumn';
import { AppHeader } from '../components/AppHeader';
import { SkeletonBlock } from '../components/RequestStates';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { useAuth } from '../context/AuthContext';
import { getPerformanceHistory } from '../services/performanceApi';
import { getMyCertificateStatus, type CertificateStatus } from '../services/certificatesApi';
import { readLocalExamRecords } from '../services/examHistoryStorage';
import { mapLocalExamRecord, mergePerformanceHistory, type PerformanceHistoryRow } from '../services/performanceHistory';
import { getMessageFromUnknownError } from '../services/api/client';
import { useI18n } from '../i18n/useI18n';
import { colors, radii, shadows, spacing, typography } from '../constants/theme';

type PerfProps = NativeStackScreenProps<RootStackParamList, 'PerformanceNative'>;

type ReviewProps = NativeStackScreenProps<RootStackParamList, 'PerformanceReviewNative'>;

type ReviewAttempt = NonNullable<PerformanceHistoryRow>;
const REVIEW_OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];
const PERFORMANCE_PAGE_SIZE = 10;

function coerceReviewAttempt(params?: ReviewProps['route']['params']): ReviewAttempt | null {
  if (!params) return null;
  const hasAnswerDetails = Array.isArray(params.answerDetails) && params.answerDetails.length > 0;
  const hasAttemptIdentity = Boolean(params.title || params.dateLabel || params.startedAt || params.finishedAt);
  if (!hasAnswerDetails && !hasAttemptIdentity) return null;
  const correct = Number(params.correct ?? 0);
  const total = Number(params.total ?? 0);
  const percent = Number(params.percent ?? (total > 0 ? Math.round((correct / total) * 100) : 0));
  const passed = params.passed ?? percent >= 60;
  return {
    id: 'review_params',
    title: params.title ?? 'performance.theoryExam',
    date: params.dateLabel ?? params.finishedAt ?? params.startedAt ?? new Date().toISOString(),
    status: passed ? 'PASSED' : 'FAILED',
    answers: `${correct}/${total || 1}`,
    duration: params.timeLabel ?? '—',
    sortKey: Date.now(),
    percent,
    correct,
    total: total || 1,
    answeredCount: params.answeredCount,
    startedAt: params.startedAt,
    finishedAt: params.finishedAt,
    elapsedSec: params.elapsedSec,
    answerDetails: params.answerDetails ?? [],
  };
}

const LANGUAGE_LOCALE_MAP = {
  en: 'en-US',
  rw: 'rw-RW',
  fr: 'fr-FR',
} as const;

function formatHistoryDateForLanguage(raw: string, lang: 'en' | 'rw' | 'fr', fallback: string): string {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return fallback;
  const locale = LANGUAGE_LOCALE_MAP[lang] ?? 'en-US';
  return d.toLocaleString(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDurationForLanguage(raw: string, minShort: string, naText: string): string {
  const value = raw.trim();
  if (!value || value === '—' || value === 'â€”') return naText;
  const minMatch = value.match(/^(\d+)\s*min$/i);
  if (minMatch) return `${minMatch[1]} ${minShort}`;
  return value;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreTone(percent: number) {
  if (percent >= 60) {
    return {
      color: colors.success,
      backgroundColor: colors.successSoft,
    };
  }
  if (percent >= 50) {
    return {
      color: colors.brandStrong,
      backgroundColor: colors.brandSoft,
    };
  }
  return {
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
  };
}

function TopHeader({
  title,
  onBack,
  navigation,
  truncateTitle = true,
}: {
  title: string;
  onBack: () => void;
  navigation: PerfProps['navigation'] | ReviewProps['navigation'];
  truncateTitle?: boolean;
}) {
  return (
    <AppHeader title={title} onBack={onBack} navigation={navigation} truncateTitle={truncateTitle} />
  );
}

function BottomTabs({ navigation }: { navigation: PerfProps['navigation'] | ReviewProps['navigation'] }) {
  return <BottomNavBar navigation={navigation} />;
}

function HistoryCard({ item, onPress, index }: { item: PerformanceHistoryRow; onPress?: () => void; index: number }) {
  const { t, lang } = useI18n();
  const passed = item.status === 'PASSED';
  const statusText = passed ? t('performance.passed') : t('performance.failed');
  const displayTitle = item.title.startsWith('performance.') ? t(item.title) : item.title;
  const displayDate = formatHistoryDateForLanguage(item.date, lang, item.date);
  const tone = scoreTone(item.percent);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      delay: index * 100,
      useNativeDriver: true,
    }).start();
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 500,
      delay: index * 100,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim, index, slideAnim]);

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <TouchableOpacity style={styles.historyRow} onPress={onPress} activeOpacity={0.78}>
        <AppText style={styles.historyIndex}>{index + 1}</AppText>
        <View style={styles.historyMeta}>
          <View>
            <AppText style={styles.historyTitle} lines={2}>{displayTitle}</AppText>
            <AppText style={styles.historyDate}>{displayDate}</AppText>
          </View>
        </View>
        <View style={styles.historyScoreColumn}>
          <View style={[styles.scoreChip, { backgroundColor: tone.backgroundColor }]}>
            <AppText style={[styles.scoreChipText, { color: tone.color }]}>{clampPercent(item.percent)}%</AppText>
          </View>
        </View>
        <View style={styles.historyResultColumn}>
          <AppText style={[styles.historyStatus, passed ? styles.historyStatusPass : styles.historyStatusFail]}>
            {statusText}
          </AppText>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

function StatTile({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'positive' | 'negative' | 'brand';
}) {
  const color =
    tone === 'negative'
      ? colors.danger
      : tone === 'positive'
        ? colors.success
        : tone === 'brand'
          ? colors.brand
          : colors.ink;

  return (
    <View style={styles.statTile}>
      <AppText style={styles.statLabel} lines={2}>{label}</AppText>
      <AppText style={[styles.statValue, { color }]} lines={1}>{value}</AppText>
    </View>
  );
}

function PerformanceSummarySkeleton() {
  return (
    <View style={styles.summaryContainer}>

      <View style={styles.summaryGrid}>
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={i} style={styles.statTile}>
            <SkeletonBlock style={{ width: '80%', height: 12, borderRadius: 4, marginBottom: 6 }} />
            <SkeletonBlock style={{ width: '40%', height: 24, borderRadius: 6 }} />
          </View>
        ))}
      </View>
      <View style={[styles.scoreBand, { paddingVertical: 20 }]}>
        <SkeletonBlock style={{ width: '100%', height: 32, borderRadius: 8 }} />
      </View>
    </View>
  );
}

function HistoryRowSkeleton() {
  return (
    <View style={[styles.historyRow, { alignItems: 'center' }]}>
      <View style={styles.tableIndex}>
        <SkeletonBlock style={{ width: 24, height: 24, borderRadius: 12 }} />
      </View>
      <View style={styles.tableExam}>
        <SkeletonBlock style={{ width: '60%', height: 14, borderRadius: 4, marginBottom: 4 }} />
        <SkeletonBlock style={{ width: '40%', height: 10, borderRadius: 4 }} />
      </View>
      <View style={styles.tableScore}>
        <SkeletonBlock style={{ width: 32, height: 16, borderRadius: 4 }} />
      </View>
      <View style={styles.tableResult}>
        <SkeletonBlock style={{ width: 56, height: 22, borderRadius: radii.pill }} />
      </View>
    </View>
  );
}

function PerformanceSummary({ rows }: { rows: PerformanceHistoryRow[] }) {
  const { t } = useI18n();
  const total = rows.length;
  const avgAccuracy = total > 0 ? Math.round(rows.reduce((s, r) => s + r.percent, 0) / total) : 0;
  const passedCount = rows.filter((r) => r.status === 'PASSED').length;
  const successRate = total > 0 ? Math.round((passedCount / total) * 100) : 0;
  const recentDelta = total > 1 ? clampPercent(rows[0].percent) - clampPercent(rows[1].percent) : 0;
  const lowestScore = total > 0 ? Math.min(...rows.map((row) => clampPercent(row.percent))) : 0;
  const highestScore = total > 0 ? Math.max(...rows.map((row) => clampPercent(row.percent))) : 0;
  const deltaLabel = `${recentDelta > 0 ? '+' : ''}${recentDelta}%`;
  const averageWidth: `${number}%` = `${clampPercent(avgAccuracy)}%`;

  return (
    <View style={styles.summaryContainer}>


      <View style={styles.summaryGrid}>
        <StatTile label={t('performance.avgAccuracy')} value={`${avgAccuracy}%`} tone={avgAccuracy >= 60 ? 'positive' : 'negative'} />
        <StatTile label={t('performance.passedExams')} value={`${passedCount}`} tone="brand" />
        <StatTile label={t('performance.totalExams')} value={`${total}`} />
        <StatTile
          label={t('performance.scoreTrend')}
          value={deltaLabel}
          tone={recentDelta >= 0 ? 'positive' : 'negative'}
        />
      </View>

      <View style={styles.scoreBand}>
        <AppText style={styles.scoreBandTitle}>{t('performance.yourScore')}</AppText>
        <View style={styles.scoreBandValues}>
          <View style={styles.scoreExtremeCell}>
            <AppText style={styles.scoreBandMin}>{lowestScore}%</AppText>
            <AppText style={styles.scoreBandLabel} lines={2}>{t('performance.lowestScore')}</AppText>
          </View>
          <View style={[styles.scoreExtremeCell, styles.scoreExtremeCellRight]}>
            <AppText style={styles.scoreBandMax}>{highestScore}%</AppText>
            <AppText style={[styles.scoreBandLabel, styles.scoreBandLabelRight]} lines={2}>{t('performance.highestScore')}</AppText>
          </View>
        </View>
        <View style={styles.scoreTrack}>
          <View style={[styles.scoreFill, { width: averageWidth }]} />
        </View>
        <AppText style={styles.scoreAverage} lines={2}>
          {t('performance.avgAccuracy')} <AppText style={styles.scoreAverageValue}>{avgAccuracy}%</AppText>
        </AppText>
      </View>
    </View>
  );
}

function CertificateEligibilityCard({ certificate, navigation }: { certificate: CertificateStatus; navigation: PerfProps['navigation'] }) {
  const { t } = useI18n();
  const eligibility = certificate.eligibility;
  const requirements = eligibility?.requirements;
  const requestStatus = certificate.request?.status?.toLowerCase();
  const certificateStatus = certificate.certificate?.status?.toLowerCase();
  const isVisible = Boolean(eligibility?.eligible || requestStatus || certificateStatus);

  if (!isVisible) return null;

  const statusKey = certificateStatus === 'issued'
    ? 'performance.certificateIssued'
    : requestStatus === 'under_review'
      ? 'performance.certificateUnderReview'
      : requestStatus === 'pending_payment'
        ? 'performance.certificatePaymentPending'
        : 'performance.certificateEligible';

  return (
    <View style={styles.certificateCard}>
      <View style={styles.certificateCardTop}>
        <View style={styles.certificateTitleRow}>
          <View style={styles.certificateIconCircle}>
            <Ionicons name="ribbon" size={18} color={colors.brand} />
          </View>
          <AppText style={styles.certificateTitle}>{t('performance.certificateTitle')}</AppText>
        </View>
        <View style={styles.certificateStatusBadge}>
          <AppText style={styles.certificateStatusText}>{t(statusKey)}</AppText>
        </View>
      </View>
      <AppText style={styles.certificateMessage}>
        {eligibility?.eligible
          ? t('performance.certificateEligibleMessage')
          : requestStatus === 'under_review'
            ? t('performance.certificateUnderReviewMessage')
            : requestStatus === 'pending_payment'
              ? t('performance.certificatePaymentPendingMessage')
              : t('performance.certificateNotEligibleMessage')}
      </AppText>
      {eligibility?.eligible && requirements?.minimumExams && requirements.minimumAverage ? (
        <AppText style={styles.certificateProgress}>
          {requirements.minimumExams.current ?? 0}/{requirements.minimumExams.required ?? 0} {t('performance.certificateExams')} ·{' '}
          {requirements.minimumAverage.current ?? 0}% {t('performance.certificateAverage')}
        </AppText>
      ) : null}
      <TouchableOpacity style={styles.certificateAction} onPress={() => navigation.navigate('CertificateNative')} activeOpacity={0.84}>
        <AppText style={styles.certificateActionText}>{t('performance.viewCertificate')}</AppText>
        <Ionicons name="arrow-forward" size={18} color={colors.white} />
      </TouchableOpacity>
    </View>
  );
}

function HistoryBackground({
  navigation,
  rows,
  certificate,
  loading,
  loadError,
  onRetry,
}: {
  navigation: PerfProps['navigation'];
  rows: PerformanceHistoryRow[];
  certificate: CertificateStatus | null;
  loading: boolean;
  loadError: string | null;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  const { tabScrollBottomPad } = useResponsiveLayout();
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / PERFORMANCE_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageStart = safePage * PERFORMANCE_PAGE_SIZE;
  const pageRows = rows.slice(pageStart, pageStart + PERFORMANCE_PAGE_SIZE);

  useEffect(() => {
    setPage(0);
  }, [rows]);

  const goToPreviousPage = () => setPage((current) => Math.max(0, current - 1));
  const goToNextPage = () => setPage((current) => Math.min(pageCount - 1, current + 1));

  return (
    <>
      <TopHeader title={t('performance.title')} onBack={() => navigation.goBack()} navigation={navigation} />
      <View style={styles.body}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.listPad, { paddingBottom: tabScrollBottomPad }]}>
          {certificate ? <CertificateEligibilityCard certificate={certificate} navigation={navigation} /> : null}
          {loading && rows.length === 0 ? <PerformanceSummarySkeleton /> : <PerformanceSummary rows={rows} />}

          <View style={styles.sectionHeader}>
            <AppText style={styles.sectionTitle}>{t('performance.examList')}</AppText>
            <TouchableOpacity onPress={onRetry} disabled={loading} style={styles.refreshBtn}>
              <Ionicons name="refresh" size={14} color={colors.brand} />
              <AppText style={styles.refreshText}>{loading ? t('common.loading') : t('performance.refresh')}</AppText>
            </TouchableOpacity>
          </View>
          {loadError ? <View style={styles.errorBox}><AppText style={styles.inlineError}>{loadError}</AppText></View> : null}
          {rows.length === 0 && !loading ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="document-text-outline" size={32} color="#6B7280" />
              </View>
              <AppText style={styles.emptyTitle}>{t('performance.emptyTitle')}</AppText>
              <AppText style={styles.emptyText}>{t('performance.empty')}</AppText>
            </View>
          ) : null}
          {rows.length > 0 || (loading && rows.length === 0) ? (
            <View style={styles.historyTable}>
              <View style={styles.tableHeader}>
                <AppText style={[styles.tableHeaderText, styles.tableIndex]}>#</AppText>
                <AppText style={[styles.tableHeaderText, styles.tableExam]}>{t('performance.examColumn')}</AppText>
                <AppText style={[styles.tableHeaderText, styles.tableScore]}>{t('performance.scoreColumn')}</AppText>
                <AppText style={[styles.tableHeaderText, styles.tableResult]}>{t('performance.resultColumn')}</AppText>
              </View>
              {loading && rows.length === 0
                ? Array.from({ length: 4 }).map((_, idx) => <HistoryRowSkeleton key={idx} />)
              : pageRows.map((item, idx) => (
                <HistoryCard
                  key={item.id}
                  item={item}
                  index={pageStart + idx}
                  onPress={() =>
                    navigation.navigate('PerformanceReviewNative', {
                      correct: item.correct,
                      total: item.total,
                      percent: item.percent,
                      timeLabel: item.duration,
                      passed: item.status === 'PASSED',
                      dateLabel: item.date,
                      title: item.title,
                      answeredCount: item.answeredCount,
                      startedAt: item.startedAt,
                      finishedAt: item.finishedAt,
                      elapsedSec: item.elapsedSec,
                      answerDetails: item.answerDetails,
                    })
                  }
                />
              ))}
            </View>
          ) : null}
          {rows.length > PERFORMANCE_PAGE_SIZE ? (
            <View style={styles.paginationControls}>
              <TouchableOpacity
                accessibilityLabel={t('performance.previousPage')}
                accessibilityRole="button"
                disabled={safePage === 0}
                onPress={goToPreviousPage}
                style={[styles.paginationButton, safePage === 0 && styles.paginationButtonDisabled]}
              >
                <Ionicons name="chevron-back" size={18} color={safePage === 0 ? colors.inkSoft : colors.brand} />
                <AppText style={[styles.paginationButtonText, safePage === 0 && styles.paginationButtonTextDisabled]}>
                  {t('performance.previousPage')}
                </AppText>
              </TouchableOpacity>
              <AppText style={styles.paginationLabel}>
                {pageStart + 1}-{Math.min(pageStart + PERFORMANCE_PAGE_SIZE, rows.length)} {t('common.of')} {rows.length}
              </AppText>
              <TouchableOpacity
                accessibilityLabel={t('performance.nextPage')}
                accessibilityRole="button"
                disabled={safePage >= pageCount - 1}
                onPress={goToNextPage}
                style={[styles.paginationButton, styles.paginationButtonNext, safePage >= pageCount - 1 && styles.paginationButtonDisabled]}
              >
                <AppText style={[styles.paginationButtonText, styles.paginationButtonTextNext, safePage >= pageCount - 1 && styles.paginationButtonTextDisabled]}>
                  {t('performance.nextPage')}
                </AppText>
                <Ionicons name="chevron-forward" size={18} color={safePage >= pageCount - 1 ? colors.inkSoft : colors.white} />
              </TouchableOpacity>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </>
  );
}

function ProgressRow({ title, value }: { title: string; value: number }) {
  return (
    <View style={styles.progressRow}>
      <View style={styles.progressHeader}>
        <AppText style={styles.progressTitle}>{title}</AppText>
        <AppText style={styles.progressValue}>{value}%</AppText>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${value}%` }]} />
      </View>
    </View>
  );
}

export function PerformanceNativeScreen({ navigation }: PerfProps) {
  const { accessToken, userId } = useAuth();
  const { data: rows = [], isPending: loading, error, refetch } = useQuery({
    queryKey: ['performanceHistory', accessToken],
    queryFn: async () => {
      let fetchedRows: PerformanceHistoryRow[] = [];
      try {
        const local = await readLocalExamRecords(userId);
        if (!accessToken) {
          fetchedRows = mergePerformanceHistory([], local);
          return fetchedRows;
        }
        const remote = await getPerformanceHistory(accessToken);
        fetchedRows = mergePerformanceHistory(remote, local);
      } catch (e) {
        const local = await readLocalExamRecords(userId);
        fetchedRows = mergePerformanceHistory([], local);
        throw e;
      }
      return fetchedRows;
    },
  });
  const { data: certificate = null } = useQuery({
    queryKey: ['certificateStatus', accessToken],
    enabled: Boolean(accessToken),
    retry: false,
    staleTime: 60 * 1000,
    queryFn: () => getMyCertificateStatus(accessToken as string),
  });

  const loadError = error ? getMessageFromUnknownError(error) : null;
  const load = () => { void refetch(); };

  return (
    <ScreenColumn>
      <HistoryBackground navigation={navigation} rows={rows} certificate={certificate} loading={loading} loadError={loadError} onRetry={load} />
      <BottomTabs navigation={navigation} />
    </ScreenColumn>
  );
}

export function PerformanceReviewNativeScreen({ navigation, route }: ReviewProps) {
  const { t, lang } = useI18n();
  const [attempt, setAttempt] = useState<ReviewAttempt | null>(() => coerceReviewAttempt(route.params));
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const directAttempt = coerceReviewAttempt(route.params);
    if (directAttempt) {
      setAttempt(directAttempt);
      setCurrentIndex(0);
      return () => {
        cancelled = true;
        void cancelled;
      };
    }

    const loadLatest = async () => {
      const local = await readLocalExamRecords(userId);
      if (cancelled) return;
      const latest = local[0] ? mapLocalExamRecord(local[0]) : null;
      setAttempt(latest);
      setCurrentIndex(0);
    };
    void loadLatest();
    return () => {
      cancelled = true;
    };
  }, [route.params]);

  const answerDetails = attempt?.answerDetails ?? [];
  const totalQuestions = answerDetails.length || attempt?.total || 1;
  const currentQuestion = answerDetails[Math.min(currentIndex, Math.max(answerDetails.length - 1, 0))];
  const currentLabel = `${t('exam.question')} ${Math.min(currentIndex + 1, totalQuestions)} ${t('common.of')} ${totalQuestions}`;
  const startedLabel = attempt?.startedAt ? formatHistoryDateForLanguage(attempt.startedAt, lang, t('common.na')) : t('common.na');
  const finishedLabel = attempt?.finishedAt ? formatHistoryDateForLanguage(attempt.finishedAt, lang, t('common.na')) : t('common.na');
  const durationLabel = attempt?.duration ?? t('common.na');
  const reviewTitle = attempt?.title?.startsWith('performance.') ? t(attempt.title) : attempt?.title ?? t('test.results');
  const selectedIsCorrect = Boolean(currentQuestion?.isCorrect);
  const reviewOptions =
    currentQuestion?.options && currentQuestion.options.length > 0
      ? currentQuestion.options
      : [
          ...(currentQuestion?.selectedOptionText
            ? [{
                id: currentQuestion.selectedOptionId ?? 'selected',
                text: currentQuestion.selectedOptionText,
                imageUrl: null,
                isCorrect: selectedIsCorrect,
              }]
            : []),
          ...(!selectedIsCorrect && currentQuestion?.correctOptionText
            ? [{
                id: currentQuestion.correctOptionId ?? 'correct',
                text: currentQuestion.correctOptionText,
                imageUrl: null,
                isCorrect: true,
              }]
            : []),
        ];
  const incorrectCount = answerDetails.filter((item) => !item.isCorrect).length;
  const correctionPercent = attempt?.percent ?? (attempt ? Math.round((attempt.correct / Math.max(attempt.total, 1)) * 100) : 0);
  const returnToExamInstructions = () => {
    navigation.goBack();
  };

  return (
    <ScreenColumn>
      <TopHeader title={t('test.results')} onBack={returnToExamInstructions} navigation={navigation} truncateTitle={false} />
      <View style={styles.reviewExamBody}>
        <View style={{ flexDirection: 'row', padding: 16, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1, marginRight: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink }} numberOfLines={1}>{reviewTitle}</Text>
            <Text style={{ fontSize: 13, color: colors.inkSoft, marginTop: 4 }}>
              {attempt?.date ? formatHistoryDateForLanguage(attempt.date, lang, t('common.na')) : startedLabel}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: correctionPercent >= 60 ? colors.success : colors.danger }}>{correctionPercent}%</Text>
            <Text style={{ fontSize: 12, color: colors.inkSoft, fontWeight: '600' }}>{attempt?.correct ?? 0} / {attempt?.total ?? totalQuestions} {t('performance.correct')}</Text>
          </View>
        </View>
        {currentQuestion ? (
          <>
            <View style={styles.reviewExamProgressHeader}>
              <View>
                <Text style={styles.reviewExamQuestionPosition}>{currentLabel}</Text>
                <Text style={styles.reviewExamAnsweredLabel}>
                  {t('exam.answeredCount', { answered: attempt?.answeredCount ?? answerDetails.length, total: totalQuestions })}
                </Text>
              </View>
              <View style={[styles.currentStatusChip, selectedIsCorrect ? styles.currentStatusCorrect : styles.currentStatusWrong]}>
                <Ionicons
                  name={selectedIsCorrect ? 'checkmark-circle' : 'close-circle'}
                  size={14}
                  color={selectedIsCorrect ? colors.success : colors.danger}
                />
                <Text style={[styles.currentStatusText, selectedIsCorrect ? styles.currentStatusTextCorrect : styles.currentStatusTextWrong]}>
                  {selectedIsCorrect ? t('performance.correct') : t('performance.incorrect')}
                </Text>
              </View>
            </View>
            <View style={styles.reviewExamProgressTrack}>
              <View style={[styles.reviewExamProgressFill, { width: `${((currentIndex + 1) / totalQuestions) * 100}%` }]} />
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.reviewQuestionNav}
              contentContainerStyle={styles.reviewQuestionNavContent}
            >
              {answerDetails.map((detail, index) => {
                const active = index === currentIndex;
                const correct = Boolean(detail.isCorrect);
                return (
                  <TouchableOpacity
                    key={`${detail.questionId}-chip-${index}`}
                    style={[
                      styles.reviewQuestionChip,
                      correct ? styles.reviewQuestionChipCorrect : styles.reviewQuestionChipWrong,
                      active && styles.reviewQuestionChipActive,
                    ]}
                    onPress={() => setCurrentIndex(index)}
                    activeOpacity={0.78}
                  >
                    <Text
                      style={[
                        styles.reviewQuestionChipText,
                        correct ? styles.reviewQuestionChipTextCorrect : styles.reviewQuestionChipTextWrong,
                        active && styles.reviewQuestionChipTextActive,
                      ]}
                    >
                      {index + 1}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={styles.reviewExamScroll}
              contentContainerStyle={styles.reviewExamContent}
            >
              <View style={styles.reviewQuestionCard}>
                {currentQuestion.questionImageUrls?.[0] ? (
                  <View style={styles.reviewImageStage}>
                    <Image source={{ uri: currentQuestion.questionImageUrls[0] }} style={styles.reviewQuestionImage} resizeMode="contain" />
                  </View>
                ) : null}
                <Text style={styles.reviewQuestionText}>{currentQuestion.questionText}</Text>
              </View>

              <Text style={styles.reviewChooseLabel}>{t('exam.chooseAnswer')}</Text>
              <View style={styles.reviewOptionList}>
                {reviewOptions.map((option, index) => {
                  const isSelected = option.id === currentQuestion.selectedOptionId || option.text === currentQuestion.selectedOptionText;
                  const isCorrect = Boolean(option.isCorrect);
                  const isWrongSelection = isSelected && !isCorrect;
                  const optionTone = isCorrect
                    ? styles.reviewOptionCorrect
                    : isWrongSelection
                      ? styles.reviewOptionWrong
                      : styles.reviewOptionNeutral;
                  const markerTone = isCorrect
                    ? styles.reviewOptionMarkerCorrect
                    : isWrongSelection
                      ? styles.reviewOptionMarkerWrong
                      : styles.reviewOptionMarkerNeutral;
                  return (
                    <View key={`${option.id}-${index}`} style={[styles.reviewOptionCard, optionTone]}>
                      <View style={[styles.reviewOptionMarker, markerTone]}>
                        {isCorrect || isWrongSelection ? (
                          <Ionicons
                            name={isCorrect ? 'checkmark-circle' : 'close-circle'}
                            size={18}
                            color="#FFFFFF"
                          />
                        ) : (
                          <Text style={styles.reviewOptionMarkerText}>{REVIEW_OPTION_LABELS[index] ?? index + 1}</Text>
                        )}
                      </View>
                      <View style={styles.reviewAnswerStack}>
                        <View style={styles.reviewAnswerLabelRow}>
                          {isSelected ? <Text style={styles.reviewAnswerLabel}>{t('performance.yourAnswer')}</Text> : null}
                          {isCorrect ? <Text style={styles.reviewCorrectLabel}>{t('performance.correctAnswer')}</Text> : null}
                        </View>
                        <Text style={styles.reviewAnswerText}>{option.text}</Text>
                        {option.imageUrl ? (
                          <Image source={{ uri: option.imageUrl }} style={styles.reviewOptionImage} resizeMode="contain" />
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>

            </ScrollView>

            <View style={styles.reviewExamFooter}>
              <TouchableOpacity
                style={[styles.reviewExamNavButton, currentIndex === 0 && styles.navBtnDisabled]}
                onPress={() => setCurrentIndex((idx) => Math.max(idx - 1, 0))}
                disabled={currentIndex === 0}
              >
                <Ionicons name="arrow-back" size={19} color={currentIndex === 0 ? colors.inkSoft : colors.ink} />
                <Text style={[styles.reviewExamNavText, currentIndex === 0 && styles.navTextDisabled]}>{t('exam.previous')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.reviewExamNavButton, styles.reviewExamNavButtonPrimary]}
                onPress={() => {
                  if (currentIndex < answerDetails.length - 1) {
                    setCurrentIndex((idx) => Math.min(idx + 1, answerDetails.length - 1));
                    return;
                  }
                  navigation.navigate('PerformanceNative');
                }}
              >
                <Text style={[styles.reviewExamNavText, styles.reviewExamNavTextPrimary]}>
                  {currentIndex >= answerDetails.length - 1 ? t('performance.finishReview') : t('exam.next')}
                </Text>
                <Ionicons name="arrow-forward" size={19} color={colors.white} />
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={styles.emptyReviewBox}>
            <Text style={styles.emptyReviewTitle}>{t('performance.reviewUnavailableTitle')}</Text>
            <Text style={styles.emptyReviewText}>{t('performance.reviewUnavailableBody')}</Text>
          </View>
        )}
      </View>
    </ScreenColumn>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  summaryContainer: {
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  performanceBanner: {
    minHeight: 110,
    overflow: 'hidden',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderRadius: 14,
    justifyContent: 'center',
    backgroundColor: colors.brandStrong,
    ...shadows.card,
  },
  performanceBannerTitle: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.25,
    color: colors.white,
  },
  performanceBannerBody: {
    ...typography.caption,
    marginTop: 3,
    color: '#EFF6FF',
  },
  performanceBannerStats: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  performanceBannerPill: {
    minHeight: 28,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  performanceBannerPillText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 12,
    lineHeight: 16,
    color: colors.white,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  statTile: {
    width: '48%',
    minHeight: 112,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  statLabel: {
    ...typography.caption,
    fontFamily: 'Poppins-Bold',
    minHeight: 34,
    lineHeight: 17,
    color: colors.inkMuted,
  },
  statValue: {
    marginTop: spacing.xs,
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 26,
    lineHeight: 32,
  },
  scoreBand: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  scoreBandTitle: {
    ...typography.sectionTitle,
    color: colors.ink,
  },
  scoreBandValues: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  scoreExtremeCell: {
    flex: 1,
    minWidth: 0,
  },
  scoreBandMin: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 18,
    lineHeight: 24,
    color: colors.danger,
  },
  scoreBandMax: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 18,
    lineHeight: 24,
    color: colors.brand,
    textAlign: 'right',
  },
  scoreBandLabel: {
    ...typography.caption,
    marginTop: 2,
    lineHeight: 17,
    color: colors.inkMuted,
  },
  scoreExtremeCellRight: {
    alignItems: 'flex-end',
  },
  scoreBandLabelRight: {
    textAlign: 'right',
  },
  scoreTrack: {
    height: 12,
    marginTop: spacing.md,
    overflow: 'hidden',
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
  },
  scoreFill: {
    height: '100%',
    borderRadius: radii.pill,
    backgroundColor: colors.danger,
  },
  scoreAverage: {
    ...typography.caption,
    marginTop: spacing.xs,
    textAlign: 'center',
    color: colors.inkMuted,
  },
  scoreAverageValue: {
    fontFamily: 'Poppins-ExtraBold',
    color: colors.danger,
  },
  certificateCard: {
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.brand,
    ...shadows.subtle,
  },
  certificateCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  certificateTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  certificateIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSoft,
  },
  certificateTitle: {
    ...typography.bodyStrong,
    color: colors.ink,
  },
  certificateStatusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.brandSoft,
  },
  certificateStatusText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 10,
    lineHeight: 14,
    color: colors.brandStrong,
  },
  certificateMessage: {
    marginTop: spacing.sm,
    ...typography.caption,
    color: colors.inkMuted,
  },
  certificateProgress: {
    marginTop: spacing.xs,
    ...typography.caption,
    color: colors.brandStrong,
  },
  certificateAction: {
    minHeight: 44,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.brand,
  },
  certificateActionText: {
    ...typography.bodyStrong,
    color: colors.white,
  },
  sectionHeader: {
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paginationControls: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  paginationButton: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: colors.brandSoft,
  },
  paginationButtonNext: {
    backgroundColor: colors.brand,
  },
  paginationButtonDisabled: {
    backgroundColor: colors.surfaceAlt,
  },
  paginationButtonText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 12,
    color: colors.brand,
  },
  paginationButtonTextNext: {
    color: colors.white,
  },
  paginationButtonTextDisabled: {
    color: colors.inkSoft,
  },
  paginationLabel: {
    flex: 1,
    fontFamily: 'Poppins-Bold',
    fontSize: 12,
    textAlign: 'center',
    color: colors.inkMuted,
  },
  sectionTitle: { ...typography.title, color: colors.ink },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  refreshText: { fontFamily: 'Poppins-Bold', fontSize: 13, color: colors.brand },
  errorBox: { marginBottom: 16, padding: 12, borderRadius: radii.md, backgroundColor: colors.redSoft },
  inlineError: { ...typography.caption, color: colors.red },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 40 },
  emptyIconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontFamily: 'Poppins-Bold', fontSize: 18, color: '#374151', marginBottom: 8 },
  emptyText: { fontFamily: 'Poppins-Medium', fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22 },
  listPad: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  historyTable: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  tableHeader: {
    minHeight: 38,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  tableHeaderText: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 10,
    lineHeight: 14,
    color: colors.inkMuted,
    textTransform: 'uppercase',
  },
  tableIndex: { width: 34 },
  tableExam: { flex: 1 },
  tableScore: { width: 74, textAlign: 'center' },
  tableResult: { width: 88, textAlign: 'right' },
  historyRow: {
    minHeight: 72,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  historyIndex: {
    width: 34,
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 13,
    color: colors.brandStrong,
  },
  historyMeta: { flex: 1, paddingRight: spacing.md },
  historyTitle: { fontFamily: 'Poppins-ExtraBold', fontSize: 13, lineHeight: 18, color: colors.ink },
  historyDate: { marginTop: 2, fontFamily: 'Poppins-Medium', fontSize: 11, lineHeight: 16, color: colors.inkMuted },
  historyScoreColumn: { width: 74, alignItems: 'center' },
  historyResultColumn: { width: 88, alignItems: 'flex-end', justifyContent: 'center' },
  scoreChip: {
    minWidth: 54,
    minHeight: 30,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreChipText: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 13,
  },
  historyStatus: {
    marginTop: spacing.xs,
    fontFamily: 'Poppins-Bold',
    fontSize: 11,
    lineHeight: 15,
  },
  historyStatusPass: { color: colors.success },
  historyStatusFail: { color: colors.danger },

  detailBody: { flex: 1, paddingHorizontal: 20, paddingTop: spacing.md, backgroundColor: colors.canvas },
  reviewExamBody: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  reviewExamProgressHeader: {
    paddingTop: spacing.md,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  reviewExamQuestionPosition: {
    ...typography.title,
    color: colors.ink,
  },
  reviewExamAnsweredLabel: {
    ...typography.caption,
    marginTop: 2,
    color: colors.inkMuted,
  },
  reviewExamProgressTrack: {
    height: 5,
    marginTop: spacing.md,
    marginHorizontal: spacing.xl,
    overflow: 'hidden',
    borderRadius: 3,
    backgroundColor: '#E5E7EB',
  },
  reviewExamProgressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.brand,
  },
  reviewQuestionNav: {
    flexGrow: 0,
    marginTop: spacing.lg,
  },
  reviewQuestionNavContent: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  reviewQuestionChip: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  reviewQuestionChipCorrect: {
    borderColor: '#2563EB',
    backgroundColor: colors.successSoft,
  },
  reviewQuestionChipWrong: {
    borderColor: '#F05252',
    backgroundColor: colors.dangerSoft,
  },
  reviewQuestionChipActive: {
    borderColor: colors.brandStrong,
    backgroundColor: colors.brandStrong,
  },
  reviewQuestionChipText: {
    ...typography.caption,
    fontFamily: 'Poppins-Bold',
  },
  reviewQuestionChipTextCorrect: {
    color: colors.success,
  },
  reviewQuestionChipTextWrong: {
    color: colors.danger,
  },
  reviewQuestionChipTextActive: {
    color: colors.white,
  },
  reviewExamScroll: {
    flex: 1,
  },
  reviewExamContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  reviewExamFooter: {
    minHeight: 76,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
  reviewExamNavButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: radii.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceAlt,
  },
  reviewExamNavButtonPrimary: {
    borderColor: colors.brand,
    backgroundColor: colors.brand,
  },
  reviewExamNavText: {
    ...typography.bodyStrong,
    color: colors.ink,
  },
  reviewExamNavTextPrimary: {
    color: colors.white,
  },
  navTextDisabled: {
    color: colors.inkSoft,
  },
  detailCard: { backgroundColor: colors.surface, borderRadius: radii.xl, padding: 24, borderWidth: 1, borderColor: colors.line, ...shadows.card },
  detailCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  statusTag: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 10 },
  statusTagPass: { backgroundColor: '#2563EB' },
  statusTagFail: { backgroundColor: '#F05252' },
  statusTagText: { fontFamily: 'Poppins-Bold', fontSize: 10, color: '#FFFFFF' },
  statusTagTextPass: { color: '#FFFFFF' },
  statusTagTextFail: { color: '#FFFFFF' },
  detailExamTitle: { fontFamily: 'Poppins-Bold', fontSize: 24, color: '#111827', marginBottom: 6 },
  detailDate: { fontFamily: 'Poppins-Medium', fontSize: 14, color: '#6B7280' },
  detailStatsGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  detailStatItem: { flex: 1, alignItems: 'center' },
  detailStatVal: { marginTop: 8, fontFamily: 'Poppins-Bold', fontSize: 16, color: '#111827' },
  detailStatLab: { marginTop: 2, fontFamily: 'Poppins-Bold', fontSize: 10, color: '#6B7280' },
  detailInfoBox: { marginBottom: 24, padding: 14, borderRadius: 16, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB' },
  detailInfoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  detailInfoLabel: { fontFamily: 'Poppins-Bold', fontSize: 11, color: '#6B7280', textTransform: 'uppercase' },
  detailInfoValue: { fontFamily: 'Poppins-Medium', fontSize: 12, color: '#111827', flexShrink: 1, textAlign: 'right', marginLeft: 8 },
  detailDivider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 24 },
  breakdownTitle: { fontFamily: 'Poppins-Bold', fontSize: 11, color: '#6B7280', letterSpacing: 1, marginBottom: 16 },
  progressRow: { marginBottom: 12 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  progressTitle: { fontFamily: 'Poppins-Bold', fontSize: 14, color: '#111827' },
  progressValue: { fontFamily: 'Poppins-Bold', fontSize: 14, color: '#111827' },
  progressTrack: { marginTop: 8, height: 8, backgroundColor: '#F3F4F6', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, backgroundColor: colors.brand, borderRadius: 4 },
  detailActions: { marginTop: 32, gap: 12 },
  detailPrimaryBtn: { height: 56, borderRadius: 28, backgroundColor: colors.brand, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', ...shadows.card },
  detailPrimaryBtnText: { fontFamily: 'Poppins-Bold', fontSize: 16, color: '#FFFFFF' },
  detailSecondaryBtn: { height: 56, borderRadius: 28, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  detailSecondaryBtnText: { fontFamily: 'Poppins-Bold', fontSize: 16, color: '#374151' },

  correctionOverview: {
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.brandStrong,
  },
  correctionScoreBlock: {
    width: 92,
    height: 92,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  correctionScore: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 28,
    lineHeight: 34,
    color: colors.white,
  },
  correctionScoreLabel: {
    ...typography.caption,
    color: '#EFF6FF',
  },
  correctionStats: {
    flex: 1,
    gap: spacing.sm,
  },
  correctionStatPill: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
  },
  correctionStatText: {
    ...typography.bodyStrong,
    color: colors.ink,
  },
  reviewStepBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  reviewStepText: { fontFamily: 'Poppins-Bold', fontSize: 13, color: '#6B7280' },
  reviewStepScore: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 13,
    color: colors.brand,
  },
  currentStatusChip: {
    minHeight: 28,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  currentStatusCorrect: {
    backgroundColor: colors.successSoft,
  },
  currentStatusWrong: {
    backgroundColor: colors.dangerSoft,
  },
  currentStatusText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 11,
  },
  currentStatusTextCorrect: {
    color: colors.success,
  },
  currentStatusTextWrong: {
    color: colors.danger,
  },
  reviewStepDots: { flexDirection: 'row', gap: 4 },
  stepDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#E5E7EB' },
  stepDotActive: { width: 16, backgroundColor: colors.brand },
  questionCard: { borderRadius: 20, backgroundColor: '#FFFFFF', padding: 20, marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3 },
  questionText: { fontFamily: 'Poppins-Bold', fontSize: 18, color: '#111827', marginBottom: 18, lineHeight: 26 },
  reviewQuestionCard: {
    padding: spacing.xl,
    borderRadius: radii.xl,
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadows.card,
  },
  reviewQuestionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  reviewQuestionLabel: {
    ...typography.eyebrow,
    color: colors.brand,
    textTransform: 'uppercase',
  },
  reviewQuestionText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 17,
    lineHeight: 26,
    marginTop: spacing.lg,
    color: colors.ink,
  },
  reviewImageStage: {
    minHeight: 180,
    marginTop: spacing.lg,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  reviewQuestionImage: {
    width: '100%',
    height: 180,
  },
  diagramContainer: { backgroundColor: '#F9FAFB', borderRadius: 12, padding: 12, alignItems: 'center' },
  diagram: { width: '100%', height: 200 },
  optionsSection: { gap: 10, marginBottom: 24 },
  reviewChooseLabel: {
    ...typography.eyebrow,
    marginBottom: spacing.md,
    color: colors.inkSoft,
    textTransform: 'uppercase',
  },
  reviewOptionList: {
    gap: spacing.sm,
    marginBottom: spacing.xxl,
  },
  reviewOptionCard: {
    minHeight: 66,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  reviewOptionCorrect: {
    borderColor: colors.success,
    backgroundColor: colors.successSoft,
  },
  reviewOptionWrong: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
  },
  reviewOptionNeutral: {
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  reviewOptionMarker: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  reviewOptionMarkerCorrect: {
    backgroundColor: colors.success,
  },
  reviewOptionMarkerWrong: {
    backgroundColor: colors.danger,
  },
  reviewOptionMarkerNeutral: {
    backgroundColor: '#F3F4F6',
  },
  reviewOptionMarkerText: {
    ...typography.bodyStrong,
    color: colors.inkMuted,
  },
  reviewAnswerStack: {
    flex: 1,
    marginLeft: spacing.md,
  },
  reviewAnswerLabelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  reviewAnswerLabel: {
    ...typography.eyebrow,
    color: colors.danger,
    textTransform: 'uppercase',
  },
  reviewCorrectLabel: {
    ...typography.eyebrow,
    color: colors.success,
    textTransform: 'uppercase',
  },
  reviewAnswerText: {
    ...typography.bodyStrong,
    marginTop: 2,
    color: colors.ink,
  },
  reviewOptionImage: {
    width: '100%',
    height: 90,
    marginTop: spacing.sm,
  },
  answerOption: { minHeight: 64, borderRadius: 16, backgroundColor: '#F3F4F6', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  correctOption: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#2563EB' },
  wrongOption: { backgroundColor: '#FDE8E8', borderWidth: 1, borderColor: '#F05252' },
  optionMarker: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  answerStack: { flex: 1, paddingVertical: 12 },
  answerLabel: { fontFamily: 'Poppins-Bold', fontSize: 10, color: '#6B7280', textTransform: 'uppercase', marginBottom: 3 },
  markerText: { fontFamily: 'Poppins-Bold', fontSize: 12, color: '#374151' },
  answerLight: { flex: 1, fontFamily: 'Poppins-Bold', fontSize: 14, color: '#111827' },
  answerDark: { flex: 1, fontFamily: 'Poppins-Bold', fontSize: 14, color: '#111827' },
  correctionListTitle: {
    ...typography.sectionTitle,
    color: colors.ink,
    marginBottom: spacing.md,
  },
  correctionList: {
    overflow: 'hidden',
    marginBottom: spacing.xxl,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  correctionRow: {
    minHeight: 74,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  correctionRowActive: {
    backgroundColor: colors.brandSoft,
  },
  correctionIndex: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  correctionIndexCorrect: {
    backgroundColor: colors.successSoft,
  },
  correctionIndexWrong: {
    backgroundColor: colors.dangerSoft,
  },
  correctionIndexText: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 13,
  },
  correctionIndexTextCorrect: {
    color: colors.success,
  },
  correctionIndexTextWrong: {
    color: colors.danger,
  },
  correctionRowBody: {
    flex: 1,
  },
  correctionRowQuestion: {
    fontFamily: 'Poppins-Bold',
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink,
  },
  correctionRowStatus: {
    marginTop: 2,
    fontFamily: 'Poppins-Bold',
    fontSize: 11,
  },
  correctionRowStatusCorrect: {
    color: colors.success,
  },
  correctionRowStatusWrong: {
    color: colors.danger,
  },
  reviewNav: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 20 },
  reviewNavBtn: { flex: 1, height: 52, borderRadius: 26, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E5E7EB', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  reviewNavBtnPrimary: { backgroundColor: colors.brand, borderColor: colors.brand },
  reviewNavBtnText: { fontFamily: 'Poppins-Bold', fontSize: 14, color: '#374151' },
  navBtnDisabled: { opacity: 0.45 },
  reviewPad: { paddingVertical: 20 },
  reviewSummaryBox: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  reviewSummaryTitle: { fontFamily: 'Poppins-Bold', fontSize: 18, color: '#111827', marginBottom: 12 },
  reviewSummaryGrid: { flexDirection: 'row', gap: 12 },
  reviewSummaryItem: { flex: 1, backgroundColor: '#F9FAFB', borderRadius: 14, padding: 12 },
  reviewSummaryLabel: { fontFamily: 'Poppins-Bold', fontSize: 10, color: '#6B7280', textTransform: 'uppercase', marginBottom: 4 },
  reviewSummaryValue: { fontFamily: 'Poppins-Bold', fontSize: 12, color: '#111827' },
  emptyReviewBox: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, alignItems: 'center', marginBottom: 20 },
  emptyReviewTitle: { fontFamily: 'Poppins-Bold', fontSize: 18, color: '#111827', marginBottom: 8 },
  emptyReviewText: { fontFamily: 'Poppins-Medium', fontSize: 14, color: '#6B7280', textAlign: 'center' },
});
