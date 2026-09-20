import { AppText } from './AppText';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NavigationProp } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';

import type { RootStackParamList } from '../navigation/types';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { colors, spacing, typography } from '../constants/theme';
import { HeaderMenu } from './HeaderMenu';

type AppHeaderProps = {
  title: string;
  navigation?: NavigationProp<RootStackParamList>;
  onBack?: () => void;
  left?: React.ReactNode;
  right?: React.ReactNode;
  curveColor?: string;
  titleOffsetX?: number;
  /** When false, the title wraps naturally (used on exam flows). Defaults to true. */
  truncateTitle?: boolean;
};

export function AppHeader({
  title,
  navigation,
  onBack,
  left,
  right,
  curveColor = colors.canvas,
  titleOffsetX = 0,
  truncateTitle = true,
}: AppHeaderProps) {
  const { insets, scale, verticalScale, radius, touch, font, lineHeight } = useResponsiveLayout();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = React.useState(false);

  const refreshContent = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View style={[styles.root, { paddingHorizontal: scale(spacing.lg) }]}>
      <View style={[styles.row, { minHeight: verticalScale(54), paddingBottom: verticalScale(spacing.xs) }]}>
        <View style={[styles.side, { width: touch(44) }]}>
          {left ?? (onBack ? (
            <TouchableOpacity
              style={[styles.iconButton, { width: touch(44), height: touch(44) }]}
              onPress={onBack}
              activeOpacity={0.72}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Ionicons name="chevron-back" size={scale(24)} color={colors.white} />
            </TouchableOpacity>
          ) : null)}
        </View>
        <View style={[styles.titleStack, { paddingHorizontal: scale(spacing.sm) }, titleOffsetX !== 0 && { transform: [{ translateX: scale(titleOffsetX) }] }]}>
          {truncateTitle ? (
            <AppText style={[styles.title, { fontSize: font(18), lineHeight: lineHeight(18) }]} lines={1}>
              {title}
            </AppText>
          ) : (
            <Text style={[styles.title, { fontSize: font(18), lineHeight: lineHeight(18) }]}>{title}</Text>
          )}
        </View>
        <View style={[styles.side, styles.rightSide, { width: touch(right || !navigation ? 44 : 88) }]}>
          {right ?? (navigation ? (
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={[styles.iconButton, { width: touch(44), height: touch(44) }]}
                onPress={() => void refreshContent()}
                activeOpacity={0.72}
                disabled={refreshing}
                accessibilityRole="button"
                accessibilityLabel="Refresh"
              >
                {refreshing ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Ionicons name="refresh-outline" size={scale(21)} color={colors.white} />
                )}
              </TouchableOpacity>
              <HeaderMenu navigation={navigation} iconColor={colors.white} topOffset={verticalScale(52)} rightOffset={scale(18)} />
            </View>
          ) : null)}
        </View>
      </View>
      <View
        style={[
          styles.curveOverlay,
          {
            height: verticalScale(18),
            marginHorizontal: -scale(spacing.lg),
            borderTopLeftRadius: radius(24),
            borderTopRightRadius: radius(24),
            backgroundColor: curveColor,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.darkEmphasis,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  curveOverlay: {
    marginTop: 0,
  },
  side: {
    alignItems: 'flex-start',
  },
  rightSide: {
    alignItems: 'flex-end',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.screenTitle,
    color: colors.white,
    textAlign: 'center',
  },
  titleStack: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
