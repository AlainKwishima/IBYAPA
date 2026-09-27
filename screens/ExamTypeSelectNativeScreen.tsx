import React, { useEffect } from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { RootStackParamList } from '../navigation/types';
import { ScreenColumn } from '../components/ScreenColumn';
import { AppHeader } from '../components/AppHeader';
import { BottomNavBar } from '../components/BottomNavBar';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { useAppFlow } from '../context/AppFlowContext';
import { useGateModal } from '../context/GateModalContext';
import { useI18n } from '../i18n/useI18n';
import { colors, radii, spacing, typography } from '../constants/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ExamTypeSelectNative'>;

export function ExamTypeSelectNativeScreen({ navigation, route }: Props) {
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

  const examTypes = [
    {
      mode: 'traffic' as const,
      title: t('examType.mixed.title'),
      subtitle: t('examType.mixed.subtitle'),
      description: t('examType.mixed.desc'),
      badge: t('examType.mixed.badge'),
      color: colors.brand,
      background: colors.brandSoft,
    },
    {
      mode: 'signs' as const,
      title: t('examType.signs.title'),
      subtitle: t('examType.signs.subtitle'),
      description: t('examType.signs.desc'),
      badge: t('examType.signs.badge'),
      color: colors.success,
      background: colors.successSoft,
    },
  ];

  const selectExam = (mode: 'traffic' | 'signs') => {
    if (!hasSubscription && !trialAccess) {
      if (!isSigningOut) {
        openGateModal('subscription_exam', () => navigation.navigate('SubscriptionNative'));
      }
      return;
    }
    navigation.navigate('ExamNative', { mode, trial: trialAccess });
  };

  return (
    <ScreenColumn>
      <AppHeader
        title={t('examType.title')}
        onBack={() => navigation.goBack()}
        navigation={navigation}
        truncateTitle={false}
      />

      <View style={styles.body}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: tabScrollBottomPad + spacing.xl }]}
        >
          <View style={styles.selectorPanel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>{t('examType.subtitle')}</Text>
              <Text style={styles.panelBody}>{t('examType.info')}</Text>
            </View>

            <View style={styles.choiceList}>
              {examTypes.map((type) => (
                <Pressable
                  key={type.mode}
                  style={({ pressed }) => [styles.choiceRow, pressed ? styles.choiceRowActive : styles.choiceRowDefault]}
                  onPress={() => selectExam(type.mode)}
                >
                  {({ pressed }) => (
                    <>
                  <View style={styles.choiceMain}>
                    <View style={styles.choiceTitleLine}>
                      <Text style={[styles.choiceTitle, pressed && styles.choiceTitleActive]}>{type.title}</Text>
                      <Text style={[styles.choiceBadge, { color: type.color, backgroundColor: type.background }]}>
                        {type.badge}
                      </Text>
                    </View>
                    <Text style={[styles.choiceSubtitle, pressed && styles.choiceTextOnActive]}>{type.subtitle}</Text>
                    <Text style={[styles.choiceDescription, pressed && styles.choiceTextOnActive]}>
                      {type.description}
                    </Text>
                  </View>
                  <Ionicons name="arrow-forward" size={19} color={pressed ? colors.white : colors.brandStrong} />
                    </>
                  )}
                </Pressable>
              ))}
            </View>

            <View style={styles.footerNote}>
              <Text style={styles.footerText}>{hasSubscription ? t('examType.subtitle') : t('examType.hint')}</Text>
            </View>
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
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  selectorPanel: {
    overflow: 'hidden',
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  panelHeader: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    backgroundColor: colors.brand,
  },
  panelTitle: {
    ...typography.title,
    color: colors.white,
  },
  panelBody: {
    ...typography.caption,
    marginTop: spacing.xs,
    color: '#EFF6FF',
  },
  choiceList: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  choiceRow: {
    minHeight: 132,
    padding: spacing.lg,
    borderRadius: radii.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
  },
  choiceRowActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  choiceRowDefault: {
    backgroundColor: colors.white,
    borderColor: colors.line,
  },
  choiceMain: {
    flex: 1,
  },
  choiceTitleLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  choiceTitle: {
    ...typography.title,
    flex: 1,
    color: colors.ink,
  },
  choiceTitleActive: {
    color: colors.white,
  },
  choiceBadge: {
    ...typography.caption,
    overflow: 'hidden',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
    fontFamily: 'Poppins-ExtraBold',
  },
  choiceSubtitle: {
    ...typography.caption,
    marginTop: spacing.xs,
    color: colors.inkSoft,
  },
  choiceDescription: {
    ...typography.body,
    marginTop: spacing.sm,
    color: colors.inkMuted,
  },
  choiceTextOnActive: {
    color: '#EFF6FF',
  },
  footerNote: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  footerText: {
    ...typography.caption,
    color: colors.inkMuted,
  },
});
