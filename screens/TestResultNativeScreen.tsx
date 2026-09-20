import React, { useEffect, useRef } from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';

import { RootStackParamList } from '../navigation/types';
import { useI18n } from '../i18n/useI18n';
import { AppHeader } from '../components/AppHeader';
import { ScreenColumn } from '../components/ScreenColumn';
import { colors, radii, shadows, spacing, typography } from '../constants/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const SUCCESS_SOUND = require('../assets/sounds/exam-success.wav');


type FailedProps = NativeStackScreenProps<RootStackParamList, 'TestFailedNative'>;
type PassedProps = NativeStackScreenProps<RootStackParamList, 'TestPassedNative'>;

function ScoreRing({ passed, percent }: { passed: boolean; percent: number }) {
  const size = 180;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: percent / 100,
      duration: 1500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [percent, progressAnim]);

  const strokeDashoffset = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  return (
    <View style={styles.ringWrap}>
      <Svg width={size} height={size} style={styles.ringSvg}>
        {/* Background Track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.line}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress Circle */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={passed ? colors.success : colors.danger}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.ringInner}>
        <Text style={styles.ringValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55}>{percent}</Text>
        <Text style={styles.ringPercent}>%</Text>
      </View>
    </View>
  );
}

function ResultTemplate({
  passed,
  score,
  time,
  percent,
  navigation,
  reviewParams,
  title,
}: {
  passed: boolean;
  score: string;
  time: string;
  percent: number;
  navigation: FailedProps['navigation'] | PassedProps['navigation'];
  reviewParams?: RootStackParamList['PerformanceReviewNative'];
  title?: string;
}) {
  const { t } = useI18n();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const successSound = useAudioPlayer(passed ? SUCCESS_SOUND : null);
  const hasPlayedSuccessSound = useRef(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  useEffect(() => {
    if (!passed || hasPlayedSuccessSound.current) return;
    hasPlayedSuccessSound.current = true;
    successSound.volume = 0.55;
    void setAudioModeAsync({
      playsInSilentMode: false,
      interruptionMode: 'mixWithOthers',
    }).catch(() => {
      // The result screen remains fully usable if audio focus is unavailable.
    });
    successSound.play();
  }, [passed, successSound]);

  const returnToExamInstructions = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'ExamInstructionsNative' }],
    });
  };

  return (
    <ScreenColumn>
      <AppHeader
        title={t('test.results')}
        onBack={returnToExamInstructions}
        truncateTitle={false}
      />

      <View style={styles.body}>
        <Animated.View
          style={[
            styles.content,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
        {passed ? (
          <View style={styles.celebrationRow}>
            <View style={styles.celebrationDot} />
            <Text style={styles.celebrationText}>{t('test.passedHeadline')}</Text>
            <View style={styles.celebrationDot} />
          </View>
        ) : null}
        <View style={[styles.outcomeIcon, passed ? styles.outcomeIconPass : styles.outcomeIconFail]}>
          <Ionicons
            name={passed ? 'checkmark' : 'refresh'}
            size={30}
            color={passed ? colors.green : colors.red}
          />
        </View>
        <Text style={[styles.headline, { color: passed ? colors.green : colors.red }]}>
          {passed ? t('test.passedHeadline') : t('test.failedHeadline')}
        </Text>

        <ScoreRing passed={passed} percent={percent} />

        <Text style={styles.mainTitle}>{passed ? t('test.passedTitle') : t('test.failedTitle')}</Text>
        {title ? <Text style={styles.examTitle}>{title}</Text> : null}

        <View style={styles.statsCard}>
          <View style={styles.statCol}>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{score}</Text>
            <Text style={styles.statLabel}>{t('test.results').toUpperCase()}</Text>
          </View>
          <View style={styles.dividerVertical} />
          <View style={styles.statCol}>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{time}</Text>
            <Text style={styles.statLabel}>{t('test.time').toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: passed ? colors.green : colors.red }]}
            onPress={() =>
              navigation.navigate(
                'PerformanceReviewNative',
                reviewParams,
              )
            }
          >
            <Text style={styles.primaryText}>{t('performance.reviewCorrection')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => navigation.navigate('ExamInstructionsNative')}
          >
            <Text style={styles.secondaryText}>{t('test.retakeExam')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tertiaryBtn}
            onPress={() => navigation.navigate('HomeNative')}
          >
            <Text style={styles.tertiaryText}>{t('test.home')}</Text>
          </TouchableOpacity>
        </View>
        </Animated.View>
      </View>
    </ScreenColumn>
  );
}

export function TestFailedNativeScreen({ navigation, route }: FailedProps) {
  const correct = route.params?.correct ?? 7;
  const total = route.params?.total ?? 20;
  const time = route.params?.timeLabel ?? '0:00';
  const percent = route.params?.percent ?? Math.round((correct / Math.max(total, 1)) * 100);
  const reviewParams = { ...route.params, correct, total, timeLabel: time, percent, passed: false };
  return (
    <ResultTemplate
      passed={false}
      score={`${correct}/${total}`}
      time={time}
      percent={percent}
      navigation={navigation}
      reviewParams={reviewParams}
      title={route.params?.title}
    />
  );
}

export function TestPassedNativeScreen({ navigation, route }: PassedProps) {
  const correct = route.params?.correct ?? 18;
  const total = route.params?.total ?? 20;
  const time = route.params?.timeLabel ?? '0:00';
  const percent = route.params?.percent ?? Math.round((correct / Math.max(total, 1)) * 100);
  const reviewParams = { ...route.params, correct, total, timeLabel: time, percent, passed: true };
  return (
    <ResultTemplate
      passed
      score={`${correct}/${total}`}
      time={time}
      percent={percent}
      navigation={navigation}
      reviewParams={reviewParams}
      title={route.params?.title}
    />
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    backgroundColor: colors.canvas,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outcomeIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  celebrationRow: {
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  celebrationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.green,
  },
  celebrationText: {
    ...typography.eyebrow,
    color: colors.green,
    textTransform: 'uppercase',
  },
  outcomeIconPass: {
    backgroundColor: colors.greenSoft,
  },
  outcomeIconFail: {
    backgroundColor: colors.redSoft,
  },
  headline: {
    ...typography.eyebrow,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    textTransform: 'uppercase',
  },
  ringWrap: {
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringSvg: {
    position: 'absolute',
  },
  ringInner: {
    width: 148,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringValue: {
    maxWidth: 116,
    flexShrink: 1,
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 56,
    color: colors.ink,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  ringPercent: {
    fontFamily: 'Poppins-Bold',
    fontSize: 24,
    color: colors.inkMuted,
    marginLeft: 2,
    marginTop: 8, // Optical adjustment to align with the center/bottom of the number
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  mainTitle: {
    marginTop: 20,
    ...typography.heading,
    color: colors.ink,
    textAlign: 'center',
  },
  examTitle: {
    ...typography.body,
    marginTop: spacing.xs,
    color: colors.inkMuted,
    textAlign: 'center',
  },
  statsCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: 20,
    marginTop: 30,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    ...shadows.card,
  },
  statCol: {
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  statValue: {
    fontFamily: 'Poppins-Bold',
    fontSize: 20,
    maxWidth: '100%',
    flexShrink: 1,
    color: colors.ink,
    textAlign: 'center',
  },
  statLabel: {
    marginTop: 4,
    fontFamily: 'Poppins-Bold',
    fontSize: 10,
    color: colors.inkSoft,
    letterSpacing: 0.5,
  },
  dividerVertical: {
    width: 1,
    height: 40,
    backgroundColor: colors.line,
  },
  actions: {
    width: '100%',
    marginTop: 40,
    gap: 12,
  },
  primaryBtn: {
    height: 56,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  primaryText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 16,
    color: colors.white,
  },
  secondaryBtn: {
    height: 56,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 16,
    color: colors.inkMuted,
  },
  tertiaryBtn: {
    minHeight: 44,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tertiaryText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 14,
    color: colors.brand,
  },
});
