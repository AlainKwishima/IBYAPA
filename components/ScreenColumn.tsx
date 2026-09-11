import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useScreenColumnStyle } from '../hooks/useResponsiveLayout';
import { colors } from '../constants/theme';

type ScreenColumnProps = ViewProps & {
  backgroundColor?: string;
  children: React.ReactNode;
};

/**
 * Centered content column: full width up to a responsive max (phone vs tablet / desktop web).
 */
export function ScreenColumn({ backgroundColor, style, children, ...rest }: ScreenColumnProps) {
  const column = useScreenColumnStyle();
  return (
    <SafeAreaView style={[styles.base, backgroundColor != null && { backgroundColor }, style]} edges={['top', 'left', 'right']}>
      <View style={[styles.fill, column]} {...rest}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  base: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  fill: {
    flex: 1,
  },
});
