import React from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image, ImageResolvedAssetSource, ScrollView, StyleSheet } from 'react-native';

import { REFERENCE_BY_KEY } from '../assets/referenceScreens';
import { RootStackParamList } from '../navigation/types';
import { ScreenHeader } from '../components/ScreenHeader';
import { spacing } from '../constants/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { ScreenColumn } from '../components/ScreenColumn';

type Props = NativeStackScreenProps<RootStackParamList, 'ReferenceImage'>;

export function ReferenceImageScreen({ route, navigation }: Props) {
  const r = useResponsiveLayout();
  const screen = REFERENCE_BY_KEY[route.params.key];
  const imageWidth = Math.min(r.contentMaxWidth - r.scale(spacing.xl), r.scale(420));
  const resolved = Image.resolveAssetSource(screen.source) as ImageResolvedAssetSource | undefined;
  const aspectRatio = resolved?.width && resolved?.height ? resolved.width / resolved.height : 1125 / 2433;

  return (
    <ScreenColumn>
      <ScreenHeader title={screen.title} onBack={() => navigation.goBack()} />
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingHorizontal: r.scale(spacing.md), paddingBottom: r.verticalScale(spacing.xxl) }]}>
        <Image source={screen.source} style={{ width: imageWidth, maxWidth: '100%', aspectRatio }} resizeMode="contain" />
      </ScrollView>
    </ScreenColumn>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    alignItems: 'center',
  },
});
