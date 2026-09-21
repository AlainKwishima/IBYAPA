import { AppText } from './AppText';
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NavigationProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RootStackParamList } from '../navigation/types';
import { MIN_TOUCH_TARGET } from '../constants/accessibility';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/useI18n';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { SignOutConfirmationModal } from './SignOutConfirmationModal';
import { colors, radii, shadows, typography } from '../constants/theme';

type HeaderMenuProps = {
  navigation: NavigationProp<RootStackParamList>;
  iconColor?: string;
  topOffset?: number;
  rightOffset?: number;
};

export function HeaderMenu({
  navigation,
  iconColor = colors.white,
  topOffset = 84,
  rightOffset = 14,
}: HeaderMenuProps) {
  const [open, setOpen] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const insets = useSafeAreaInsets();
  const { shortSide, scale, verticalScale, radius, touch, icon, font, lineHeight } = useResponsiveLayout();
  const { logout } = useAuth();
  const { t } = useI18n();
  const compact = shortSide <= 360;
  const dropdownWidth = scale(compact ? 170 : 186);
  const iconSize = icon(compact ? 20 : 22);

  const menuItems = useMemo(
    () => [
      { id: 'profile', labelKey: 'menu.profile' as const, route: 'ProfileNative' as const, icon: 'person-outline' as const },
      { id: 'subscription', labelKey: 'menu.subscription' as const, route: 'SubscriptionNative' as const, icon: 'card-outline' as const },
      { id: 'language', labelKey: 'menu.language' as const, route: 'LanguageSettings' as const, icon: 'language-outline' as const },
      { id: 'help', labelKey: 'menu.help' as const, route: 'HelpCenterNative' as const, icon: 'help-circle-outline' as const },
      { id: 'signout', labelKey: 'menu.signOut' as const, route: null, icon: 'log-out-outline' as const },
    ],
    [],
  );

  const onSelect = async (route: keyof RootStackParamList | null) => {
    setOpen(false);
    if (route === null) {
      setShowSignOutConfirm(true);
      return;
    }
    navigation.navigate(route as never);
  };

  return (
    <>
      <TouchableOpacity style={[styles.iconBtn, { minWidth: touch(MIN_TOUCH_TARGET), minHeight: touch(MIN_TOUCH_TARGET), borderRadius: radius(22) }]} onPress={() => setOpen(true)} activeOpacity={0.85}>
        <Ionicons name="menu" size={iconSize} color={iconColor} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View
            style={[
              styles.dropdown,
              {
                top: topOffset + insets.top,
                right: rightOffset + insets.right,
                width: dropdownWidth,
                maxHeight: verticalScale(320),
                borderRadius: radius(radii.lg),
              },
            ]}
          >
            <ScrollView
              style={styles.dropdownScroll}
              contentContainerStyle={styles.dropdownScrollContent}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {menuItems.map((item, idx) => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.menuItem, { minHeight: touch(MIN_TOUCH_TARGET), paddingHorizontal: scale(14) }, idx < menuItems.length - 1 && styles.menuItemDivider]}
                  onPress={() => void onSelect(item.route)}
                  activeOpacity={0.85}
                >
                  <Ionicons name={item.icon} size={icon(16)} color={colors.textSecondary} />
                  <AppText style={[styles.menuText, { marginLeft: scale(10), fontSize: font(14), lineHeight: lineHeight(14) }]}>{t(item.labelKey)}</AppText>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <SignOutConfirmationModal
        visible={showSignOutConfirm}
        onCancel={() => setShowSignOutConfirm(false)}
        onConfirm={async () => {
          setShowSignOutConfirm(false);
          await logout();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlaySoft,
  },
  dropdown: {
    position: 'absolute',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    ...shadows.floating,
  },
  dropdownScroll: {
    width: '100%',
  },
  dropdownScrollContent: {
    paddingVertical: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuItemDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  menuText: {
    ...typography.body,
    color: colors.ink,
  },
});
