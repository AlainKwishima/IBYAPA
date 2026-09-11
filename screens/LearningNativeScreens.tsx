import { AppText } from '../components/AppText';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Alert, Image, Linking, Modal, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { RootStackParamList } from '../navigation/types';
import { AppHeader } from '../components/AppHeader';
import { BottomNavBar } from '../components/BottomNavBar';
import { ScreenColumn } from '../components/ScreenColumn';
import { ReadSectionTabs } from '../components/ReadSectionTabs';
import { SectionHeading } from '../components/SectionHeading';
import { EmptyState, InlineErrorState, DocumentCardSkeleton, SignGroupCardSkeleton } from '../components/RequestStates';
import { PdfDocumentIcon } from '../components/PdfDocumentIcon';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { useAuth } from '../context/AuthContext';
import { useAppFlow } from '../context/AppFlowContext';
import { useGateModal } from '../context/GateModalContext';
import { getPdfsWithFallback, type PdfItem } from '../services/contentApi';
import { getRoadSigns, markRoadSignViewed, type RoadSignStudyItem } from '../services/roadSignsApi';
import { ApiError } from '../services/api/types';
import { useI18n } from '../i18n/useI18n';
import { hasLanguageAccess, resolvePaidContentLanguage } from '../utils/subscriptionAccess';
import { colors, radii, shadows, spacing, typography } from '../constants/theme';
import { SUPPORT_CONTACT } from '../constants/support';

type ReadProps = NativeStackScreenProps<RootStackParamList, 'ReadingNative'>;
type HelpProps = NativeStackScreenProps<RootStackParamList, 'HelpCenterNative'>;
type ReadTab = 'documents' | 'signs';

function pdfOpenUrl(item: PdfItem): string | undefined {
  const candidates = [
    item.file,
    item.fileUrl,
    item.fileURL,
    item.pdfURL,
    item.pdfUrl,
    item.pdf,
    item.documentUrl,
    item.documentURL,
    item.downloadUrl,
    item.downloadURL,
    item.url,
    item.path,
  ];
  const value = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim().length > 0);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname === 'res.cloudinary.com' && parsed.protocol === 'http:') {
      parsed.protocol = 'https:';
    }
    return parsed.href;
  } catch {
    return encodeURI(trimmed);
  }
}

function pdfLabel(item: PdfItem, index: number, fallback: string): string {
  return (item.title ?? item.name ?? `${fallback} ${index + 1}`).trim();
}

function pdfExtension(item: PdfItem): 'PDF' | 'DOC' | 'PPT' | 'FILE' {
  const url = (pdfOpenUrl(item) ?? item.name ?? item.title ?? '').toLowerCase();
  if (url.includes('.pdf')) return 'PDF';
  if (url.includes('.doc')) return 'DOC';
  if (url.includes('.ppt')) return 'PPT';
  return 'FILE';
}

const FILE_TONES = {
  PDF: { color: colors.brandStrong, background: colors.brandSoft },
  DOC: { color: colors.brandStrong, background: colors.brandSoft },
  PPT: { color: colors.brand, background: colors.brandSoft },
  FILE: { color: colors.inkMuted, background: colors.surfaceAlt },
};

function DocumentCard({
  item,
  index,
  fallback,
  onPress,
}: {
  item: PdfItem;
  index: number;
  fallback: string;
  onPress: () => void;
}) {
  const { t } = useI18n();
  const extension = pdfExtension(item);
  const tone = FILE_TONES[extension];
  const hasLink = Boolean(pdfOpenUrl(item));

  return (
    <TouchableOpacity
      style={styles.documentCard}
      onPress={onPress}
      activeOpacity={hasLink ? 0.84 : 1}
      accessibilityState={{ disabled: !hasLink }}
    >
      <View style={styles.fileIcon}>
        {extension === 'PDF' ? (
          <PdfDocumentIcon size={58} />
        ) : (
          <View style={[styles.genericFileIcon, { backgroundColor: tone.background }]}>
            <Ionicons name="document-text-outline" size={24} color={tone.color} />
          </View>
        )}
      </View>
      <View style={styles.documentCopy}>
        <AppText style={styles.documentTitle} lines={2}>
          {pdfLabel(item, index, fallback)}
        </AppText>
        <View style={styles.documentMeta}>
          <View style={[styles.extensionPill, { backgroundColor: tone.background }]}>
            <AppText style={[styles.extensionText, { color: tone.color }]}>{extension}</AppText>
          </View>
          <AppText style={[styles.openText, !hasLink && styles.unavailableText]}>
            {hasLink ? t('reading.tapToOpen') : t('reading.noLinkAvailable')}
          </AppText>
        </View>
      </View>
      <View style={styles.cardArrow}>
        <Ionicons name={hasLink ? 'arrow-forward' : 'remove'} size={17} color={colors.inkSoft} />
      </View>
    </TouchableOpacity>
  );
}

function InlineRoadSignCard({
  item,
  imageFailed,
  onImageError,
  onPress,
}: {
  item: RoadSignStudyItem;
  imageFailed: boolean;
  onImageError: () => void;
  onPress: () => void;
}) {
  const { t } = useI18n();
  return (
    <TouchableOpacity style={styles.inlineSignCard} onPress={onPress} activeOpacity={0.84}>
      <View style={styles.inlineSignImageFrame}>
        {imageFailed ? (
          <View style={styles.inlineSignImageError}>
            <Ionicons name="image-outline" size={22} color={colors.inkSoft} />
          </View>
        ) : (
          <Image
            source={{ uri: item.imageUrl }}
            style={styles.inlineSignImage}
            resizeMode="contain"
            onError={onImageError}
            accessibilityLabel={item.name}
          />
        )}
      </View>
      <View style={styles.inlineSignCopy}>
        <AppText style={styles.inlineSignTitle} lines={2}>{item.name}</AppText>
        <AppText style={styles.inlineSignBody} lines={2}>{item.description}</AppText>
        <View style={styles.documentMeta}>
          <View style={[styles.extensionPill, item.viewed ? styles.signStatusViewed : styles.signStatusStudy]}>
            <AppText style={[styles.extensionText, item.viewed ? styles.signStatusViewedText : styles.signStatusStudyText]}>
              {item.viewed ? t('roadsigns.viewed') : t('roadsigns.studyLabel')}
            </AppText>
          </View>
          <AppText style={styles.openText}>{t('roadsigns.viewDetails')}</AppText>
        </View>
      </View>
      <View style={styles.cardArrow}>
        <Ionicons name="arrow-forward" size={17} color={colors.inkSoft} />
      </View>
    </TouchableOpacity>
  );
}

function RoadSignDetailModal({
  visible,
  item,
  current,
  total,
  imageFailed,
  onClose,
  onImageError,
  onPrevious,
  onNext,
}: {
  visible: boolean;
  item: RoadSignStudyItem | null;
  current: number;
  total: number;
  imageFailed: boolean;
  onClose: () => void;
  onImageError: () => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const { t } = useI18n();
  const touchStartX = useRef<number | null>(null);
  if (!item) return null;

  const canGoPrevious = current > 1;
  const canGoNext = current < total;
  const handleSwipeEnd = (x: number) => {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start == null) return;
    const delta = x - start;
    if (Math.abs(delta) < 44) return;
    if (delta < 0 && canGoNext) onNext();
    if (delta > 0 && canGoPrevious) onPrevious();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View
          style={styles.detailSheet}
          onTouchStart={(event) => {
            touchStartX.current = event.nativeEvent.pageX;
          }}
          onTouchEnd={(event) => handleSwipeEnd(event.nativeEvent.pageX)}
        >
          <View style={styles.detailHeader}>
            <TouchableOpacity style={styles.closeButton} onPress={onClose} accessibilityLabel={t('common.cancel')}>
              <Ionicons name="close" size={22} color={colors.inkMuted} />
            </TouchableOpacity>
            <AppText style={styles.detailCounter}>{t('roadsigns.positionShort', { current, total })}</AppText>
            <View style={styles.closeButtonSpacer} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.detailContent}>
            <View style={styles.detailBadgeRow}>
              <AppText style={styles.detailEyebrow}>{t('roadsigns.studyLabel')}</AppText>
              <View style={[styles.detailViewedBadge, item.viewed ? styles.detailViewedBadgeDone : styles.detailViewedBadgeTodo]}>
                <Ionicons
                  name={item.viewed ? 'checkmark-circle' : 'ellipse-outline'}
                  size={13}
                  color={item.viewed ? colors.success : colors.brand}
                />
                <AppText style={[styles.detailViewedText, item.viewed ? styles.detailViewedTextDone : styles.detailViewedTextTodo]}>
                  {item.viewed ? t('roadsigns.viewed') : t('roadsigns.studyLabel')}
                </AppText>
              </View>
            </View>

            <AppText style={styles.detailTitle}>{item.name}</AppText>

            <View style={styles.detailImageFrame}>
              {imageFailed ? (
                <View style={styles.detailImageError}>
                  <Ionicons name="image-outline" size={34} color={colors.inkSoft} />
                  <AppText style={styles.imageErrorText}>{t('roadsigns.imageError')}</AppText>
                </View>
              ) : (
                <Image
                  source={{ uri: item.imageUrl }}
                  style={styles.detailImage}
                  resizeMode="contain"
                  onError={onImageError}
                  accessibilityLabel={item.name}
                />
              )}
            </View>

            <View style={styles.descriptionCard}>
              <AppText style={styles.meaningLabel}>{t('roadsigns.meaning')}</AppText>
              <AppText style={styles.description} lines={null}>{item.description}</AppText>
            </View>
          </ScrollView>

          <TouchableOpacity
            style={[styles.floatingNavButton, styles.floatingNavLeft, !canGoPrevious && styles.floatingNavDisabled]}
            onPress={onPrevious}
            disabled={!canGoPrevious}
            accessibilityLabel={t('roadsigns.previous')}
          >
            <Ionicons name="chevron-back" size={24} color={canGoPrevious ? colors.brand : colors.inkSoft} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.floatingNavButton, styles.floatingNavRight, !canGoNext && styles.floatingNavDisabled]}
            onPress={onNext}
            disabled={!canGoNext}
            accessibilityLabel={t('roadsigns.next')}
          >
            <Ionicons name="chevron-forward" size={24} color={canGoNext ? colors.brand : colors.inkSoft} />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export function ReadingNativeScreen({ navigation, route }: ReadProps) {
  const { t } = useI18n();
  const { tabScrollBottomPad } = useResponsiveLayout();
  const { accessToken } = useAuth();
  const {
    hasSubscription,
    canChangeLanguage,
    subscriptionLanguage,
    contentLanguage,
    isSigningOut,
  } = useAppFlow();
  const { openGateModal } = useGateModal();
  const [activeTab, setActiveTab] = useState<ReadTab>(route.params?.initialTab ?? 'documents');
  const [failedRoadSignImages, setFailedRoadSignImages] = useState<Record<string, boolean>>({});
  const [selectedRoadSignIndex, setSelectedRoadSignIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const languageAccessGranted = hasLanguageAccess({
    hasSubscription,
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

  const { data: pdfData, isPending: loading, error: pdfQueryError, refetch: refetchPdfs } = useQuery({
    queryKey: ['pdfs', accessToken, paidContentLanguage],
    queryFn: async () => {
      if (!accessToken || !paidContentLanguage || !languageAccessGranted) return null;
      return await getPdfsWithFallback(accessToken, paidContentLanguage);
    },
    enabled: !!accessToken && !!paidContentLanguage && languageAccessGranted,
  });

  const pdfs = pdfData?.items ?? [];
  const pdfSourceLanguage = pdfData?.resolvedLanguage ?? null;
  const usedPdfFallback = pdfData?.usedFallback ?? false;
  
  const error = pdfQueryError
    ? (pdfQueryError instanceof ApiError && pdfQueryError.code === 'PDF_LANGUAGE_MISMATCH'
        ? t('reading.languageMismatch', { lang: t(`profile.lang.${paidContentLanguage}`) })
        : t('reading.loadError'))
    : null;

  const { data: roadSignsData, isPending: roadSignsLoading, error: roadSignsQueryError, refetch: refetchRoadSigns } = useQuery({
    queryKey: ['roadSigns', accessToken, paidContentLanguage],
    queryFn: async () => {
      if (!accessToken || !paidContentLanguage || !languageAccessGranted) return null;
      return await getRoadSigns(accessToken, paidContentLanguage);
    },
    enabled: !!accessToken && !!paidContentLanguage && languageAccessGranted,
  });

  const roadSigns = roadSignsData?.items ?? [];
  const roadSignsError = roadSignsQueryError ? t('roadsigns.loadError') : null;

  const loadPdfs = () => { void refetchPdfs(); };
  const loadRoadSigns = () => { void refetchRoadSigns(); };

  useEffect(() => {
    if (!languageAccessGranted && !isSigningOut) {
      openGateModal('subscription_read', () => navigation.navigate('SubscriptionNative'));
    }
  }, [isSigningOut, languageAccessGranted, navigation, openGateModal]);

  useEffect(() => {
    if (route.params?.initialTab) {
      setActiveTab(route.params.initialTab);
      setSearchQuery('');
    }
  }, [route.params?.initialTab]);

  const languageDocuments = useMemo(() => pdfs, [pdfs]);
  const filteredDocuments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return languageDocuments;
    return languageDocuments.filter((item, index) => {
      const title = pdfLabel(item, index, t('reading.documentFallback')).toLowerCase();
      const extension = pdfExtension(item).toLowerCase();
      return title.includes(query) || extension.includes(query);
    });
  }, [languageDocuments, searchQuery, t]);
  const filteredRoadSigns = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return roadSigns;
    return roadSigns.filter((item) => item.name.toLowerCase().includes(query) || item.description.toLowerCase().includes(query));
  }, [roadSigns, searchQuery]);
  const languageLabel = t(`profile.lang.${contentLanguage}`);
  const paidLanguageLabel = paidContentLanguage ? t(`profile.lang.${paidContentLanguage}`) : languageLabel;
  const sourceLanguageLabel = pdfSourceLanguage ? t(`profile.lang.${pdfSourceLanguage}`) : paidLanguageLabel;
  const activeSearchPlaceholder = activeTab === 'documents' ? t('reading.searchDocuments') : t('reading.searchRoadSigns');
  const selectedRoadSign = selectedRoadSignIndex === null ? null : roadSigns[selectedRoadSignIndex] ?? null;

  const queryClient = useQueryClient();

  const markRoadSignAsViewed = useCallback(
    (item: RoadSignStudyItem | undefined) => {
      if (!accessToken || !item || item.viewed) return;
      queryClient.setQueryData(['roadSigns', accessToken, paidContentLanguage], (current: { items: RoadSignStudyItem[] } | undefined) => {
        if (!current) return current;
        return { ...current, items: current.items.map((sign) => (sign.id === item.id ? { ...sign, viewed: true } : sign)) };
      });
      void markRoadSignViewed(accessToken, item.id).catch(() => {
        queryClient.setQueryData(['roadSigns', accessToken, paidContentLanguage], (current: { items: RoadSignStudyItem[] } | undefined) => {
          if (!current) return current;
          return { ...current, items: current.items.map((sign) => (sign.id === item.id ? { ...sign, viewed: false } : sign)) };
        });
      });
    },
    [accessToken, paidContentLanguage, queryClient],
  );

  const openRoadSign = useCallback(
    (item: RoadSignStudyItem) => {
      const index = roadSigns.findIndex((sign) => sign.id === item.id);
      if (index < 0) return;
      setSelectedRoadSignIndex(index);
      markRoadSignAsViewed(roadSigns[index]);
    },
    [markRoadSignAsViewed, roadSigns],
  );

  const goToRoadSign = useCallback(
    (index: number) => {
      if (index < 0 || index >= roadSigns.length) return;
      setSelectedRoadSignIndex(index);
      markRoadSignAsViewed(roadSigns[index]);
    },
    [markRoadSignAsViewed, roadSigns],
  );

  return (
    <ScreenColumn>
      <AppHeader
        title={t('reading.title')}
        onBack={() => navigation.goBack()}
        navigation={navigation}
      />

      <View style={styles.body}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: tabScrollBottomPad + spacing.xl }]}
        >
          <View style={styles.libraryIntro}>
            <AppText style={styles.libraryTitle}>{t('reading.libraryTitle')}</AppText>
            <AppText style={styles.librarySubtitle} lines={null} shrink>{t('reading.librarySubtitle')}</AppText>
          </View>

          <View style={styles.tabsWrap}>
            <ReadSectionTabs
              active={activeTab}
              documentsLabel={t('reading.pdfSection')}
              signsLabel={t('reading.roadSigns')}
              documentsCount={languageDocuments.length}
              signsCount={roadSigns.length}
              onDocumentsPress={() => {
                setActiveTab('documents');
                setSearchQuery('');
              }}
              onSignsPress={() => {
                setActiveTab('signs');
                setSearchQuery('');
              }}
            />
          </View>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={17} color={colors.inkSoft} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={activeSearchPlaceholder}
              placeholderTextColor={colors.inkSoft}
              style={styles.searchInput}
              returnKeyType="search"
              autoCorrect={false}
            />
            {searchQuery.trim() ? (
              <TouchableOpacity style={styles.clearSearch} onPress={() => setSearchQuery('')} accessibilityLabel={t('common.cancel')}>
                <Ionicons name="close" size={16} color={colors.inkMuted} />
              </TouchableOpacity>
            ) : null}
          </View>

          {paidContentLanguage && paidContentLanguage !== contentLanguage ? (
            <AppText style={styles.subscriptionLanguageNotice} lines={null}>
              {t('reading.subscriptionLanguageNotice', { lang: paidLanguageLabel })}
            </AppText>
          ) : null}

          <View style={styles.section}>
            <SectionHeading title={activeTab === 'documents' ? t('reading.pdfSection') : t('reading.roadSigns')} />
            <AppText style={styles.sectionSupport} lines={null}>
              {activeTab === 'documents'
                ? t('reading.documentCount', {
                    count: error ? 0 : filteredDocuments.length,
                    label:
                      !error && filteredDocuments.length === 1
                        ? t('reading.documentSingular')
                        : t('reading.documentPlural'),
                  })
                : t('roadsigns.signCount', {
                    count: roadSignsError ? 0 : filteredRoadSigns.length,
                    label: filteredRoadSigns.length === 1 ? t('roadsigns.signSingular') : t('roadsigns.signPlural'),
                  })}
            </AppText>
            {activeTab === 'documents' && !loading && !error && usedPdfFallback ? (
              <AppText style={styles.fallbackNotice}>
                {t('reading.languageFallback', {
                  requested: languageLabel,
                  available: sourceLanguageLabel,
                })}
              </AppText>
            ) : null}
          </View>

          {activeTab === 'documents' && loading ? (
            <View style={{ gap: spacing.md }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <DocumentCardSkeleton key={i} />
              ))}
            </View>
          ) : activeTab === 'documents' && error ? (
            <InlineErrorState
              title={t('reading.languageUnavailableTitle')}
              message={error}
              onRetry={() => void loadPdfs()}
            />
          ) : activeTab === 'documents' && languageDocuments.length === 0 ? (
            <EmptyState
              title={t('reading.pdfEmpty')}
              message={t('reading.libraryEmptyHint')}
            />
          ) : activeTab === 'documents' && filteredDocuments.length === 0 ? (
            <EmptyState
              title={t('reading.searchEmptyTitle')}
              message={t('reading.searchEmptyBody')}
            />
          ) : activeTab === 'documents' ? (
            <View style={styles.documentList}>
              {filteredDocuments.map((document, index) => (
                <DocumentCard
                  key={document._id ?? `document-${index}`}
                  item={document}
                  index={index}
                  fallback={t('reading.documentFallback')}
                  onPress={() => {
                    const url = pdfOpenUrl(document);
                    if (!url) {
                      Alert.alert(t('reading.pdfAlertTitle'), t('reading.pdfNoLink'));
                      return;
                    }
                    navigation.navigate('PdfViewer', {
                      title: document.title ?? document.name ?? t('reading.documentFallback'),
                      url,
                    });
                  }}
                />
              ))}
            </View>
          ) : roadSignsLoading ? (
            <View style={{ gap: spacing.md }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <SignGroupCardSkeleton key={i} />
              ))}
            </View>
          ) : roadSignsError ? (
            <InlineErrorState
              title={t('roadsigns.errorTitle')}
              message={roadSignsError}
              onRetry={() => void loadRoadSigns()}
            />
          ) : roadSigns.length === 0 ? (
            <EmptyState title={t('roadsigns.emptyTitle')} message={t('roadsigns.emptyBody')} />
          ) : filteredRoadSigns.length === 0 ? (
            <EmptyState title={t('reading.searchEmptyTitle')} message={t('reading.searchEmptyBody')} />
          ) : (
            <View style={styles.inlineSignsGrid}>
              {filteredRoadSigns.map((item) => (
                <InlineRoadSignCard
                  key={item.id}
                  item={item}
                  imageFailed={failedRoadSignImages[item.id] === true}
                  onImageError={() => setFailedRoadSignImages((current) => ({ ...current, [item.id]: true }))}
                  onPress={() => openRoadSign(item)}
                />
              ))}
            </View>
          )}
        </ScrollView>

        <RoadSignDetailModal
          visible={selectedRoadSign !== null}
          item={selectedRoadSign}
          current={(selectedRoadSignIndex ?? 0) + 1}
          total={roadSigns.length}
          imageFailed={selectedRoadSign ? failedRoadSignImages[selectedRoadSign.id] === true : false}
          onClose={() => setSelectedRoadSignIndex(null)}
          onImageError={() => {
            if (!selectedRoadSign) return;
            setFailedRoadSignImages((current) => ({ ...current, [selectedRoadSign.id]: true }));
          }}
          onPrevious={() => goToRoadSign((selectedRoadSignIndex ?? 0) - 1)}
          onNext={() => goToRoadSign((selectedRoadSignIndex ?? 0) + 1)}
        />
      </View>

      <BottomNavBar navigation={navigation} />
    </ScreenColumn>
  );
}

export function HelpCenterNativeScreen({ navigation }: HelpProps) {
  const { t } = useI18n();
  const { tabScrollBottomPad } = useResponsiveLayout();
  const faqs = [t('reading.faq1'), t('reading.faq2'), t('reading.faq3'), t('reading.faq4')];

  const handleWhatsApp = () => {
    Linking.openURL(SUPPORT_CONTACT.whatsappUrl).catch(() => {
      Alert.alert(t('common.error'), t('reading.whatsappError'));
    });
  };

  return (
    <ScreenColumn>
      <AppHeader title={t('menu.help')} onBack={() => navigation.goBack()} navigation={navigation} />
      <View style={styles.body}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: tabScrollBottomPad + spacing.xl }]}
        >
          <AppText style={styles.pageTitle}>{t('reading.helpContact')}</AppText>
          <AppText style={styles.pageSubtitle}>{t('reading.helpIntro')}</AppText>

          <View style={styles.contactCard}>
            <View style={styles.contactRow}>
              <View style={[styles.contactIcon, { backgroundColor: colors.brandSoft }]}>
                <Ionicons name="mail-outline" size={20} color={colors.brand} />
              </View>
              <View style={styles.contactCopy}>
                <AppText style={styles.contactLabel}>{t('reading.supportEmailLabel')}</AppText>
                <AppText style={styles.contactValue}>{SUPPORT_CONTACT.email}</AppText>
              </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.contactRow}>
              <View style={[styles.contactIcon, { backgroundColor: colors.greenSoft }]}>
                <Ionicons name="call-outline" size={20} color={colors.green} />
              </View>
              <View style={styles.contactCopy}>
                <AppText style={styles.contactLabel}>{t('reading.supportPhoneLabel')}</AppText>
                <AppText style={styles.contactValue}>{SUPPORT_CONTACT.phoneDisplay}</AppText>
              </View>
            </View>
            <TouchableOpacity style={styles.whatsappButton} onPress={handleWhatsApp} activeOpacity={0.85}>
              <Ionicons name="logo-whatsapp" size={21} color={colors.white} />
              <AppText style={styles.whatsappText}>{t('auth.whatsappUs')}</AppText>
              <Ionicons name="arrow-forward" size={18} color={colors.white} />
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <SectionHeading title={t('reading.faqTitle')} />
          </View>
          <View style={styles.faqList}>
            {faqs.map((question, index) => (
              <View key={question} style={styles.faqCard}>
                <View style={styles.faqNumber}>
                  <AppText style={styles.faqNumberText}>{index + 1}</AppText>
                </View>
                <AppText style={styles.faqText}>{question}</AppText>
              </View>
            ))}
          </View>
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
  libraryIntro: {
    marginBottom: spacing.lg,
  },
  libraryTitle: {
    ...typography.sectionTitle,
    color: colors.ink,
    textAlign: 'center',
  },
  librarySubtitle: {
    ...typography.body,
    marginTop: spacing.xs,
    color: colors.inkMuted,
    textAlign: 'center',
  },
  tabsWrap: {
    marginTop: 0,
  },
  searchBox: {
    minHeight: 48,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  searchInput: {
    ...typography.body,
    flex: 1,
    minHeight: 44,
    color: colors.ink,
    padding: 0,
  },
  clearSearch: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionSupport: {
    ...typography.caption,
    marginTop: spacing.xs,
    color: colors.inkSoft,
  },
  fallbackNotice: {
    ...typography.caption,
    marginTop: spacing.sm,
    lineHeight: 18,
    color: colors.brandStrong,
  },
  subscriptionLanguageNotice: {
    ...typography.caption,
    marginTop: spacing.sm,
    lineHeight: 18,
    color: colors.brandStrong,
  },
  documentList: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  documentCard: {
    minHeight: 90,
    padding: spacing.lg,
    borderRadius: radii.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  fileIcon: {
    width: 58,
    height: 58,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genericFileIcon: {
    width: 58,
    height: 58,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  documentCopy: {
    flex: 1,
    marginHorizontal: spacing.md,
  },
  documentTitle: {
    ...typography.bodyStrong,
    color: colors.ink,
  },
  documentMeta: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  extensionPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  extensionText: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 10,
  },
  openText: {
    ...typography.caption,
    color: colors.brand,
  },
  unavailableText: {
    color: colors.inkSoft,
  },
  cardArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  inlineSignsGrid: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  inlineSignCard: {
    minHeight: 98,
    padding: spacing.lg,
    borderRadius: radii.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  inlineSignImageFrame: {
    width: 58,
    height: 58,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.line,
  },
  inlineSignImage: {
    width: '92%',
    height: '92%',
  },
  inlineSignImageError: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineSignCopy: {
    flex: 1,
    marginHorizontal: spacing.md,
  },
  inlineSignTitle: {
    ...typography.bodyStrong,
    color: colors.ink,
  },
  inlineSignBody: {
    ...typography.caption,
    marginTop: spacing.xs,
    color: colors.inkMuted,
  },
  signStatusViewed: {
    backgroundColor: colors.successSoft,
  },
  signStatusStudy: {
    backgroundColor: colors.brandSoft,
  },
  signStatusViewedText: {
    color: colors.success,
  },
  signStatusStudyText: {
    color: colors.brand,
  },
  modalBackdrop: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
    backgroundColor: 'rgba(23, 34, 56, 0.46)',
  },
  detailSheet: {
    maxHeight: '86%',
    borderRadius: 18,
    backgroundColor: colors.surface,
    overflow: 'visible',
  },
  detailHeader: {
    height: 52,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonSpacer: {
    width: 40,
    height: 40,
  },
  detailCounter: {
    ...typography.bodyStrong,
    color: colors.inkMuted,
  },
  detailContent: {
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  detailBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  detailEyebrow: {
    ...typography.eyebrow,
    color: colors.brand,
    textTransform: 'uppercase',
  },
  detailViewedBadge: {
    minHeight: 24,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailViewedBadgeDone: {
    backgroundColor: colors.successSoft,
  },
  detailViewedBadgeTodo: {
    backgroundColor: colors.brandSoft,
  },
  detailViewedText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 10,
  },
  detailViewedTextDone: {
    color: colors.success,
  },
  detailViewedTextTodo: {
    color: colors.brand,
  },
  detailTitle: {
    marginTop: spacing.sm,
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 20,
    lineHeight: 27,
    color: colors.ink,
  },
  detailImageFrame: {
    height: 260,
    marginTop: spacing.md,
    borderRadius: radii.xl,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceAlt,
  },
  detailImage: {
    width: '92%',
    height: '92%',
  },
  detailImageError: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  imageErrorText: {
    marginTop: spacing.sm,
    fontFamily: 'Poppins-Medium',
    fontSize: 12,
    color: colors.inkMuted,
    textAlign: 'center',
  },
  descriptionCard: {
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  meaningLabel: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 10,
    color: colors.brand,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  description: {
    marginTop: spacing.sm,
    fontFamily: 'Poppins-Medium',
    fontSize: 14,
    lineHeight: 22,
    color: colors.inkMuted,
  },
  floatingNavButton: {
    position: 'absolute',
    top: '45%',
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  floatingNavLeft: {
    left: -16,
  },
  floatingNavRight: {
    right: -16,
  },
  floatingNavDisabled: {
    opacity: 0.45,
  },
  stateCard: {
    minHeight: 200,
    marginTop: spacing.lg,
    padding: spacing.xxl,
    borderRadius: radii.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  errorState: {
    backgroundColor: colors.redSoft,
    borderColor: '#FDE8E8',
  },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  stateTitle: {
    ...typography.title,
    marginTop: spacing.md,
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
    minHeight: 42,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
  },
  retryText: {
    ...typography.bodyStrong,
    color: colors.white,
  },
  contactCard: {
    marginTop: spacing.xxl,
    padding: spacing.xl,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadows.card,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  contactIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactCopy: {
    flex: 1,
    marginLeft: spacing.md,
  },
  contactLabel: {
    ...typography.caption,
    color: colors.inkSoft,
  },
  contactValue: {
    ...typography.bodyStrong,
    marginTop: 2,
    color: colors.ink,
  },
  divider: {
    height: 1,
    marginVertical: spacing.lg,
    marginLeft: 58,
    backgroundColor: colors.line,
  },
  whatsappButton: {
    minHeight: 52,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.green,
  },
  whatsappText: {
    ...typography.bodyStrong,
    flex: 1,
    marginLeft: spacing.sm,
    color: colors.white,
  },
  faqList: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  faqCard: {
    minHeight: 70,
    padding: spacing.md,
    borderRadius: radii.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  faqNumber: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSoft,
  },
  faqNumberText: {
    ...typography.bodyStrong,
    color: colors.brandStrong,
  },
  faqText: {
    ...typography.body,
    flex: 1,
    marginLeft: spacing.md,
    color: colors.ink,
  },
});
