import { AppText } from '../components/AppText';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useIsFocused } from '@react-navigation/native';
import { ActivityIndicator, Image, Linking, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useEvent } from 'expo';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';

import YouTubePlayer from '../components/YouTubePlayer';
import { RootStackParamList } from '../navigation/types';
import { useI18n } from '../i18n/useI18n';
import { BottomNavBar } from '../components/BottomNavBar';
import { AppHeader } from '../components/AppHeader';
import { ScreenColumn } from '../components/ScreenColumn';
import { LoadingState } from '../components/RequestStates';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { useAppFlow } from '../context/AppFlowContext';
import { useGateModal } from '../context/GateModalContext';
import { hasVideoAccess } from '../utils/subscriptionAccess';
import { extractYouTubeId } from '../utils/videoLinks';
import { colors, radii, shadows, spacing, typography } from '../constants/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'VideoCoursePlayer'>;

type VideoEntry = {
  _id?: string;
  title?: string;
  videoUrl?: string;
  thumbUri?: string;
  duration?: string;
};

type SmartPlayerProps = {
  url: string | undefined;
  thumbUri: string | undefined;
  active: boolean;
  onError: (msg: string, isEmbedDisabled?: boolean) => void;
};

function MediaPlaceholder({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.mediaPlaceholder, compact && styles.mediaPlaceholderCompact]}>
      <View style={[styles.mediaMark, compact && styles.mediaMarkCompact]}>
        <Ionicons name="play" size={compact ? 14 : 24} color={colors.white} />
      </View>
      {!compact ? <AppText style={styles.mediaPlaceholderText}>IBYAPA</AppText> : null}
    </View>
  );
}

function SmartVideoPlayer({ url, thumbUri, active, onError }: SmartPlayerProps) {
  const [loading, setLoading] = useState(Boolean(url));
  const ytId = extractYouTubeId(url);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const player = useVideoPlayer(ytId || !url ? null : { uri: url }, (instance) => {
    instance.loop = false;
    if (active) instance.play();
  });
  const statusEvent = useEvent(player, 'statusChange', { status: player.status });

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!url) {
      setLoading(false);
      return clearTimer;
    }

    setLoading(true);
    clearTimer();
    timeoutRef.current = setTimeout(() => {
      setLoading(false);
      onError('Timeout: The video took too long to load. Please check your connection or retry.');
    }, 30000);
    return clearTimer;
  }, [clearTimer, onError, url]);

  useEffect(() => {
    if (!url || ytId) return;
    if (active) {
      player.play();
    } else {
      player.pause();
      player.currentTime = 0;
    }
  }, [active, player, url, ytId]);

  useEffect(() => {
    if (statusEvent.status === 'loading') setLoading(true);
    if (statusEvent.status === 'readyToPlay') {
      clearTimer();
      setLoading(false);
    }
    if (statusEvent.status === 'error') {
      clearTimer();
      setLoading(false);
      onError('Unable to load this video.');
    }
  }, [clearTimer, onError, statusEvent.status]);

  const handleError = useCallback(
    (message: string) => {
      clearTimer();
      setLoading(false);
      const embedDisabled = /disabled embedding|embedded players|error 101|error 150|error 153/i.test(message);
      onError(message, embedDisabled);
    },
    [clearTimer, onError],
  );

  if (!url) {
    return (
      <View style={styles.player}>
        {thumbUri ? <Image source={{ uri: thumbUri }} style={styles.playerMedia} resizeMode="cover" /> : <MediaPlaceholder />}
        <View style={styles.playerShade} />
        <View style={styles.unavailableMark}>
          <Ionicons name="videocam-off-outline" size={28} color={colors.white} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.player}>
      {loading ? (
        <View style={styles.playerLoader}>
          {thumbUri ? <Image source={{ uri: thumbUri }} style={styles.playerMedia} resizeMode="cover" /> : <MediaPlaceholder />}
          <View style={styles.playerShade} />
          <ActivityIndicator size="large" color={colors.white} />
        </View>
      ) : null}

      {ytId ? (
        <YouTubePlayer
          height={230}
          videoId={ytId}
          play={active}
          onReady={() => {
            clearTimer();
            setLoading(false);
          }}
          onChangeState={(state: string) => {
            if (state === 'buffering') setLoading(true);
            if (state === 'playing' || state === 'paused' || state === 'video_cued') {
              clearTimer();
              setLoading(false);
            }
          }}
          onError={handleError}
        />
      ) : (
        <VideoView style={styles.playerMedia} player={player} nativeControls contentFit="contain" />
      )}
    </View>
  );
}

export function VideoCoursePlayerScreen({ navigation, route }: Props) {
  const { t } = useI18n();
  const { tabScrollBottomPad } = useResponsiveLayout();
  const isFocused = useIsFocused();
  const {
    hasSubscription,
    hasVideoAccess: videoEntitlement,
    subscriptionLanguage,
    contentLanguage,
    isSigningOut,
  } = useAppFlow();
  const { openGateModal } = useGateModal();
  const videoAccessGranted = hasVideoAccess({
    hasSubscription,
    hasVideoAccess: videoEntitlement,
    subscriptionLanguage,
    contentLanguage,
  });

  const allVideos: VideoEntry[] = route.params?.allVideos ?? [];
  const [currentIndex, setCurrentIndex] = useState(route.params?.currentIndex ?? 0);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [unavailableInApp, setUnavailableInApp] = useState(false);

  const current: VideoEntry =
    allVideos.length > 0
      ? allVideos[currentIndex] ?? allVideos[0]
      : { title: route.params?.title, videoUrl: route.params?.videoUrl };
  const title = current.title ?? t('video.playerTitle');
  const playerKey = `${current._id ?? current.videoUrl ?? title}:${currentIndex}`;
  const playlist = allVideos
    .map((video, index) => ({ video, index }))
    .filter(({ index }) => index !== currentIndex);

  const handlePlayerError = useCallback((message: string, embedDisabled?: boolean) => {
    setPlayerError(message);
    setUnavailableInApp(Boolean(embedDisabled));
  }, []);

  useEffect(() => {
    if (!videoAccessGranted && !isSigningOut) {
      openGateModal('subscription_watch', () => navigation.navigate('SubscriptionNative'));
    }
  }, [isSigningOut, navigation, openGateModal, videoAccessGranted]);

  if (!videoAccessGranted) {
    return (
      <ScreenColumn>
        <AppHeader title={t('video.playerTitle')} navigation={navigation} onBack={() => navigation.goBack()} />
        <View style={styles.centeredGate}>
          <LoadingState message={t('video.loading')} />
        </View>
      </ScreenColumn>
    );
  }

  return (
    <ScreenColumn>
      <AppHeader
        title={t('video.playerTitle')}
        navigation={navigation}
        onBack={() => navigation.goBack()}
      />

      <View style={styles.body}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: tabScrollBottomPad }]}
        >
          <View style={styles.playerCard}>
            {playerError ? (
              <View style={styles.errorState}>
                <View style={[styles.errorIcon, unavailableInApp && styles.warningIcon]}>
                  <Ionicons
                    name={unavailableInApp ? 'open-outline' : 'alert-circle-outline'}
                    size={27}
                    color={unavailableInApp ? colors.amber : colors.red}
                  />
                </View>
                <AppText style={styles.errorTitle}>
                  {t(unavailableInApp ? 'video.playbackUnavailable' : 'video.playbackError')}
                </AppText>
                <AppText style={styles.errorText} lines={null}>{playerError}</AppText>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={() => {
                    setPlayerError(null);
                    setUnavailableInApp(false);
                  }}
                  activeOpacity={0.82}
                >
                  <Ionicons name="refresh" size={17} color={colors.white} />
                  <AppText style={styles.retryText}>{t('common.retry')}</AppText>
                </TouchableOpacity>
                {unavailableInApp && current.videoUrl ? (
                  <TouchableOpacity
                    style={[styles.retryButton, styles.externalButton]}
                    onPress={() => {
                      Linking.openURL(current.videoUrl ?? '').catch(() => undefined);
                    }}
                    activeOpacity={0.82}
                  >
                    <Ionicons name="open-outline" size={17} color={colors.white} />
                    <AppText style={styles.retryText}>{t('video.openExternal')}</AppText>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : (
              <SmartVideoPlayer
                key={playerKey}
                url={current.videoUrl}
                thumbUri={current.thumbUri}
                active={isFocused}
                onError={handlePlayerError}
              />
            )}

            <View style={styles.nowPlaying}>
              <View style={styles.nowPlayingLabel}>
                <View style={styles.liveDot} />
                <AppText style={styles.eyebrow}>{t('video.nowPlaying')}</AppText>
              </View>
              <AppText style={styles.videoTitle} lines={2}>{title}</AppText>
              {!current.videoUrl ? <AppText style={styles.noUrl}>{t('video.noUrl')}</AppText> : null}
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <View>
              <AppText style={styles.sectionEyebrow}>{t('video.libraryTitle')}</AppText>
              <AppText style={styles.sectionTitle}>{t('video.upNext')}</AppText>
            </View>
            <View style={styles.countBadge}>
              <AppText style={styles.countText}>{playlist.length}</AppText>
            </View>
          </View>

          {playlist.length > 0 ? (
            playlist.map(({ video, index }, rowIndex) => (
              <TouchableOpacity
                key={`${video._id ?? index}-${rowIndex}`}
                style={styles.lessonCard}
                activeOpacity={0.84}
                onPress={() => {
                  setPlayerError(null);
                  setUnavailableInApp(false);
                  setCurrentIndex(index);
                }}
              >
                <View style={styles.thumbnail}>
                  {video.thumbUri ? (
                    <Image source={{ uri: video.thumbUri }} style={styles.thumbnailImage} resizeMode="cover" />
                  ) : (
                    <MediaPlaceholder compact />
                  )}
                  <View style={styles.smallPlay}>
                    <Ionicons name="play" size={11} color={colors.white} />
                  </View>
                </View>
                <View style={styles.lessonCopy}>
                  <AppText style={styles.lessonNumber}>
                    {t('video.lessonNumber', { number: index + 1 })}
                  </AppText>
                  <AppText style={styles.lessonTitle} lines={2}>
                    {video.title ?? t('video.lessonFallback', { n: index + 1 })}
                  </AppText>
                  <AppText style={styles.lessonMeta}>{video.duration ?? t('video.tapWatch')}</AppText>
                </View>
                <View style={styles.chevron}>
                  <Ionicons name="chevron-forward" size={18} color={colors.brand} />
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyPlaylist}>
              <Ionicons name="checkmark-circle-outline" size={32} color={colors.green} />
              <AppText style={styles.emptyPlaylistText}>{t('video.noOtherVideos')}</AppText>
            </View>
          )}
        </ScrollView>
      </View>

      <BottomNavBar navigation={navigation} />
    </ScreenColumn>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  centeredGate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gateText: {
    ...typography.body,
    marginTop: spacing.md,
    color: colors.inkMuted,
  },
  playerCard: {
    overflow: 'hidden',
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  player: {
    position: 'relative',
    width: '100%',
    height: 230,
    overflow: 'hidden',
    backgroundColor: colors.ink,
  },
  playerMedia: {
    width: '100%',
    height: '100%',
  },
  playerShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(20,33,58,0.42)',
  },
  playerLoader: {
    ...StyleSheet.absoluteFill,
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
  },

  unavailableMark: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 60,
    height: 60,
    marginTop: -30,
    marginLeft: -30,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  mediaPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandStrong,
  },
  mediaPlaceholderCompact: {
    backgroundColor: colors.brandMist,
  },
  mediaMark: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.amber,
    transform: [{ rotate: '-4deg' }],
  },
  mediaMarkCompact: {
    width: 32,
    height: 32,
    borderRadius: 11,
  },
  mediaPlaceholderText: {
    ...typography.eyebrow,
    marginTop: spacing.md,
    color: '#EFF6FF',
  },
  nowPlaying: {
    padding: spacing.xl,
  },
  nowPlayingLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  liveDot: {
    width: 7,
    height: 7,
    marginRight: spacing.sm,
    borderRadius: 4,
    backgroundColor: colors.green,
  },
  eyebrow: {
    ...typography.eyebrow,
    color: colors.green,
    textTransform: 'uppercase',
  },
  videoTitle: {
    ...typography.title,
    color: colors.ink,
  },
  noUrl: {
    ...typography.caption,
    marginTop: spacing.sm,
    color: colors.red,
  },
  errorState: {
    minHeight: 230,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    backgroundColor: colors.ink,
  },
  errorIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.redSoft,
  },
  warningIcon: {
    backgroundColor: colors.amberSoft,
  },
  errorTitle: {
    ...typography.title,
    marginTop: spacing.md,
    color: colors.white,
    textAlign: 'center',
  },
  errorText: {
    ...typography.caption,
    marginTop: spacing.sm,
    color: '#6B7280',
    textAlign: 'center',
  },
  retryButton: {
    minHeight: 44,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.brand,
  },
  externalButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.inkMuted,
  },
  retryText: {
    ...typography.bodyStrong,
    color: colors.white,
  },
  sectionHeader: {
    marginTop: spacing.xxxl,
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  sectionEyebrow: {
    ...typography.eyebrow,
    marginBottom: 3,
    color: colors.inkSoft,
    textTransform: 'uppercase',
  },
  sectionTitle: {
    ...typography.title,
    color: colors.ink,
  },
  countBadge: {
    minWidth: 32,
    height: 32,
    paddingHorizontal: spacing.sm,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSoft,
  },
  countText: {
    ...typography.bodyStrong,
    color: colors.brandStrong,
  },
  lessonCard: {
    minHeight: 108,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  thumbnail: {
    position: 'relative',
    width: 104,
    height: 76,
    overflow: 'hidden',
    borderRadius: radii.md,
    backgroundColor: colors.brandMist,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  smallPlay: {
    position: 'absolute',
    right: 7,
    bottom: 7,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
  },
  lessonCopy: {
    flex: 1,
    marginLeft: spacing.md,
  },
  lessonNumber: {
    ...typography.eyebrow,
    color: colors.amber,
    textTransform: 'uppercase',
  },
  lessonTitle: {
    ...typography.bodyStrong,
    marginTop: 3,
    color: colors.ink,
  },
  lessonMeta: {
    ...typography.caption,
    marginTop: spacing.xs,
    color: colors.inkMuted,
  },
  chevron: {
    width: 34,
    height: 34,
    marginLeft: spacing.sm,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSoft,
  },
  emptyPlaylist: {
    minHeight: 132,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  emptyPlaylistText: {
    ...typography.body,
    marginTop: spacing.sm,
    color: colors.inkMuted,
    textAlign: 'center',
  },
});
