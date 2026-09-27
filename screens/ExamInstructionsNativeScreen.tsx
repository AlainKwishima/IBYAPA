import React, { useEffect } from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { BottomNavBar } from '../components/BottomNavBar';
import { AppHeader } from '../components/AppHeader';
import { ScreenColumn } from '../components/ScreenColumn';
import { useAppFlow } from '../context/AppFlowContext';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { useGateModal } from '../context/GateModalContext';
import { RootStackParamList } from '../navigation/types';
import { useI18n } from '../i18n/useI18n';
import { colors, radii, shadows, spacing, typography } from '../constants/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ExamInstructionsNative'>;

const GUIDE_KEYS = [
  'examInstructions.guide1',
  'examInstructions.guide2',
  'examInstructions.guide3',
  'examInstructions.guide4',
] as const;

export function ExamInstructionsNativeScreen({ navigation, route }: Props) {
  const { t } = useI18n();
  const { tabScrollBottomPad } = useResponsiveLayout();
  const { hasSubscription, hasUsedFreeTrial, isSigningOut } = useAppFlow();
  const { openGateModal } = useGateModal();
  const trialAccess = route.params?.trial === true && !hasUsedFreeTrial;

  useEffect(() => {
    if (hasSubscription || trialAccess || isSigningOut) return;
    openGateModal(
      'subscription_exam',
      () => navigation.navigate('SubscriptionNative'),
      () => navigation.replace('HomeNative'),
    );
  }, [hasSubscription, isSigningOut, navigation, openGateModal, trialAccess]);

  const startExam = () => {
    if (!hasSubscription && !trialAccess) {
      if (!isSigningOut) {
        openGateModal('subscription_exam', () => navigation.navigate('SubscriptionNative'));
      }
      return;
    }
    navigation.navigate('ExamTypeSelectNative', trialAccess ? { trial: true } : undefined);
  };

  return (
    <ScreenColumn>
      <AppHeader
        title={t('examInstructions.title')}
        onBack={() => navigation.goBack()}
        navigation={navigation}
        truncateTitle={false}
      />

      <View style={styles.body}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: tabScrollBottomPad + spacing.xl }]}
        >
          <View style={styles.webIntroCard}>
            <View style={styles.webIntroHeader}>
              <Text style={styles.webIntroTitle}>{t('examInstructions.webHeroTitle')}</Text>
            </View>
            <View style={styles.webIntroBody}>
              <Text style={styles.webIntroText}>{t('examInstructions.webHeroBody')}</Text>
              <TouchableOpacity style={styles.startButton} onPress={startExam} activeOpacity={0.88}>
                <Text style={styles.startText}>{t('examInstructions.webHeroCta')}</Text>
                <Ionicons name="arrow-forward" size={18} color={colors.white} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.guideCard}>
            <View style={styles.guideHeading}>
              <Text style={styles.guideTitle}>{t('examInstructions.guidelinesTitle')}</Text>
              <Ionicons name="list-outline" size={20} color={colors.brandStrong} />
            </View>
            {GUIDE_KEYS.map((key, index) => (
              <View key={key} style={styles.guideRow}>
                <View style={styles.guideNumber}>
                  <Ionicons name="checkmark" size={15} color={colors.brandStrong} />
                </View>
                <Text style={styles.guideText}>{t(key)}</Text>
              </View>
            ))}
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
  webIntroCard: {
    overflow: 'hidden',
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadows.card,
  },
  webIntroHeader: {
    minHeight: 72,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    backgroundColor: colors.primary,
  },
  webIntroTitle: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 17,
    lineHeight: 24,
    color: colors.white,
  },
  webIntroBody: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    alignItems: 'center',
  },
  webIntroText: {
    ...typography.body,
    alignSelf: 'stretch',
    color: colors.textPrimary,
  },
  startButton: {
    minHeight: 44,
    minWidth: 132,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.brand,
  },
  startText: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 14,
    lineHeight: 20,
    color: colors.white,
  },
  guideCard: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  guideHeading: {
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  guideTitle: {
    ...typography.title,
    color: colors.ink,
  },
  guideRow: {
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  guideNumber: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSoft,
  },
  guideText: {
    ...typography.body,
    flex: 1,
    marginLeft: spacing.md,
    color: colors.inkMuted,
  },
});
