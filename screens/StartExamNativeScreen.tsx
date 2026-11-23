import React, { useEffect, useRef } from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, View } from 'react-native';

import { useAppFlow } from '../context/AppFlowContext';
import { useGateModal } from '../context/GateModalContext';
import { useSubscriptionSheet } from '../context/SubscriptionSheetContext';
import { RootStackParamList } from '../navigation/types';
import { hasExamAccess, hasReadingAccess, hasVideoAccess } from '../utils/subscriptionAccess';
import { colors } from '../constants/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'StartExamNative'>;

export function StartExamNativeScreen({ navigation, route }: Props) {
  const openedRef = useRef(false);
  const {
    hasSubscription,
    canTakeExams,
    hasReadingAccess: readingEntitlement,
    hasVideoAccess: videoEntitlement,
    canChangeLanguage,
    subscriptionLanguage,
    contentLanguage,
    isSigningOut,
  } = useAppFlow();
  const { openGateModal } = useGateModal();
  const { openSubscriptionSheet } = useSubscriptionSheet();
  const examAccessGranted = hasExamAccess({
    hasSubscription,
    canTakeExams,
    canChangeLanguage,
    subscriptionLanguage,
    contentLanguage,
  });
  const readingAccessGranted = hasReadingAccess({
    hasSubscription,
    hasReadingAccess: readingEntitlement,
    subscriptionLanguage,
    contentLanguage,
  });
  const videoAccessGranted = hasVideoAccess({
    hasSubscription,
    hasVideoAccess: videoEntitlement,
    subscriptionLanguage,
    contentLanguage,
  });

  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;

    const gateFor = route.params?.gateFor ?? 'exam';
    const requiresSubscription =
      gateFor === 'exam'
        ? !examAccessGranted
        : gateFor === 'read'
          ? !readingAccessGranted
          : !videoAccessGranted;

    if (!requiresSubscription && gateFor === 'read') {
      navigation.replace('ReadingNative');
      return;
    }

    if (!requiresSubscription && gateFor === 'watch') {
      navigation.replace('VideoCourseList');
      return;
    }

    const kind =
      gateFor === 'read'
        ? 'subscription_read'
        : gateFor === 'watch'
          ? 'subscription_watch'
          : requiresSubscription
            ? 'subscription_exam'
            : 'exam_ready';

    if (!isSigningOut) {
      openGateModal(
        kind,
        () => {
          if (kind === 'subscription_exam' || kind === 'subscription_read' || kind === 'subscription_watch') {
            navigation.replace('HomeNative');
            openSubscriptionSheet();
            return;
          }
          if (gateFor === 'read') {
            navigation.replace('ReadingNative');
            return;
          }
          if (gateFor === 'watch') {
            navigation.replace('VideoCourseList');
            return;
          }
          navigation.replace('ExamInstructionsNative');
        },
        () => navigation.goBack(),
      );
    }
  }, [examAccessGranted, isSigningOut, navigation, openGateModal, readingAccessGranted, route.params?.gateFor, videoAccessGranted]);

  return <View style={styles.blank} />;
}

const styles = StyleSheet.create({
  blank: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
});
