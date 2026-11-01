import { AppText } from '../components/AppText';
import React, { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { RootStackParamList } from '../navigation/types';
import { AppHeader } from '../components/AppHeader';
import { BottomNavBar } from '../components/BottomNavBar';
import { ScreenColumn } from '../components/ScreenColumn';
import { SectionHeading } from '../components/SectionHeading';
import { EmptyState, InlineErrorState, VideoCardSkeleton, FeaturedVideoCardSkeleton } from '../components/RequestStates';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { useAuth } from '../context/AuthContext';
import { useAppFlow } from '../context/AppFlowContext';
import { useGateModal } from '../context/GateModalContext';
import { getVideos, type VideoItem } from '../services/contentApi';
import { getMessageFromUnknownError } from '../services/api/client';
import { useI18n } from '../i18n/useI18n';
import { hasVideoAccess, resolvePaidContentLanguage } from '../utils/subscriptionAccess';
import { normalizeHttpUrl, youtubeThumbnailUrl } from '../utils/videoLinks';
import { colors, radii, shadows, spacing, typography } from '../constants/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'VideoCourseList'>;

function videoUrlFromItem(video: VideoItem): string | undefined {
  return normalizeHttpUrl(
    video.video ??
      video.videoURL ??
      video.videoUrl ??
      video.url ??
      video.link ??
      video.videoLink ??
      video.video_link ??
      video.youtubeUrl ??
      video.youtubeURL ??
      video.embedUrl ??
      video.embedURL ??
      video.fileUrl ??
      video.fileURL,
  );
}

function titleFromItem(
  video: VideoItem,
  index: number,
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  return (video.title ?? video.name ?? t('video.lessonFallback', { n: index + 1 })).trim();
}

function thumbnailFromItem(video: VideoItem): string | undefined {
  const value = normalizeHttpUrl(video.thumbnail ?? video.thumbnailURL ?? video.thumbnailUrl ?? video.imageURL ?? video.imageUrl);
  if (value) return value;
  return youtubeThumbnailUrl(videoUrlFromItem(video));
}

function durationFromItem(video: VideoItem): string | undefined {
  if (video.duration) return String(video.duration);
  if (typeof video.durationMinutes === 'number') return `${video.durationMinutes} min`;
  return undefined;
}

function Thumbnail({
  uri,
  large = false,
}: {
  uri?: string;
  large?: boolean;
}) {
  return (
    <View style={[styles.thumbnail, large && styles.thumbnailLarge]}>
      {uri ? (
        <Image source={{ uri }} style={styles.thumbnailImage} resizeMode="cover" />
      ) : (
        <View style={styles.thumbnailFallback}>
          <Ionicons name="videocam-outline" size={large ? 42 : 26} color="#6B7280" />
        </View>
      )}
      <View style={styles.thumbnailShade} />
      <View style={[styles.playButton, large && styles.playButtonLarge]}>
        <Ionicons name="play" size={large ? 22 : 14} color={colors.white} />
      </View>
    </View>
  );
}

export function VideoCourseListScreen({ navigation }: Props) {
  const { t } = useI18n();
  const { tabScrollBottomPad } = useResponsiveLayout();
  const { accessToken } = useAuth();
  const {
    hasSubscription,
    hasVideoAccess: videoEntitlement,
    canChangeLanguage,
    subscriptionLanguage,
    contentLanguage,
    isSigningOut,
  } = useAppFlow();
  const { openGateModal } = useGateModal();
  const videoAccessGranted = hasVideoAccess({
    hasSubscription,
    hasVideoAccess: videoEntitlement,
    canChangeLanguage,
    subscriptionLanguage,
    contentLanguage,
  });
  const paidContentLanguage = resolvePaidContentLanguage({
    hasSubscription,
    canChangeLanguage,
    subscriptionLanguage,
    contentLanguage,
  });

  useEffect(() => {
    if (!videoAccessGranted && !isSigningOut) {
      openGateModal('subscription_watch', () => navigation.navigate('SubscriptionNative'));
    }
  }, [isSigningOut, navigation, openGateModal, videoAccessGranted]);

  const { data: items = [], isPending, error: queryError, refetch } = useQuery({
    queryKey: ['videos', accessToken, paidContentLanguage],
    queryFn: async () => {
      if (!accessToken || !videoAccessGranted || !paidContentLanguage || isSigningOut) {
        return [];
      }
      return await getVideos(accessToken, paidContentLanguage);
    },
    enabled: !!accessToken && videoAccessGranted && !!paidContentLanguage && !isSigningOut,
  });

  const loading = isPending && !!accessToken && videoAccessGranted && !!paidContentLanguage && !isSigningOut;
  const error = !accessToken ? t('video.needSignIn') : queryError ? getMessageFromUnknownError(queryError) : null;
  const loadVideos = () => { void refetch(); };

  const allVideos = items.map((video, index) => ({
    _id: video._id,
    title: titleFromItem(video, index, t),
    videoUrl: videoUrlFromItem(video),
    thumbUri: thumbnailFromItem(video),
    duration: durationFromItem(video),
  }));

  const openLesson = (index: number) => {
    const lesson = allVideos[index];
    if (!lesson) return;
    navigation.navigate('VideoCoursePlayer', {
      ...lesson,
      allVideos,
      currentIndex: index,
    });
  };

  if (!videoAccessGranted) {
    return (
      <ScreenColumn>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: tabScrollBottomPad + spacing.xl }]}>
          <FeaturedVideoCardSkeleton />
          <View style={{ marginTop: spacing.xxl, gap: spacing.md }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <VideoCardSkeleton key={i} />
            ))}
          </View>
        </ScrollView>
      </ScreenColumn>
    );
  }

  const featured = items[0];
  const paidLanguageLabel = paidContentLanguage ? t(`profile.lang.${paidContentLanguage}`) : '';

  return (
    <ScreenColumn>
      <AppHeader
        title={t('video.listTitle')}
        onBack={() => navigation.goBack()}
        navigation={navigation}
      />

      <View style={styles.body}>
        {loading ? (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: tabScrollBottomPad + spacing.xl }]}>
            <FeaturedVideoCardSkeleton />
            <View style={{ marginTop: spacing.xxl, gap: spacing.md }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <VideoCardSkeleton key={i} />
              ))}
            </View>
          </ScrollView>
        ) : error ? (
          <InlineErrorState title={t('video.unavailableTitle')} message={error} onRetry={() => void loadVideos()} />
        ) : items.length === 0 ? (
          <EmptyState title={t('video.none')} message={t('video.emptyHint')} />
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.content, { paddingBottom: tabScrollBottomPad + spacing.xl }]}
          >
            <AppText style={styles.pageTitle}>{t('video.libraryTitle')}</AppText>
            <AppText style={styles.pageSubtitle}>
              {t('video.librarySubtitle', { count: items.length })}
            </AppText>
            {paidContentLanguage && paidContentLanguage !== contentLanguage ? (
              <AppText style={styles.subscriptionLanguageNotice} lines={null}>
                {t('video.subscriptionLanguageNotice', { lang: paidLanguageLabel })}
              </AppText>
            ) : null}

            {featured ? (
              <TouchableOpacity style={styles.featureCard} onPress={() => openLesson(0)} activeOpacity={0.9}>
                <Thumbnail uri={thumbnailFromItem(featured)} large />
                <View style={styles.featureCopy}>
                  <View style={styles.featureLabelRow}>
                    <AppText style={styles.featureLabel}>{t('video.featured')}</AppText>
                    {durationFromItem(featured) ? (
                      <AppText style={styles.featureDuration}>{durationFromItem(featured)}</AppText>
                    ) : null}
                  </View>
                  <AppText style={styles.featureTitle} lines={2}>
                    {titleFromItem(featured, 0, t)}
                  </AppText>
                  <View style={styles.watchRow}>
                    <AppText style={styles.watchText}>{t('video.tapWatch')}</AppText>
                    <Ionicons name="arrow-forward" size={17} color={colors.amber} />
                  </View>
                </View>
              </TouchableOpacity>
            ) : null}

            <View style={styles.section}>
              <SectionHeading title={t('video.allLessons')} />
            </View>
            <View style={styles.lessonList}>
              {items.slice(1).map((lesson, offset) => {
                const index = offset + 1;
                const duration = durationFromItem(lesson);
                return (
                  <TouchableOpacity
                    key={`${lesson._id ?? index}-${index}`}
                    style={styles.lessonCard}
                    onPress={() => openLesson(index)}
                    activeOpacity={0.85}
                  >
                    <Thumbnail uri={thumbnailFromItem(lesson)} />
                    <View style={styles.lessonCopy}>
                      <AppText style={styles.lessonNumber}>
                        {t('video.lessonNumber', { number: index + 1 })}
                      </AppText>
                      <AppText style={styles.lessonTitle} lines={2}>
                        {titleFromItem(lesson, index, t)}
                      </AppText>
                      <AppText style={styles.lessonMeta}>{duration ?? t('video.tapWatch')}</AppText>
                    </View>
                    <Ionicons name="chevron-forward" size={19} color={colors.inkSoft} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        )}
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
  content: {
    paddingTop: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  pageTitle: {
    ...typography.heading,
    color: colors.ink,
  },
  pageSubtitle: {
    ...typography.body,
    marginTop: spacing.xs,
    color: colors.inkMuted,
  },
  subscriptionLanguageNotice: {
    ...typography.caption,
    marginTop: spacing.sm,
    color: colors.brandStrong,
  },
  featureCard: {
    marginTop: spacing.xxl,
    overflow: 'hidden',
    borderRadius: radii.xl,
    backgroundColor: colors.ink,
    ...shadows.card,
  },
  thumbnail: {
    position: 'relative',
    width: 108,
    height: 78,
    overflow: 'hidden',
    borderRadius: radii.md,
    backgroundColor: colors.brandStrong,
  },
  thumbnailLarge: {
    width: '100%',
    height: 205,
    borderRadius: 0,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  thumbnailFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandStrong,
  },
  thumbnailShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(20,33,58,0.22)',
  },
  playButton: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 34,
    height: 34,
    marginLeft: -17,
    marginTop: -17,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
  },
  playButtonLarge: {
    width: 58,
    height: 58,
    marginLeft: -29,
    marginTop: -29,
    borderRadius: 29,
    backgroundColor: colors.amber,
  },
  featureCopy: {
    padding: spacing.xl,
  },
  featureLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  featureLabel: {
    ...typography.eyebrow,
    color: colors.amber,
    textTransform: 'uppercase',
  },
  featureDuration: {
    ...typography.caption,
    color: '#6B7280',
  },
  featureTitle: {
    ...typography.title,
    marginTop: spacing.sm,
    color: colors.white,
  },
  watchRow: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  watchText: {
    ...typography.bodyStrong,
    color: colors.amber,
  },
  section: {
    marginTop: spacing.xxxl,
  },
  lessonList: {
    marginTop: spacing.md,
    gap: spacing.md,
  },
  lessonCard: {
    minHeight: 102,
    padding: spacing.md,
    borderRadius: radii.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  lessonCopy: {
    flex: 1,
    marginHorizontal: spacing.md,
  },
  lessonNumber: {
    ...typography.eyebrow,
    color: colors.brand,
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
    color: colors.inkSoft,
  },
  fullState: {
    flex: 1,
    paddingHorizontal: spacing.xxxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateIcon: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  stateTitle: {
    ...typography.title,
    marginTop: spacing.lg,
    color: colors.ink,
    textAlign: 'center',
  },
  stateText: {
    ...typography.body,
    marginTop: spacing.sm,
    color: colors.inkMuted,
    textAlign: 'center',
  },
  retryButton: {
    minHeight: 46,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xxl,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
  },
  retryText: {
    ...typography.bodyStrong,
    color: colors.white,
  },
});
