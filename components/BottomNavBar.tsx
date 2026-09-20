import { AppText } from './AppText';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, Keyboard, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NavigationProp, useRoute } from '@react-navigation/native';

import { RootStackParamList } from '../navigation/types';
import { MIN_TOUCH_TARGET } from '../constants/accessibility';
import { useAppFlow } from '../context/AppFlowContext';
import { useGateModal } from '../context/GateModalContext';
import { useI18n } from '../i18n/useI18n';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { hasLanguageAccess } from '../utils/subscriptionAccess';
import { colors, radii, shadows, typography } from '../constants/theme';

export type TabKey = 'home' | 'exam' | 'read' | 'watch' | 'performance';

type BottomNavBarProps = {
  navigation?: NavigationProp<RootStackParamList>;
  active?: TabKey;
  onPressTab?: (tab: TabKey) => void;
};

function resolveActive(routeName: string): TabKey | null {
  // Exam flow should remain highlighted throughout as requested
  const examRoutes = new Set([
    'ExamNative',
    'ExamInstructionsNative',
    'ExamTypeSelectNative',
    'StartExamNative',
    'PracticeNoSelectedNative',
    'PracticeSelectedNative',
    'TestFailedNative',
    'TestPassedNative',
  ]);

  if (examRoutes.has(routeName)) return 'exam';
  if (routeName === 'HomeNative') return 'home';
  if (routeName === 'ReadingNative') return 'read';
  if (routeName === 'VideoCourseList') return 'watch';
  if (routeName === 'PerformanceNative') return 'performance';

  return null;
}

export function BottomNavBar({ navigation, active, onPressTab }: BottomNavBarProps) {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    
    const showSub = Keyboard.addListener(showEvent, (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const route = useRoute();
  const { insets, shortSide, scale, verticalScale, radius, touch, font } = useResponsiveLayout();
  const { t } = useI18n();
  const { hasSubscription, canChangeLanguage, subscriptionLanguage, contentLanguage, isSigningOut } = useAppFlow();
  const { openGateModal } = useGateModal();
  const activeKey = active ?? resolveActive(route.name);
  const isCompact = shortSide <= 360;
  const isWidePhone = shortSide >= 412;
  const iconSize = scale(isCompact ? 20 : 22);
  const labelSize = font(isCompact ? 9 : isWidePhone ? 11 : 10, 0.25);
  const horizontalInset = scale(isCompact ? 8 : 14);
  const bottomPadding = Math.max(insets.bottom, Platform.OS === 'android' ? 4 : 0);
  const navLayerHeight = bottomPadding + verticalScale(68);
  const languageAccessGranted = hasLanguageAccess({
    hasSubscription,
    canChangeLanguage,
    subscriptionLanguage,
    contentLanguage,
  });

  const tabs = [
    { key: 'home' as const, labelKey: 'nav.home' as const, route: 'HomeNative' as const, icon: 'home-outline' as const },
    { key: 'exam' as const, labelKey: 'nav.exam' as const, route: 'ExamNative' as const, icon: 'clipboard-outline' as const },
    { key: 'read' as const, labelKey: 'nav.read' as const, route: 'ReadingNative' as const, icon: 'book-outline' as const },
    { key: 'watch' as const, labelKey: 'nav.watch' as const, route: 'VideoCourseList' as const, icon: 'play-circle-outline' as const },
    { key: 'performance' as const, labelKey: 'nav.performance' as const, shortLabelKey: 'nav.performanceShort' as const, route: 'PerformanceNative' as const, icon: 'analytics-outline' as const },
  ] as const;

  const onPress = (tab: TabKey, routeName: keyof RootStackParamList) => {
    if (onPressTab) {
      onPressTab(tab);
      return;
    }
    if (navigation) {
      if (tab === 'exam' && !isSigningOut && (!hasSubscription || !languageAccessGranted)) {
        openGateModal('subscription_exam', () => (navigation as any).navigate('SubscriptionNative'));
        return;
      }

      if (tab === 'exam') {
        (navigation as any).navigate('ExamInstructionsNative');
        return;
      }

      if ((tab === 'read' || tab === 'watch') && !languageAccessGranted && !isSigningOut) {
        openGateModal(tab === 'read' ? 'subscription_read' : 'subscription_watch', () => (navigation as any).navigate('SubscriptionNative'));
        return;
      }
      (navigation as any).navigate(routeName);
    }
  };

  if (keyboardHeight > 0 && Platform.OS === 'android') return null;

  return (
    <View pointerEvents="box-none" style={[styles.navLayer, { height: navLayerHeight }]} >
      <View
        style={[
          styles.tabs,
          {
            left: 0,
            right: 0,
            bottom: 0,
            minHeight: navLayerHeight,
            paddingBottom: bottomPadding + verticalScale(7),
            paddingHorizontal: scale(8),
            paddingTop: verticalScale(7),
            borderRadius: 0,
          },
        ]}
      >
        {tabs.map((tab) => {
          const isActive = tab.key === activeKey;
          const fullLabel = t(tab.labelKey);
          const label = 'shortLabelKey' in tab ? t(tab.shortLabelKey) : fullLabel;
          return (
            <Pressable
              key={tab.key}
              style={({ pressed }) => [styles.tab, { minWidth: touch(MIN_TOUCH_TARGET), minHeight: touch(MIN_TOUCH_TARGET) }, pressed && styles.tabPressed]}
              onPress={() => onPress(tab.key, tab.route)}
              accessibilityRole="button"
              accessibilityLabel={fullLabel}
              accessibilityState={{ selected: isActive }}
            >
              <View style={[styles.tabBubble, { width: scale(42), height: verticalScale(32), borderRadius: radius(18) }, isActive && styles.tabBubbleActive]}>
                <Ionicons name={tab.icon} size={iconSize} color={isActive ? colors.primary : colors.textMuted} />
              </View>
              <AppText style={[styles.tabText, { fontSize: labelSize, marginTop: verticalScale(1) }, isActive && styles.tabTextActive]} lines={1}>
                {label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  navLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
  },
  tabs: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  tabPressed: { opacity: 0.72 },
  tabBubble: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBubbleActive: { backgroundColor: colors.blueTint },
  tabText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.primary,
    fontFamily: 'Poppins-Bold',
  },
});
