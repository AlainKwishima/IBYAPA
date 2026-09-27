import React, { useState } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { RootStackParamList } from '../navigation/types';
import { AppHeader } from '../components/AppHeader';
import { ScreenColumn } from '../components/ScreenColumn';
import { useAuth } from '../context/AuthContext';
import { colors } from '../constants/theme';
import { useI18n } from '../i18n/useI18n';

type Props = NativeStackScreenProps<RootStackParamList, 'CertificateWebViewer'>;

export function CertificateWebViewerScreen({ navigation, route }: Props) {
  const { title, url } = route.params;
  const { accessToken } = useAuth();
  const { t } = useI18n();
  const [isLoading, setIsLoading] = useState(true);

  const injectedScript = `
    (function() {
      try {
        var token = ${JSON.stringify(accessToken)};
        window.localStorage.setItem('token', token);
        window.localStorage.setItem('accessToken', token);
        window.localStorage.setItem('user_token', token);
        window.localStorage.setItem('jwt', token);
        document.cookie = "token=" + token + "; path=/; max-age=31536000";
        document.cookie = "jwt=" + token + "; path=/; max-age=31536000";
      } catch (e) {}
    })();
    true;
  `;

  return (
    <ScreenColumn>
      <AppHeader title={title || t('certificate.title')} onBack={() => navigation.goBack()} />
      <View style={styles.container}>
        <WebView
          source={{
            uri: url,
            headers: {
              Authorization: `Bearer ${accessToken}`,
              token: `Bearer ${accessToken}`,
            }
          }}
          injectedJavaScriptBeforeContentLoaded={injectedScript}
          injectedJavaScript={injectedScript}
          onLoadStart={() => setIsLoading(true)}
          onLoadEnd={() => setIsLoading(false)}
          style={styles.webview}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          javaScriptEnabled
          domStorageEnabled
        />
        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}
      </View>
    </ScreenColumn>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loadingOverlay: {
    ...(StyleSheet.absoluteFill as any),
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
});
