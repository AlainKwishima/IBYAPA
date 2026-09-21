import { AppText } from './AppText';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, DeviceEventEmitter, Image, PanResponder, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNetworkStatus } from '../context/NetworkStatusContext';
import { useI18n } from '../i18n/useI18n';
import { colors, radii, shadows, spacing, typography } from '../constants/theme';
import { useResponsiveMetrics } from '../utils/responsive';
import { OFFLINE_REQUEST_FAILED_EVENT } from '../services/api/client';

export function OfflineBanner() {
  const { isConnected, isInternetReachable, refresh } = useNetworkStatus();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const r = useResponsiveMetrics();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-12)).current;
  const wasOffline = useRef(false);
  const [visible, setVisible] = useState(false);
  const offline = !isConnected || isInternetReachable === false;

  useEffect(() => {
    if (!offline) {
      wasOffline.current = false;
      setVisible(false);
      return;
    }

    if (!wasOffline.current) {
      wasOffline.current = true;
      setVisible(true);
    }
  }, [offline]);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(OFFLINE_REQUEST_FAILED_EVENT, () => {
      wasOffline.current = true;
      setVisible(true);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const animation = Animated.parallel([
      Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: visible ? 220 : 160, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: visible ? 0 : -12, duration: visible ? 220 : 160, useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [opacity, translateY, visible]);

  const dismiss = useCallback(() => {
    setVisible(false);
  }, []);

  const handleRetry = useCallback(() => {
    dismiss();
    void refresh();
  }, [dismiss, refresh]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_, gesture) => {
          if (gesture.dy < 0) translateY.setValue(gesture.dy);
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy < -32 || gesture.vy < -0.5) {
            dismiss();
            return;
          }
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
        },
      }),
    [dismiss, translateY],
  );

  if (!visible) return null;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Animated.View
        {...panResponder.panHandlers}
        accessibilityLiveRegion="polite"
        style={[
          styles.toastMotion,
          {
            top: insets.top + r.verticalScale(72),
            left: r.scale(spacing.md),
            right: r.scale(spacing.md),
            opacity,
            transform: [{ translateY }],
          },
        ]}
      >
        <TouchableOpacity onPress={dismiss} activeOpacity={0.9} style={[styles.toast, { borderRadius: r.radius(radii.lg), padding: r.scale(spacing.sm) }]}>
          <Image
            source={require('../assets/offline-no-wifi.png')}
            style={{ width: r.scale(42), height: r.scale(42), borderRadius: r.radius(10) }}
            accessibilityIgnoresInvertColors
            accessibilityLabel={t('error.offlineTitle')}
          />
          <View style={[styles.copy, { marginLeft: r.scale(spacing.sm) }]}>
            <AppText style={[styles.title, { fontSize: r.font(13), lineHeight: r.lineHeight(13) }]}>
              {t('error.offlineTitle')}
            </AppText>
            <AppText style={[styles.body, { marginTop: r.verticalScale(2), fontSize: r.font(11), lineHeight: r.lineHeight(11) }]}>
              {t('error.offlineBody')}
            </AppText>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('common.retry')}
            onPress={handleRetry}
            style={[styles.retry, { minHeight: r.touch(44), paddingHorizontal: r.scale(spacing.sm), borderRadius: r.radius(radii.md) }]}
            activeOpacity={0.8}
          >
            <AppText style={[styles.retryText, { fontSize: r.font(12), lineHeight: r.lineHeight(12) }]}>{t('common.retry')}</AppText>
          </TouchableOpacity>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  toastMotion: {
    position: 'absolute',
    zIndex: 100,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.floating,
  },
  copy: {
    flex: 1,
  },
  title: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  body: {
    ...typography.caption,
    color: colors.textMuted,
  },
  retry: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  retryText: {
    ...typography.bodyStrong,
    color: colors.white,
  },
});
