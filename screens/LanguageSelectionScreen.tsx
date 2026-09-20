import { AppText } from '../components/AppText';
import React, { useEffect, useState } from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image, ImageSourcePropType, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RootStackParamList } from '../navigation/types';
import { FIGMA_ASSETS } from '../assets/figmaAssets';
import { LanguageOptionCard } from '../components/LanguageOptionCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { useMobile } from '../hooks/useMobile';
import { useAuth } from '../context/AuthContext';
import { useAppFlow } from '../context/AppFlowContext';
import type { ContentLanguageCode } from '../context/AppFlowContext';
import { useI18n } from '../i18n/useI18n';
import { getMessageFromUnknownError } from '../services/api/client';
import { updateUserProfile } from '../services/userApi';
import { colors, spacing, typography } from '../constants/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'LanguageSelection'>;
type LanguageKey = 'kinyarwanda' | 'english' | 'francais';

type LanguageOption = {
  key: LanguageKey;
  titleKey: string;
  subtitleKey: string;
  flagUri: ImageSourcePropType;
};

const LANGUAGE_OPTIONS: LanguageOption[] = [
  { key: 'kinyarwanda', titleKey: 'language.opt.rw.title', subtitleKey: 'language.opt.rw.sub', flagUri: FIGMA_ASSETS.flagKinyarwanda },
  { key: 'english', titleKey: 'language.opt.en.title', subtitleKey: 'language.opt.en.sub', flagUri: FIGMA_ASSETS.flagEnglish },
  { key: 'francais', titleKey: 'language.opt.fr.title', subtitleKey: 'language.opt.fr.sub', flagUri: FIGMA_ASSETS.flagFrancais },
];

function contentLangToCardKey(code: ContentLanguageCode): LanguageKey {
  if (code === 'rw') return 'kinyarwanda';
  if (code === 'fr') return 'francais';
  return 'english';
}

export function LanguageSelectionScreen({ navigation, route }: Props) {
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageKey>('kinyarwanda');
  const m = useMobile();
  const { t } = useI18n();
  const { setContentLanguage, contentLanguage, commitLanguageSelection } = useAppFlow();
  const { accessToken, userId } = useAuth();
  const changeOnly = Boolean(route.params?.changeOnly);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (changeOnly) {
      setSelectedLanguage(contentLangToCardKey(contentLanguage));
    }
  }, [changeOnly, contentLanguage]);

  const apiLang = (key: LanguageKey): ContentLanguageCode => {
    if (key === 'kinyarwanda') return 'rw';
    if (key === 'francais') return 'fr';
    return 'en';
  };

  return (
    <View style={[styles.root, { paddingHorizontal: m.sideGutter, paddingTop: Math.max(insets.top, m.verticalScale(12)) }]}>
      <ScrollView
        style={{ width: '100%', maxWidth: m.contentWidth, alignSelf: 'center' }}
        contentContainerStyle={[
          styles.phoneFrame,
          { paddingBottom: Math.max(insets.bottom, m.verticalScale(16)), flexGrow: 1 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={[styles.header, { minHeight: m.verticalScale(132), paddingTop: m.verticalScale(12) }]}>
          <Image source={FIGMA_ASSETS.brandingLogo} style={[styles.logo, { width: m.scale(92), height: m.scale(92) }]} resizeMode="contain" />
          <AppText style={[styles.brandTitle, { width: m.scale(240), fontSize: m.fontScale(14), lineHeight: m.fontScale(20) }]}>
            {t('language.brand')}
          </AppText>
        </View>

        <View style={[styles.main, { paddingTop: m.verticalScale(14), paddingHorizontal: m.scale(20) }]}>
          <View style={styles.mainInner}>
            <View style={[styles.titleMargin, { paddingBottom: m.verticalScale(20) }]}>
              <View style={styles.titleSection}>
                <AppText style={[styles.heading, { maxWidth: m.scale(280), fontSize: m.fontScale(18), lineHeight: m.fontScale(28) }]}>
                  {changeOnly ? t('language.changeTitle') : t('language.chooseTitle')}
                </AppText>
                <AppText style={[styles.subHeading, { marginTop: m.verticalScale(6), maxWidth: m.scale(280), fontSize: m.fontScale(13), lineHeight: m.fontScale(19) }]}>
                  {changeOnly ? t('language.changeHint') : t('language.chooseSubtitle')}
                </AppText>
              </View>
            </View>

            <View style={styles.languageList}>
              {LANGUAGE_OPTIONS.map((option) => (
                <View key={option.key} style={option.key === 'kinyarwanda' ? undefined : [styles.languageCardSpacing, { marginTop: m.verticalScale(12) }]}>
                  <LanguageOptionCard
                    title={t(option.titleKey)}
                    subtitle={t(option.subtitleKey)}
                    flagUri={option.flagUri}
                    selected={option.key === selectedLanguage}
                    onPress={() => setSelectedLanguage(option.key)}
                  />
                </View>
              ))}
            </View>
          </View>

          <View style={[styles.footerActions, { paddingBottom: m.verticalScale(16), paddingTop: m.verticalScale(14) }]}>
            <PrimaryButton
              label={t('language.continue')}
              onPress={async () => {
                const lang = apiLang(selectedLanguage);
                if (changeOnly) {
                  await setContentLanguage(lang);
                  if (accessToken && userId) {
                    try {
                      await updateUserProfile(userId, accessToken, { lang });
                    } catch (e) {
                      if (__DEV__) {
                        console.warn('[LanguageSelection] backend language update failed', getMessageFromUnknownError(e));
                      }
                    }
                  }
                  navigation.goBack();
                  return;
                }
                await commitLanguageSelection(lang);
                navigation.navigate('CreateAccount');
              }}
            />
            <AppText style={[styles.copyright, { marginTop: m.verticalScale(14), fontSize: m.fontScale(10), lineHeight: m.fontScale(15) }]}>
              {t('language.copyright')}
            </AppText>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    overflow: 'hidden',
  },
  phoneFrame: {
    width: '100%',
    minHeight: '100%',
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  header: {
    width: '100%',
    minHeight: 132,
    paddingTop: 12,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  logo: {
    width: 92,
    height: 92,
  },
  brandTitle: {
    width: 240,
    textAlign: 'center',
    color: colors.ink,
    fontFamily: 'Poppins-Bold',
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: -0.6,
  },
  main: {
    width: '100%',
    flex: 1,
    paddingTop: 14,
    paddingHorizontal: 20,
    alignItems: 'stretch',
    justifyContent: 'space-between',
  },
  mainInner: {
    width: '100%',
    alignItems: 'stretch',
  },
  titleMargin: {
    width: '100%',
    paddingBottom: 20,
  },
  titleSection: {
    width: '100%',
    alignItems: 'center',
  },
  heading: {
    textAlign: 'center',
    color: colors.ink,
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 22,
    lineHeight: 32,
  },
  subHeading: {
    marginTop: 8,
    textAlign: 'center',
    color: colors.inkMuted,
    fontFamily: 'Poppins-Medium',
    fontSize: 14,
    lineHeight: 22,
  },
  languageList: {
    width: '100%',
  },
  languageCardSpacing: {
    marginTop: 12,
  },
  footerActions: {
    width: '100%',
    alignItems: 'center',
    paddingBottom: 16,
    paddingTop: 14,
  },
  copyright: {
    marginTop: 14,
    textAlign: 'center',
    color: colors.inkSoft,
    fontFamily: 'Poppins-SemiBold',
    fontSize: 10,
    lineHeight: 15,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
