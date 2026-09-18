import { AppText } from '../components/AppText';
import React from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { REFERENCE_SCREENS, type ReferenceScreenKey } from '../assets/referenceScreens';
import { RootStackParamList } from '../navigation/types';
import { ScreenHeader } from '../components/ScreenHeader';
import { useAppFlow } from '../context/AppFlowContext';
import { useGateModal } from '../context/GateModalContext';
import { useI18n } from '../i18n/useI18n';
import { hasLanguageAccess } from '../utils/subscriptionAccess';
import { colors, radii, shadows, spacing, typography } from '../constants/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ScreensHub'>;

function hubScreenTitleKey(key: ReferenceScreenKey): string {
  return `hub.screen.${key}`;
}

export function ScreensHubScreen({ navigation }: Props) {
  const { t } = useI18n();
  const {
    hasSubscription,
    subscriptionLanguage,
    contentLanguage,
    isSigningOut,
  } = useAppFlow();
  const { openGateModal } = useGateModal();
  const languageAccessGranted = hasLanguageAccess({
    hasSubscription,
    subscriptionLanguage,
    contentLanguage,
  });

  const gateIfNeeded = (kind: 'exam' | 'read' | 'watch', next: () => void) => {
    if (kind === 'exam') {
      if (!isSigningOut && (!hasSubscription || !languageAccessGranted)) {
        openGateModal('subscription_exam', () => navigation.navigate('SubscriptionNative'));
        return;
      }
      next();
      return;
    }

    if (!languageAccessGranted && !isSigningOut) {
      openGateModal(kind === 'read' ? 'subscription_read' : 'subscription_watch', () => navigation.navigate('SubscriptionNative'));
      return;
    }
    next();
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title={t('hub.title')} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {REFERENCE_SCREENS.map((screen) => (
          <Pressable
            key={screen.key}
            style={styles.card}
            onPress={() => {
              if (screen.key === 'splash') {
                return;
              }
              if (screen.key === 'languageSelection') {
                navigation.navigate('LanguageSelection');
                return;
              }
              if (screen.key === 'login') {
                navigation.navigate('Login');
                return;
              }
              if (screen.key === 'createAccount') {
                navigation.navigate('CreateAccount');
                return;
              }
              if (screen.key === 'forgotPassword') {
                navigation.navigate('ForgotPassword');
                return;
              }
              if (screen.key === 'resetPassword') {
                navigation.navigate('ResetPassword');
                return;
              }
              if (screen.key === 'home') {
                navigation.navigate('HomeNative');
                return;
              }
              if (screen.key === 'exam') {
                gateIfNeeded('exam', () => navigation.navigate('ExamInstructionsNative'));
                return;
              }
              if (screen.key === 'startExam') {
                gateIfNeeded('exam', () => navigation.navigate('ExamInstructionsNative'));
                return;
              }
              if (screen.key === 'practiceNoSelected') {
                navigation.navigate('PracticeNoSelectedNative');
                return;
              }
              if (screen.key === 'practiceSelected') {
                navigation.navigate('PracticeSelectedNative');
                return;
              }
              if (screen.key === 'testFailed') {
                navigation.navigate('TestFailedNative');
                return;
              }
              if (screen.key === 'testPassed') {
                navigation.navigate('TestPassedNative');
                return;
              }
              if (screen.key === 'performance') {
                navigation.navigate('PerformanceNative');
                return;
              }
              if (screen.key === 'performanceReview') {
                navigation.navigate('PerformanceReviewNative');
                return;
              }
              if (screen.key === 'readingDocument') {
                gateIfNeeded('read', () => navigation.navigate('ReadingNative'));
                return;
              }
              if (screen.key === 'helpCenter') {
                navigation.navigate('HelpCenterNative');
                return;
              }
              if (screen.key === 'subscription') {
                navigation.navigate('SubscriptionNative');
                return;
              }
              if (screen.key === 'payment') {
                navigation.navigate('PaymentNative');
                return;
              }
              if (screen.key === 'profile') {
                navigation.navigate('ProfileNative');
                return;
              }

              if (screen.key === 'videoCourseList') {
                gateIfNeeded('watch', () => navigation.navigate('VideoCourseList'));
                return;
              }
              if (screen.key === 'videoCoursePlayer') {
                gateIfNeeded('watch', () => navigation.navigate('VideoCoursePlayer'));
                return;
              }
              navigation.navigate('ReferenceImage', { key: screen.key });
            }}
          >
            <AppText style={styles.cardTitle}>{t(hubScreenTitleKey(screen.key))}</AppText>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  cardTitle: {
    ...typography.bodyStrong,
    color: colors.ink,
  },
});
