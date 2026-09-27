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
        document.cookie = "token=" + token + "; domain=.ibyapa.com; path=/; max-age=31536000; Secure";
        document.cookie = "jwt=" + token + "; domain=.ibyapa.com; path=/; max-age=31536000; Secure";
        // Fallback for current domain just in case
        document.cookie = "token=" + token + "; path=/; max-age=31536000; Secure";
        document.cookie = "jwt=" + token + "; path=/; max-age=31536000; Secure";

        // Intercept Fetch
        var originalFetch = window.fetch;
        window.fetch = function() {
          var url = '';
          if (typeof arguments[0] === 'string') url = arguments[0];
          else if (arguments[0] && arguments[0].url) url = arguments[0].url;

          if (url.includes('/api/')) {
            arguments[1] = arguments[1] || {};
            arguments[1].headers = arguments[1].headers || {};
            if (arguments[1].headers instanceof Headers || (arguments[1].headers.set && typeof arguments[1].headers.set === 'function')) {
              arguments[1].headers.set('Authorization', 'Bearer ' + token);
            } else {
              arguments[1].headers['Authorization'] = 'Bearer ' + token;
            }
          }
          return originalFetch.apply(this, arguments);
        };

        // Intercept XHR
        var originalOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function() {
          this._url = arguments[1];
          return originalOpen.apply(this, arguments);
        };
        var originalSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function() {
          if (this._url && this._url.includes('/api/')) {
            this.setRequestHeader('Authorization', 'Bearer ' + token);
          }
          return originalSend.apply(this, arguments);
        };
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
