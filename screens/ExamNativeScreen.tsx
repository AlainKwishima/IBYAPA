import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LottieView from 'lottie-react-native';

import { RootStackParamList, type ExamAnswerDetail, type ExamMode, type ExamResultParams } from '../navigation/types';
import { ScreenColumn } from '../components/ScreenColumn';
import { AppHeader } from '../components/AppHeader';
import { SkeletonBlock } from '../components/RequestStates';
import { useAppFlow } from '../context/AppFlowContext';
import { useAuth } from '../context/AuthContext';
import { useGateModal } from '../context/GateModalContext';
import { getExamQuestions, getSignQuestions, type TrafficQuestion } from '../services/trafficApi';
import { appendLocalExamRecord } from '../services/examHistoryStorage';
import { savePerformance } from '../services/performanceApi';
import { getMessageFromUnknownError } from '../services/api/client';
import { useI18n } from '../i18n/useI18n';
import { hasLanguageAccess, resolveExamLanguage } from '../utils/subscriptionAccess';
import { colors, radii, shadows, spacing, typography } from '../constants/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ExamNative'>;
type ExamDialogKind = 'exit' | 'unanswered' | 'timeout' | null;

const EXAM_LOADER_ANIMATION = require('../assets/animations/exam-loader.json');
const EXAM_DURATION_SEC = 20 * 60;
const EXAM_QUESTION_LIMIT = 20;
const PASS_PERCENT = 60;
const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

function formatTime(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function toExamTitle(mode: ExamMode): string {
  return mode === 'signs' ? 'Road Signs Only' : 'Mixed Questions';
}

function isValidTrafficQuestion(question: TrafficQuestion): boolean {
  return Boolean(
    question._id &&
      question.question?.description &&
      Array.isArray(question.options) &&
      question.options.length >= 2 &&
      question.options.some((option) => option.is_correct),
  );
}

function getQuestionExplanation(question: TrafficQuestion): string | null {
  const value =
    question.question?.explanation ??
    question.question?.feedback ??
    question.explanation ??
    question.feedback ??
    question.answerExplanation ??
    question.correction;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function ExamConfirmationModal({
  visible,
  icon,
  intent,
  title,
  body,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  confirmDisabled,
}: {
  visible: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  intent: 'danger' | 'warning' | 'info';
  title: string;
  body: string;
  cancelLabel?: string;
  confirmLabel: string;
  onCancel?: () => void;
  onConfirm: () => void;
  confirmDisabled?: boolean;
}) {
  const toneColor = intent === 'danger' ? colors.red : intent === 'warning' ? colors.brand : colors.green;
  const toneSoft = intent === 'danger' ? colors.redSoft : intent === 'warning' ? colors.brandSoft : colors.greenSoft;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel ?? onConfirm}>
      <Pressable style={styles.modalBackdrop} onPress={onCancel}>
        <View style={styles.modalShell}>
          <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
            <View style={[styles.modalIcon, { backgroundColor: toneSoft }]}>
              <Ionicons name={icon} size={28} color={toneColor} />
            </View>
            <Text style={styles.modalTitle}>{title}</Text>
            <Text style={styles.modalBody}>{body}</Text>
            <View style={styles.modalActions}>
              {cancelLabel && onCancel ? (
                <TouchableOpacity style={[styles.modalButton, styles.modalCancelButton]} onPress={onCancel} activeOpacity={0.78}>
                  <Text style={styles.modalCancelText}>{cancelLabel}</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.modalConfirmButton,
                  { backgroundColor: toneColor },
                  confirmDisabled && styles.modalButtonDisabled,
                ]}
                onPress={onConfirm}
                activeOpacity={0.84}
                disabled={confirmDisabled}
              >
                <Text style={styles.modalConfirmText}>{confirmLabel}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

export function ExamNativeScreen({ navigation, route }: Props) {
  const { t } = useI18n();
  const {
    hasSubscription,
    canChangeLanguage,
    subscriptionLanguage,
    contentLanguage,
    isSigningOut,
  } = useAppFlow();
  const { accessToken } = useAuth();
  const { openGateModal } = useGateModal();
  const mode = route.params?.mode ?? 'traffic';
  const examLanguage = resolveExamLanguage({
    hasSubscription,
    subscriptionLanguage,
    contentLanguage,
  });
  const languageAccessGranted = hasLanguageAccess({
    hasSubscription,
    canChangeLanguage,
    subscriptionLanguage,
    contentLanguage,
  });

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<TrafficQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(EXAM_DURATION_SEC);
  const [selectedByQuestion, setSelectedByQuestion] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [dialog, setDialog] = useState<ExamDialogKind>(null);
  const unansweredCountRef = useRef(0);
  const pendingNavigationActionRef = useRef<any>(null);
  const pendingTimeoutResultRef = useRef<ExamResultParams | null>(null);
  const questionNavRef = useRef<ScrollView>(null);
  const contentRef = useRef<ScrollView>(null);
  const startedAtRef = useRef(new Date().toISOString());
  const deadlineAtRef = useRef(0);
  const finishedRef = useRef(false);
  const timeoutSubmittedRef = useRef(false);
  const hasSubscriptionRef = useRef(hasSubscription);
  const languageAccessGrantedRef = useRef(languageAccessGranted);

  const totalQuestions = questions.length;
  const current = questions[questionIndex];
  const currentQuestionNumber = questionIndex + 1;
  const selectedId = selectedByQuestion[questionIndex];
  const answeredCount = Object.keys(selectedByQuestion).length;
  const progress = totalQuestions ? currentQuestionNumber / totalQuestions : 0;
  const canGoPrevious = questionIndex > 0;
  const canGoNext = questionIndex < totalQuestions - 1;
  const timerUrgent = secondsLeft <= 5 * 60;
  const isLocked = submitting || finishedRef.current;

  useEffect(() => {
    hasSubscriptionRef.current = hasSubscription;
    languageAccessGrantedRef.current = languageAccessGranted;
  }, [hasSubscription, languageAccessGranted]);

  const loadQuestions = useCallback(async () => {
    if (!hasSubscriptionRef.current || !languageAccessGrantedRef.current) {
      setQuestions([]);
      setLoadError(t('gate.subscription.exam'));
      setLoading(false);
      if (!isSigningOut) {
        openGateModal(
          'subscription_exam',
          () => navigation.replace('SubscriptionNative'),
          () => navigation.replace('HomeNative'),
        );
      }
      return;
    }

    if (!accessToken) {
      setLoadError(t('exam.needSignIn'));
      setQuestions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    setSubmitting(false);
    finishedRef.current = false;
    timeoutSubmittedRef.current = false;
    try {
      const data =
        mode === 'signs'
          ? await getSignQuestions(accessToken, examLanguage)
          : await getExamQuestions(accessToken, examLanguage);
      const nextQuestions = data.filter(isValidTrafficQuestion).slice(0, EXAM_QUESTION_LIMIT);
      if (nextQuestions.length < EXAM_QUESTION_LIMIT) {
        throw new Error(mode === 'signs' ? t('exam.signsUnavailable') : t('exam.incompleteQuestions'));
      }

      setQuestions(nextQuestions);
      setQuestionIndex(0);
      setSelectedByQuestion({});
      setSecondsLeft(EXAM_DURATION_SEC);
      startedAtRef.current = new Date().toISOString();
      deadlineAtRef.current = Date.now() + EXAM_DURATION_SEC * 1000;
    } catch (error) {
      setQuestions([]);
      setLoadError(getMessageFromUnknownError(error));
    } finally {
      setLoading(false);
    }
  }, [accessToken, examLanguage, isSigningOut, mode, navigation, openGateModal, t]);

  useEffect(() => {
    void loadQuestions();
  }, [loadQuestions]);

  useEffect(() => {
    if (loading || !current || finishedRef.current) return;
    const tick = () => {
      const remaining = Math.ceil((deadlineAtRef.current - Date.now()) / 1000);
      setSecondsLeft(Math.max(0, remaining));
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [current, loading]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (finishedRef.current || loading || loadError || questions.length === 0) return;
      event.preventDefault();
      pendingNavigationActionRef.current = event.data.action;
      setDialog('exit');
    });
    return unsubscribe;
  }, [loadError, loading, navigation, questions.length, t]);

  useEffect(() => {
    questionNavRef.current?.scrollTo({
      x: Math.max(0, questionIndex * 42 - 24),
      animated: true,
    });
    contentRef.current?.scrollTo({ y: 0, animated: true });
  }, [questionIndex]);

  const buildResult = useCallback((): ExamResultParams => {
    let correct = 0;
    const answerDetails: ExamAnswerDetail[] = questions.map((question, index) => {
      const selectedOption = question.options.find((option) => option._id === selectedByQuestion[index]);
      const correctOption = question.options.find((option) => option.is_correct);
      if (selectedOption?.is_correct) correct += 1;
      return {
        questionId: question._id,
        questionText: question.question.description,
        questionImageUrls: Array.isArray(question.question.imageURLs) ? question.question.imageURLs : [],
        options: question.options.map((option) => ({
          id: option._id,
          text: option.optionText,
          imageUrl: option.optionImageURL,
          isCorrect: Boolean(option.is_correct),
        })),
        selectedOptionId: selectedOption?._id ?? null,
        selectedOptionText: selectedOption?.optionText ?? null,
        correctOptionId: correctOption?._id ?? null,
        correctOptionText: correctOption?.optionText ?? null,
        explanation: getQuestionExplanation(question),
        isCorrect: Boolean(selectedOption?.is_correct),
      };
    });

    const total = Math.max(questions.length, 1);
    const percent = Math.round((correct / total) * 100);
    const finishedAt = new Date().toISOString();
    const elapsedSec = Math.min(EXAM_DURATION_SEC, Math.max(0, Math.round((Date.now() - Date.parse(startedAtRef.current)) / 1000)));
    return {
      mode,
      title: t(mode === 'signs' ? 'test.signsExamTitle' : 'test.mixedExamTitle'),
      correct,
      total,
      percent,
      passed: percent >= PASS_PERCENT,
      timeLabel: formatTime(elapsedSec),
      answeredCount: Object.keys(selectedByQuestion).length,
      startedAt: startedAtRef.current,
      finishedAt,
      elapsedSec,
      answerDetails,
    };
  }, [mode, questions, selectedByQuestion, t]);

  const navigateToResult = useCallback((result: ExamResultParams) => {
    finishedRef.current = true;
    if ((result.percent ?? 0) >= PASS_PERCENT) {
      navigation.navigate('TestPassedNative', result);
      return;
    }
    navigation.navigate('TestFailedNative', result);
  }, [navigation]);

  const submitExam = useCallback(async (source: 'manual' | 'timeout' = 'manual') => {
    if (finishedRef.current || submitting || questions.length === 0) return;
    setDialog(null);
    setSubmitting(true);
    const result = buildResult();

    try {
      await appendLocalExamRecord({
        correct: result.correct ?? 0,
        total: result.total ?? 1,
        percent: result.percent ?? 0,
        timeLabel: result.timeLabel ?? '0:00',
        mode,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
        elapsedSec: result.elapsedSec,
        answeredCount: result.answeredCount,
        answers: result.answerDetails ?? [],
      });
    } catch (error) {
      if (__DEV__) console.warn('[Exam] local performance save failed', error);
    }

    if (accessToken) {
      void savePerformance(accessToken, {
        examName: toExamTitle(mode),
        marks: result.percent ?? 0,
      }).catch((error) => {
        if (__DEV__) console.warn('[Exam] backend performance save failed', error);
      });
    }

    if (source === 'timeout') {
      pendingTimeoutResultRef.current = result;
      setDialog('timeout');
      return;
    }
    navigateToResult(result);
  }, [accessToken, buildResult, mode, navigateToResult, questions.length, submitting]);

  useEffect(() => {
    if (loading || !current || secondsLeft > 0 || timeoutSubmittedRef.current || finishedRef.current) return;
    timeoutSubmittedRef.current = true;
    void submitExam('timeout');
  }, [current, loading, secondsLeft, submitExam]);

  const selectOption = useCallback(
    (optionId: string) => {
      if (isLocked) return;
      setSelectedByQuestion((currentSelections) => ({
        ...currentSelections,
        [questionIndex]: optionId,
      }));
    },
    [isLocked, questionIndex],
  );

  const confirmSubmit = useCallback(() => {
    if (isLocked) return;
    const unanswered = totalQuestions - answeredCount;
    if (unanswered > 0) {
      unansweredCountRef.current = unanswered;
      setDialog('unanswered');
      return;
    }
    void submitExam('manual');
  }, [answeredCount, isLocked, submitExam, totalQuestions]);

  const closeExamDialog = useCallback(() => {
    if (isLocked && dialog === 'timeout') return;
    pendingNavigationActionRef.current = null;
    setDialog(null);
  }, [dialog, isLocked]);

  const confirmExit = useCallback(() => {
    const action = pendingNavigationActionRef.current;
    pendingNavigationActionRef.current = null;
    setDialog(null);
    finishedRef.current = true;
    if (action) {
      navigation.dispatch(action);
      return;
    }
    navigation.goBack();
  }, [navigation]);

  const confirmTimeout = useCallback(() => {
    const result = pendingTimeoutResultRef.current;
    pendingTimeoutResultRef.current = null;
    setDialog(null);
    if (result) {
      navigateToResult(result);
    }
  }, [navigateToResult]);

  const timer = (
    <View style={[styles.timerPill, timerUrgent && styles.timerPillUrgent]}>
      <Ionicons name="time-outline" size={17} color={timerUrgent ? colors.red : colors.white} />
      <Text style={[styles.timerText, timerUrgent && styles.timerTextUrgent]}>{formatTime(secondsLeft)}</Text>
    </View>
  );

  if (loading) {
    return (
      <ScreenColumn backgroundColor={colors.brandStrong}>
        <View style={styles.loadingState}>
          <View style={styles.loadingAnimationFrame}>
            <LottieView
              source={EXAM_LOADER_ANIMATION}
              autoPlay
              loop
              resizeMode="contain"
              style={styles.loadingAnimation}
            />
          </View>
          <Text style={styles.loadingTitle}>{t('exam.loading')}</Text>
          <Text style={styles.loadingBody}>{t('exam.loadingHint')}</Text>
        </View>
      </ScreenColumn>
    );
  }

  if (loadError || !current) {
    return (
      <ScreenColumn backgroundColor={colors.brandStrong}>
        <AppHeader title={t('exam.title')} onBack={() => navigation.goBack()} truncateTitle={false} />
        <View style={[styles.body, styles.errorBody]}>
          <View style={styles.errorIcon}>
            <Ionicons name="alert-circle-outline" size={32} color={colors.red} />
          </View>
          <Text style={styles.errorTitle}>{t('exam.noQuestions')}</Text>
          <Text style={styles.errorText}>{loadError ?? t('exam.loadError')}</Text>
          <View style={styles.errorActions}>
            <TouchableOpacity style={[styles.errorButton, styles.errorSecondaryButton]} onPress={() => navigation.goBack()}>
              <Text style={[styles.errorButtonText, styles.errorSecondaryText]}>{t('exam.goBack')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.errorButton} onPress={() => void loadQuestions()}>
              <Text style={styles.errorButtonText}>{t('exam.retry')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScreenColumn>
    );
  }

  const imageUri = current.question.imageURLs?.[0];

  return (
    <ScreenColumn backgroundColor={colors.brandStrong}>
      <AppHeader
        title={mode === 'signs' ? t('examType.signs.title') : t('exam.title')}
        onBack={() => navigation.goBack()}
        right={timer}
        truncateTitle={false}
      />

      <View style={styles.body}>
        <View style={styles.progressHeader}>
          <View>
            <Text style={styles.questionPosition}>
              {t('exam.questionPosition', { current: currentQuestionNumber, total: totalQuestions })}
            </Text>
            <Text style={styles.answeredLabel}>
              {t('exam.answeredCount', { answered: answeredCount, total: totalQuestions })}
            </Text>
          </View>
          <Text style={styles.progressPercent}>{Math.round(progress * 100)}%</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>

        <ScrollView
          ref={questionNavRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.questionNav}
          contentContainerStyle={styles.questionNavContent}
        >
          {questions.map((_, index) => {
            const active = index === questionIndex;
            const answered = Boolean(selectedByQuestion[index]);
            return (
              <TouchableOpacity
                key={`question-${index + 1}`}
                style={[
                  styles.questionChip,
                  answered && styles.questionChipAnswered,
                  active && styles.questionChipActive,
                  isLocked && styles.lockedControl,
                ]}
                onPress={() => !isLocked && setQuestionIndex(index)}
                activeOpacity={0.75}
                disabled={isLocked}
              >
                <Text
                  style={[
                    styles.questionChipText,
                    answered && styles.questionChipTextAnswered,
                    active && styles.questionChipTextActive,
                  ]}
                >
                  {index + 1}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <ScrollView
          ref={contentRef}
          style={styles.questionScroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.questionContent}
        >
          {submitting ? (
            <View style={styles.submittingBanner}>
              <SkeletonBlock style={styles.submittingSkeleton} />
              <Text style={styles.submittingText}>{t('common.loading')}</Text>
            </View>
          ) : null}

          <View style={styles.questionCard}>
            <View style={styles.questionLabelRow}>
              <Text style={styles.questionLabel}>{t('exam.question')}</Text>
              <Ionicons name="help-circle-outline" size={18} color={colors.brand} />
            </View>
            {imageUri ? (
              <View style={styles.imageStage}>
                <Image source={{ uri: imageUri }} style={styles.questionImage} resizeMode="contain" />
              </View>
            ) : null}
            <Text style={styles.questionText}>{current.question.description}</Text>
          </View>

          <Text style={styles.chooseLabel}>{t('exam.chooseAnswer')}</Text>
          <View style={styles.optionList}>
            {current.options.map((option, index) => {
              const selected = selectedId === option._id;
              return (
                <TouchableOpacity
                  key={option._id}
                  style={[styles.optionCard, selected && styles.optionCardSelected, isLocked && styles.lockedControl]}
                  onPress={() => selectOption(option._id)}
                  activeOpacity={0.82}
                  disabled={isLocked}
                >
                  <View style={[styles.optionMarker, selected && styles.optionMarkerSelected]}>
                    <Text style={[styles.optionMarkerText, selected && styles.optionMarkerTextSelected]}>
                      {OPTION_LABELS[index] ?? index + 1}
                    </Text>
                  </View>
                  <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                    {option.optionText}
                  </Text>
                  <Ionicons
                    name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={21}
                    color={selected ? colors.brand : '#6B7280'}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.navButton, (!canGoPrevious || isLocked) && styles.navButtonDisabled]}
            onPress={() => canGoPrevious && !isLocked && setQuestionIndex((index) => index - 1)}
            disabled={!canGoPrevious || isLocked}
          >
            <Ionicons name="arrow-back" size={19} color={canGoPrevious && !isLocked ? colors.ink : colors.inkSoft} />
            <Text style={[styles.navText, (!canGoPrevious || isLocked) && styles.navTextDisabled]}>{t('exam.previous')}</Text>
          </TouchableOpacity>

          {canGoNext ? (
            <TouchableOpacity
              style={[styles.navButton, styles.navButtonPrimary, isLocked && styles.navButtonDisabled]}
              onPress={() => !isLocked && setQuestionIndex((index) => index + 1)}
              disabled={isLocked}
            >
              <Text style={[styles.navText, styles.navTextPrimary]}>{t('exam.next')}</Text>
              <Ionicons name="arrow-forward" size={19} color={colors.white} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.navButton, styles.finishButton, isLocked && styles.navButtonDisabled]} onPress={confirmSubmit} disabled={isLocked}>
              <Text style={[styles.navText, styles.navTextPrimary]}>{t('exam.finish')}</Text>
              <Ionicons name="checkmark" size={19} color={colors.white} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ExamConfirmationModal
        visible={dialog === 'exit'}
        icon="exit-outline"
        intent="danger"
        title={t('exam.exitTitle')}
        body={t('exam.exitBody')}
        cancelLabel={t('common.cancel')}
        confirmLabel={t('exam.exitDiscard')}
        onCancel={closeExamDialog}
        onConfirm={confirmExit}
      />
      <ExamConfirmationModal
        visible={dialog === 'unanswered'}
        icon="help-circle-outline"
        intent="warning"
        title={t('exam.unansweredTitle')}
        body={t('exam.unansweredBody', { count: unansweredCountRef.current })}
        cancelLabel={t('exam.keepWorking')}
        confirmLabel={t('exam.finishAnyway')}
        onCancel={closeExamDialog}
        onConfirm={() => void submitExam('manual')}
        confirmDisabled={submitting}
      />
      <ExamConfirmationModal
        visible={dialog === 'timeout'}
        icon="time-outline"
        intent="info"
        title={t('exam.timeoutTitle')}
        body={t('exam.timeoutBody')}
        confirmLabel={t('common.ok')}
        onConfirm={confirmTimeout}
      />
    </ScreenColumn>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.62)',
  },
  modalShell: {
    width: '100%',
    maxWidth: 360,
  },
  modalCard: {
    padding: spacing.xxl,
    borderRadius: 22,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(221,226,234,0.92)',
    ...shadows.floating,
  },
  modalIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  modalTitle: {
    ...typography.screenTitle,
    color: colors.ink,
    textAlign: 'center',
  },
  modalBody: {
    ...typography.body,
    marginTop: spacing.sm,
    color: colors.inkMuted,
    textAlign: 'center',
  },
  modalActions: {
    width: '100%',
    marginTop: spacing.xxl,
    flexDirection: 'row',
    gap: spacing.md,
  },
  modalButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  modalCancelButton: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.line,
  },
  modalConfirmButton: {
    borderWidth: 1,
    borderColor: 'transparent',
  },
  modalButtonDisabled: {
    opacity: 0.58,
  },
  modalCancelText: {
    ...typography.bodyStrong,
    color: colors.inkMuted,
    textAlign: 'center',
  },
  modalConfirmText: {
    ...typography.bodyStrong,
    color: colors.white,
    textAlign: 'center',
  },
  loadingState: {
    flex: 1,
    paddingHorizontal: spacing.xxxl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandStrong,
  },
  loadingAnimationFrame: {
    width: 220,
    height: 220,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  loadingAnimation: {
    width: 190,
    height: 190,
  },
  loadingTitle: {
    ...typography.title,
    marginTop: spacing.lg,
    color: colors.white,
  },
  loadingBody: {
    ...typography.body,
    marginTop: spacing.sm,
    color: '#EFF6FF',
    textAlign: 'center',
  },
  body: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  errorBody: {
    paddingHorizontal: spacing.xxxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorIcon: {
    width: 66,
    height: 66,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.redSoft,
  },
  errorTitle: {
    ...typography.title,
    marginTop: spacing.lg,
    color: colors.ink,
    textAlign: 'center',
  },
  errorText: {
    ...typography.body,
    marginTop: spacing.sm,
    color: colors.inkMuted,
    textAlign: 'center',
  },
  errorActions: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    gap: spacing.md,
  },
  errorButton: {
    minHeight: 46,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
  },
  errorSecondaryButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  errorButtonText: {
    ...typography.bodyStrong,
    color: colors.white,
  },
  errorSecondaryText: {
    color: colors.ink,
  },
  timerPill: {
    minWidth: 76,
    height: 38,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  timerPillUrgent: {
    backgroundColor: colors.redSoft,
  },
  timerText: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 13,
    color: colors.white,
  },
  timerTextUrgent: {
    color: colors.red,
  },
  progressHeader: {
    paddingTop: spacing.md,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  questionPosition: {
    ...typography.title,
    color: colors.ink,
  },
  answeredLabel: {
    ...typography.caption,
    marginTop: 2,
    color: colors.inkMuted,
  },
  progressPercent: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 16,
    color: colors.brand,
  },
  progressTrack: {
    height: 5,
    marginTop: spacing.md,
    marginHorizontal: spacing.xl,
    overflow: 'hidden',
    borderRadius: 3,
    backgroundColor: '#E5E7EB',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.brand,
  },
  questionNav: {
    flexGrow: 0,
    marginTop: spacing.lg,
  },
  questionNavContent: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  questionChip: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  questionChipAnswered: {
    borderColor: '#2563EB',
    backgroundColor: colors.greenSoft,
  },
  questionChipActive: {
    borderColor: colors.brandStrong,
    backgroundColor: colors.brandStrong,
  },
  questionChipText: {
    ...typography.caption,
    fontFamily: 'Poppins-Bold',
    color: colors.inkMuted,
  },
  questionChipTextAnswered: {
    color: colors.green,
  },
  questionChipTextActive: {
    color: colors.white,
  },
  questionScroll: {
    flex: 1,
  },
  questionContent: {
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  submittingBanner: {
    minHeight: 44,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.brandSoft,
  },
  submittingSkeleton: {
    width: 42,
    height: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.brand,
  },
  submittingText: {
    ...typography.bodyStrong,
    color: colors.brandStrong,
  },
  questionCard: {
    padding: spacing.xl,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadows.card,
  },
  questionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  questionLabel: {
    ...typography.eyebrow,
    color: colors.brand,
    textTransform: 'uppercase',
  },
  imageStage: {
    height: 220,
    marginTop: spacing.lg,
    overflow: 'hidden',
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  questionImage: {
    width: '94%',
    height: '94%',
  },
  questionText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 17,
    lineHeight: 26,
    marginTop: spacing.lg,
    color: colors.ink,
  },
  chooseLabel: {
    ...typography.eyebrow,
    marginTop: spacing.xxl,
    color: colors.inkSoft,
    textTransform: 'uppercase',
  },
  optionList: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  optionCard: {
    minHeight: 66,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  optionCardSelected: {
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
  },
  optionMarker: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    marginTop: 2,
  },
  optionMarkerSelected: {
    backgroundColor: colors.brand,
  },
  optionMarkerText: {
    ...typography.bodyStrong,
    color: colors.inkMuted,
  },
  optionMarkerTextSelected: {
    color: colors.white,
  },
  optionText: {
    ...typography.body,
    flex: 1,
    marginHorizontal: spacing.md,
    color: colors.ink,
  },
  optionTextSelected: {
    fontFamily: 'Poppins-Bold',
    color: colors.brandStrong,
  },
  lockedControl: {
    opacity: 0.58,
  },
  footer: {
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
  navButton: {
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
  navButtonPrimary: {
    borderColor: colors.brand,
    backgroundColor: colors.brand,
  },
  finishButton: {
    borderColor: colors.green,
    backgroundColor: colors.green,
  },
  navButtonDisabled: {
    opacity: 0.45,
  },
  navText: {
    ...typography.bodyStrong,
    color: colors.ink,
  },
  navTextPrimary: {
    color: colors.white,
  },
  navTextDisabled: {
    color: colors.inkSoft,
  },
});
