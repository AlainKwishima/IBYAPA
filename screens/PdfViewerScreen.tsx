import { AppText } from '../components/AppText';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { RootStackParamList } from '../navigation/types';
import { AppHeader } from '../components/AppHeader';
import { ScreenColumn } from '../components/ScreenColumn';
import { PdfDocumentIcon } from '../components/PdfDocumentIcon';
import { EmptyState, InlineErrorState } from '../components/RequestStates';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/useI18n';
import { colors, radii, spacing, typography } from '../constants/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PdfViewer'>;
type PreviewState = 'loading' | 'ready' | 'error';

const PDF_JS_VERSION = '3.11.174';
const PDF_LOAD_TIMEOUT_MS = 30000;
const IS_WEB = Platform.OS === 'web';
const webFrameStyle = {
  borderWidth: 0,
  borderStyle: 'none',
  width: '100%',
  height: '100%',
  backgroundColor: colors.canvas,
} as const;

function buildSecurePreviewHtml(fileUrl: string, title: string, accessToken: string | null) {
  const safeUrl = JSON.stringify(fileUrl);
  const safeTitle = JSON.stringify(title);
  const safeAuthHeader = JSON.stringify(accessToken ? `Bearer ${accessToken}` : null);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, minimum-scale=0.75, maximum-scale=4, user-scalable=yes"
    />
    <title>${title.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</title>
    <style>
      :root {
        color-scheme: light only;
        --page-bg: #F9FAFB;
        --card-bg: #FFFFFF;
        --text-main: #111827;
        --text-muted: #6B7280;
        --watermark: rgba(107, 114, 128, 0.22);
        --shadow: 0 10px 28px rgba(15, 23, 42, 0.08);
      }
      * {
        box-sizing: border-box;
        -webkit-user-select: none;
        user-select: none;
        -webkit-touch-callout: none;
      }
      html, body {
        margin: 0;
        padding: 0;
        background: var(--page-bg);
        color: var(--text-main);
        font-family: Arial, Helvetica, sans-serif;
        overscroll-behavior: none;
      }
      body {
        min-height: 100vh;
      }
      #app {
        width: 100%;
        min-height: 100vh;
        padding: 16px 12px 28px;
      }
      #status {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        text-align: center;
        padding: 24px;
      }
      #statusTitle {
        margin-top: 12px;
        font-size: 18px;
        font-weight: 700;
      }
      #statusBody {
        margin-top: 8px;
        font-size: 14px;
        line-height: 1.6;
        color: var(--text-muted);
        max-width: 420px;
      }
      #pages {
        display: none;
      }
      .page-shell {
        position: relative;
        width: 100%;
        margin: 0 auto 18px;
        background: var(--card-bg);
        border-radius: 18px;
        padding: 14px;
        box-shadow: var(--shadow);
        overflow: hidden;
      }
      .page-frame {
        position: relative;
        width: 100%;
        overflow: hidden;
        border-radius: 12px;
        background: #FFFFFF;
      }
      canvas {
        display: block;
        width: 100%;
        height: auto;
      }
      .watermark {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        overflow: hidden;
      }
      .watermark-inner {
        display: flex;
        width: 92%;
        max-width: 92%;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        transform: rotate(-24deg);
        transform-origin: center;
      }
      .watermark span {
        display: block;
        width: 100%;
        text-align: center;
        color: var(--watermark);
        font-size: clamp(18px, 6.2vw, 30px);
        font-style: oblique;
        font-weight: 700;
        letter-spacing: 0.16em;
        line-height: 1.05;
        text-transform: uppercase;
        white-space: normal;
        overflow-wrap: normal;
      }
      .watermark span:first-child {
        margin-left: -18%;
      }
      .watermark span:last-child {
        margin-left: 18%;
      }
      .page-meta {
        margin-top: 10px;
        font-size: 11px;
        font-weight: 700;
        color: #6B7280;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        text-align: right;
      }
      .spinner {
        width: 40px;
        height: 40px;
        border: 4px solid #E5E7EB;
        border-top: 4px solid #3B82F6;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 24px;
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    </style>
  </head>
  <body>
    <div id="app">
      <div id="status">
        <div class="spinner"></div>
        <div id="statusTitle">Opening secure preview</div>
        <div id="statusBody">Preparing the document in-app. Please wait...</div>
      </div>
      <div id="pages" aria-label="Secure document preview"></div>
    </div>

    <script
      src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDF_JS_VERSION}/pdf.min.js"
      onload="window.__PDF_JS_LOADED__ = true"
      onerror="window.__PDF_JS_LOAD_FAILED__ = true"
    ></script>
    <script>
      (function () {
        var fileUrl = ${safeUrl};
        var title = ${safeTitle};
        var authHeader = ${safeAuthHeader};
        var status = document.getElementById('status');
        var statusTitle = document.getElementById('statusTitle');
        var statusBody = document.getElementById('statusBody');
        var pagesRoot = document.getElementById('pages');
        var pdfjsLib = window['pdfjs-dist/build/pdf'];

        function post(type, payload) {
          var message = JSON.stringify({ type: type, payload: payload || null });
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(message);
            return;
          }
          if (window.parent && window.parent !== window) {
            window.parent.postMessage(message, '*');
          }
        }

        post('startup', diagnosticPayload('Document viewer started'));

        function showError(message, extra) {
          status.style.display = 'flex';
          pagesRoot.style.display = 'none';
          statusTitle.textContent = 'Preview unavailable';
          statusBody.textContent = message;
          post('error', diagnosticPayload(message, extra));
        }

        function diagnosticPayload(message, extra) {
          return Object.assign({
            message: message,
            documentHost: (function () {
              try { return new URL(fileUrl).host; } catch (_) { return 'invalid-url'; }
            })(),
          }, extra || {});
        }

        function waitForNextFrame() {
          return new Promise(function (resolve) {
            window.requestAnimationFrame(function () {
              resolve();
            });
          });
        }

        function preventExtraction() {
          document.addEventListener('contextmenu', function (event) {
            event.preventDefault();
          });
          document.addEventListener('dragstart', function (event) {
            event.preventDefault();
          });
          document.addEventListener('copy', function (event) {
            event.preventDefault();
          });
          document.addEventListener('cut', function (event) {
            event.preventDefault();
          });
          document.addEventListener('keydown', function (event) {
            var key = (event.key || '').toLowerCase();
            if ((event.ctrlKey || event.metaKey) && (key === 's' || key === 'p' || key === 'u' || key === 'c')) {
              event.preventDefault();
            }
          });
        }

        async function renderDocument() {
          try {
            preventExtraction();
            if (window.__PDF_JS_LOAD_FAILED__) {
              throw new Error('The document reader script could not be loaded. Check your connection and try again.');
            }
            if (!pdfjsLib) {
              throw new Error('The document reader could not load. Check your connection and try again.');
            }

            var loadingTask = pdfjsLib.getDocument({
              url: fileUrl,
              withCredentials: false,
              httpHeaders: authHeader
                ? {
                    Authorization: authHeader,
                    token: authHeader,
                  }
                : undefined,
              disableWorker: true,
              disableAutoFetch: false,
              disableStream: false,
              disableRange: false,
              rangeChunkSize: 65536,
              isEvalSupported: false,
              stopAtErrors: true,
            });

            loadingTask.onProgress = function (progress) {
              if (!progress || !progress.total) return;
              var percent = Math.max(1, Math.min(99, Math.round((progress.loaded / progress.total) * 100)));
              statusBody.textContent = 'Downloading document... ' + percent + '%';
              post('download-progress', { percent: percent });
            };

            var pdf = await loadingTask.promise;
            pagesRoot.innerHTML = '';
            pagesRoot.style.display = 'block';
            status.style.display = 'none';

            for (var pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
              var page = await pdf.getPage(pageNumber);
              var viewport = page.getViewport({ scale: 1 });
              var availableWidth = Math.max(window.innerWidth - 52, 320);
              var scale = availableWidth / viewport.width;
              var scaledViewport = page.getViewport({ scale: scale });

              var shell = document.createElement('section');
              shell.className = 'page-shell';

              var frame = document.createElement('div');
              frame.className = 'page-frame';

              var canvas = document.createElement('canvas');
              var context = canvas.getContext('2d', { alpha: false });
              if (!context) {
                throw new Error('This device could not prepare the document canvas.');
              }

              var outputScale = Math.min(window.devicePixelRatio || 1, 1.6);
              canvas.width = Math.floor(scaledViewport.width * outputScale);
              canvas.height = Math.floor(scaledViewport.height * outputScale);
              canvas.style.width = scaledViewport.width + 'px';
              canvas.style.height = scaledViewport.height + 'px';

              context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
              await page.render({
                canvasContext: context,
                viewport: scaledViewport,
              }).promise;

              var watermark = document.createElement('div');
              watermark.className = 'watermark';
              var watermarkInner = document.createElement('div');
              watermarkInner.className = 'watermark-inner';
              var watermarkTop = document.createElement('span');
              watermarkTop.textContent = 'NKOTANYI';
              var watermarkBottom = document.createElement('span');
              watermarkBottom.textContent = 'DRIVING SCHOOL';
              watermarkInner.appendChild(watermarkTop);
              watermarkInner.appendChild(watermarkBottom);
              watermark.appendChild(watermarkInner);

              var meta = document.createElement('div');
              meta.className = 'page-meta';
              meta.textContent = title + '  Page ' + pageNumber + ' of ' + pdf.numPages;

              frame.appendChild(canvas);
              frame.appendChild(watermark);
              shell.appendChild(frame);
              shell.appendChild(meta);
              pagesRoot.appendChild(shell);

              if (pageNumber === 1) {
                post('first-page-ready', { totalPages: pdf.numPages });
              }
              post('progress', { page: pageNumber, total: pdf.numPages });
              if (page.cleanup) page.cleanup();
              await waitForNextFrame();
            }

            post('ready', { totalPages: pdf.numPages });
          } catch (error) {
            var message =
              error && error.message
                ? error.message
                : 'Unable to prepare this document for secure preview.';
            if (window.console && window.console.error) {
              window.console.error('[PdfViewerHTML] render failed', {
                name: error && error.name,
                code: error && error.code,
                status: error && error.status,
                message: message,
              });
            }
            showError(message, {
              name: error && error.name,
              code: error && error.code,
              status: error && error.status,
            });
          }
        }

        renderDocument();
      })();
    </script>
  </body>
</html>`;
}

function safeDocumentDiagnostics(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    const cleanPath = parsed.pathname.toLowerCase();
    const extensionMatch = cleanPath.match(/\.([a-z0-9]+)$/);
    return {
      protocol: parsed.protocol.replace(':', ''),
      host: parsed.host,
      extension: extensionMatch?.[1] ?? 'none',
    };
  } catch {
    return {
      protocol: 'invalid',
      host: 'invalid-url',
      extension: 'unknown',
    };
  }
}

export function PdfViewerScreen({ navigation, route }: Props) {
  const { title, url, allowExport } = route.params;
  const { t } = useI18n();
  const { accessToken } = useAuth();
  const webViewRef = useRef<WebView>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [previewState, setPreviewState] = useState<PreviewState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [progressLabel, setProgressLabel] = useState(t('pdf.preparing'));
  const [loadVersion, setLoadVersion] = useState(0);
  const [hasReadablePage, setHasReadablePage] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const fileName = (title || 'certificate').replace(/[^a-zA-Z0-9_-]/g, '_') + '.pdf';
      const destination = new FileSystem.File(FileSystem.Paths.cache, fileName);

      // Remove any previously cached copy so the download doesn't fail with DestinationAlreadyExists
      if (destination.exists) {
        destination.delete();
      }

      const downloadedFile = await FileSystem.File.downloadFileAsync(url, destination, {
        headers: accessToken
          ? { Authorization: `Bearer ${accessToken}`, token: `Bearer ${accessToken}` }
          : undefined,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(downloadedFile.uri, {
          mimeType: 'application/pdf',
          dialogTitle: title || 'Certificate',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert(t('common.error'), 'Sharing is not available on this device.');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Export failed';
      Alert.alert(t('common.error'), message);
    } finally {
      setIsExporting(false);
    }
  }, [accessToken, isExporting, title, url, t]);

  const shareButton = allowExport && previewState === 'ready' ? (
    <TouchableOpacity
      style={styles.shareBtn}
      onPress={handleExport}
      activeOpacity={0.7}
      disabled={isExporting}
    >
      {isExporting ? (
        <ActivityIndicator size="small" color={colors.white} />
      ) : (
        <Ionicons name="share-outline" size={22} color={colors.white} />
      )}
    </TouchableOpacity>
  ) : null;

  const sourceHtml = useMemo(
    () => buildSecurePreviewHtml(url, title || 'Document', accessToken),
    [accessToken, title, url],
  );

  const handleRetry = () => {
    setPreviewState('loading');
    setError(null);
    setProgressLabel(t('pdf.preparing'));
    setHasReadablePage(false);
    setLoadVersion((version) => version + 1);
  };

  const handleViewerMessage = (rawData?: string) => {
    try {
      const payload = JSON.parse(rawData ?? '{}') as {
        type?: string;
        payload?: {
          page?: number;
          total?: number;
          totalPages?: number;
          message?: string;
          percent?: number;
          documentHost?: string;
        } | null;
      };

      if (__DEV__) {
        console.log('[PdfViewer] event', {
          type: payload.type,
          page: payload.payload?.page,
          total: payload.payload?.total,
          percent: payload.payload?.percent,
          documentHost: payload.payload?.documentHost,
          message: payload.payload?.message,
        });
      }

      if (payload.type === 'download-progress' && payload.payload?.percent) {
        setPreviewState((state) => (state === 'ready' ? 'ready' : 'loading'));
        setProgressLabel(t('pdf.downloading', { percent: payload.payload.percent }));
        return;
      }

      if (payload.type === 'progress' && payload.payload?.page && payload.payload?.total) {
        setPreviewState((state) => (state === 'ready' ? 'ready' : 'loading'));
        setProgressLabel(t('pdf.rendering', { page: payload.payload.page, total: payload.payload.total }));
        return;
      }

      if (payload.type === 'first-page-ready') {
        setPreviewState('ready');
        setError(null);
        setHasReadablePage(true);
        return;
      }

      if (payload.type === 'ready') {
        setPreviewState('ready');
        setError(null);
        setHasReadablePage(true);
        return;
      }

      if (payload.type === 'error') {
        setPreviewState((state) => (state === 'ready' ? 'ready' : 'error'));
        setError(payload.payload?.message ?? t('pdf.previewErrorBody'));
      }
    } catch {
      setPreviewState('error');
      setError(t('pdf.previewErrorBody'));
    }
  };

  useEffect(() => {
    if (__DEV__) {
      console.log('[PdfViewer] opening document', {
        title,
        ...safeDocumentDiagnostics(url),
        hasAccessToken: Boolean(accessToken),
        strategy: IS_WEB ? 'pdfjs-srcdoc' : 'pdfjs-webview',
      });
    }
  }, [accessToken, title, url]);

  useEffect(() => {
    if (!IS_WEB || typeof window === 'undefined') return undefined;

    const onWindowMessage = (event: MessageEvent) => {
      if (typeof event.data === 'string') {
        handleViewerMessage(event.data);
      }
    };

    window.addEventListener('message', onWindowMessage);
    return () => window.removeEventListener('message', onWindowMessage);
  });

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (previewState === 'loading' && !hasReadablePage) {
      timeoutRef.current = setTimeout(() => {
        setPreviewState('error');
        setError(t('pdf.timeoutErrorBody'));
      }, PDF_LOAD_TIMEOUT_MS);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [hasReadablePage, previewState, t]);

  const handleMessage = (event: { nativeEvent: { data?: string } }) => {
    handleViewerMessage(event.nativeEvent.data);
  };

  return (
    <ScreenColumn>
      <AppHeader title={title || t('pdf.document')} onBack={() => navigation.goBack()} right={shareButton} />

      <View style={styles.bodyWrap}>
        {IS_WEB ? (
          React.createElement('iframe', {
            key: `${url}:${loadVersion}`,
            srcDoc: sourceHtml,
            title: title || t('pdf.document'),
            style: webFrameStyle,
            sandbox: 'allow-scripts allow-same-origin',
          })
        ) : (
          <WebView
            key={`${url}:${loadVersion}`}
            ref={webViewRef}
            source={{ html: sourceHtml, baseUrl: 'https://localhost/' }}
            style={styles.webview}
            originWhitelist={['https://*', 'http://*', 'about:blank']}
            javaScriptEnabled
            domStorageEnabled
            cacheEnabled
            startInLoadingState={false}
            setSupportMultipleWindows={false}
            allowsFullscreenVideo={false}
            allowFileAccess={false}
            allowFileAccessFromFileURLs={false}
            allowUniversalAccessFromFileURLs={false}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            scalesPageToFit={false}
            setBuiltInZoomControls
            setDisplayZoomControls={false}
            onMessage={handleMessage}
            onShouldStartLoadWithRequest={(request) => {
              const nextUrl = request.url || '';
              return (
                nextUrl === 'about:blank' ||
                nextUrl.startsWith('https://localhost/') ||
                nextUrl.startsWith('data:text/html') ||
                nextUrl.startsWith('https://') ||
                nextUrl.startsWith('http://')
              );
            }}
            onError={() => {
              if (__DEV__) console.log('[PdfViewer] webview_error');
              setPreviewState('error');
              setError(t('pdf.previewErrorBody'));
            }}
            onHttpError={(event) => {
              if (__DEV__) {
                console.log('[PdfViewer] webview_http_error', { statusCode: event.nativeEvent.statusCode });
              }
              setPreviewState('error');
              setError(t('pdf.httpErrorBody', { status: event.nativeEvent.statusCode }));
            }}
          />
        )}

        {previewState === 'loading' ? (
          <View style={styles.overlayCard}>
            <View style={styles.pdfLoadingIcon}>
              <PdfDocumentIcon size={68} />
            </View>
            <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 16 }} />
            <AppText style={styles.overlayTitle}>{t('pdf.opening')}</AppText>
            <AppText style={styles.overlayBody}>{progressLabel}</AppText>
          </View>
        ) : null}

        {previewState === 'error' ? (
          <View style={styles.overlayCard}>
            <View style={[styles.overlayIcon, styles.overlayIconError]}>
              <Ionicons name="alert-circle-outline" size={30} color={colors.red} />
            </View>
            <AppText style={styles.overlayTitle}>{t('pdf.previewErrorTitle')}</AppText>
            <AppText style={styles.overlayBody}>
              {error ?? t('pdf.previewErrorBody')}
            </AppText>
            <TouchableOpacity style={styles.retryBtn} onPress={handleRetry}>
              <AppText style={styles.retryText}>{t('common.retry')}</AppText>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </ScreenColumn>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  bodyWrap: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  webview: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  overlayCard: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    backgroundColor: colors.canvas,
    zIndex: 5,
  },
  overlayIcon: {
    width: 60,
    height: 60,
    marginBottom: spacing.lg,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSoft,
  },
  overlayIconError: {
    backgroundColor: colors.redSoft,
  },
  pdfLoadingIcon: {
    marginBottom: spacing.lg,
  },
  pdfSkeletonTitle: {
    width: 180,
    height: 14,
    borderRadius: radii.pill,
  },
  pdfSkeletonLine: {
    width: 230,
    height: 10,
    marginTop: spacing.md,
    borderRadius: radii.pill,
  },
  pdfSkeletonLineShort: {
    width: 154,
    height: 10,
    marginTop: spacing.sm,
    borderRadius: radii.pill,
  },
  overlayTitle: {
    marginTop: 12,
    ...typography.title,
    color: colors.ink,
    textAlign: 'center',
  },
  overlayBody: {
    marginTop: 8,
    textAlign: 'center',
    ...typography.body,
    color: colors.inkMuted,
  },
  retryBtn: {
    marginTop: 18,
    minHeight: 52,
    minWidth: 140,
    paddingHorizontal: 24,
    borderRadius: radii.pill,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  retryText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  shareBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
