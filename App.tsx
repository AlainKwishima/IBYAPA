import React from 'react';
import { NavigationContainer, DefaultTheme, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator, type NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync();

import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from '@expo-google-fonts/poppins';

import { HelpCenterScreen } from './screens/HelpCenterScreen';
import { CreateAccountScreen, ForgotPasswordScreen, LoginScreen, ResetPasswordScreen } from './screens/AuthScreens';
import { ExamNativeScreen } from './screens/ExamNativeScreen';
import { HomeNativeScreen } from './screens/HomeNativeScreen';

import { LanguageSelectionScreen } from './screens/LanguageSelectionScreen';
import { LanguageSettingsScreen } from './screens/LanguageSettingsScreen';
import { PracticeNoSelectedNativeScreen, PracticeSelectedNativeScreen } from './screens/PracticeNativeScreen';
import { PerformanceNativeScreen, PerformanceReviewNativeScreen } from './screens/PerformanceNativeScreens';
import { HelpCenterNativeScreen } from './screens/LearningNativeScreens';
import { PaymentNativeScreen, SubscriptionNativeScreen } from './screens/PaymentNativeScreens';
import { ProfileNativeScreen } from './screens/ProfileNativeScreen';
import { RootStackParamList } from './navigation/types';
import { ReferenceImageScreen } from './screens/ReferenceImageScreen';
import { ScreensHubScreen } from './screens/ScreensHubScreen';
import { StartExamNativeScreen } from './screens/StartExamNativeScreen';
import { ExamInstructionsNativeScreen } from './screens/ExamInstructionsNativeScreen';
import { ExamTypeSelectNativeScreen } from './screens/ExamTypeSelectNativeScreen';
import { TestFailedNativeScreen, TestPassedNativeScreen } from './screens/TestResultNativeScreen';
import { VideoCourseListScreen } from './screens/VideoCourseListScreen';
import { VideoCoursePlayerScreen } from './screens/VideoCoursePlayerScreen';
import { PdfViewerScreen } from './screens/PdfViewerScreen';
import { ReadingNativeScreen } from './screens/LearningNativeScreens';
import { AppFlowProvider, useAppFlow } from './context/AppFlowContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { GateModalProvider } from './context/GateModalContext';
import { NetworkStatusProvider } from './context/NetworkStatusContext';
import { OfflineBanner } from './components/OfflineBanner';
import { FullScreenErrorBoundary } from './components/FullScreenErrorBoundary';
import { SkeletonBlock } from './components/RequestStates';
import { colors } from './constants/theme';
import { navigationRef } from './navigation/navigationRef';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000, // Data stays fresh for 5 mins
    },
  },
});

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.canvas,
  },
};

const stackScreenOptions: NativeStackNavigationOptions = {
  headerShown: false,
  animation: 'fade_from_bottom',
  animationTypeForReplace: 'push',
  animationMatchesGesture: true,
  fullScreenGestureEnabled: true,
  gestureEnabled: true,
  freezeOnBlur: true,
  contentStyle: {
    backgroundColor: colors.canvas,
  },
};

const mainTabScreenOptions: NativeStackNavigationOptions = {
  animation: 'none',
};

function RootNavigator() {
  const { hydrated, hasChosenLanguage } = useAppFlow();
  const { authReady, isSignedIn, accessToken } = useAuth();

  React.useEffect(() => {
    if (hydrated && authReady) {
      SplashScreen.hideAsync();
    }
  }, [hydrated, authReady]);

  if (!hydrated || !authReady) {
    return null;
  }

  let initialRouteName: keyof RootStackParamList = 'LanguageSelection';
  if (hasChosenLanguage) {
    if (!isSignedIn || !accessToken) {
      initialRouteName = 'Login';
    } else {
      initialRouteName = 'HomeNative';
    }
  }

  return (
    <NavigationContainer theme={navTheme} ref={navigationRef}>
      <Stack.Navigator screenOptions={stackScreenOptions} initialRouteName={initialRouteName}>
        <Stack.Screen name="LanguageSelection" component={LanguageSelectionScreen} />
        <Stack.Screen name="LanguageSettings" component={LanguageSettingsScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="CreateAccount" component={CreateAccountScreen} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
        <Stack.Screen name="HomeNative" component={HomeNativeScreen} options={mainTabScreenOptions} />
        <Stack.Screen name="ExamNative" component={ExamNativeScreen} />
        <Stack.Screen name="ExamInstructionsNative" component={ExamInstructionsNativeScreen} options={mainTabScreenOptions} />
        <Stack.Screen name="ExamTypeSelectNative" component={ExamTypeSelectNativeScreen} />
        <Stack.Screen name="StartExamNative" component={StartExamNativeScreen} />
        <Stack.Screen name="PracticeNoSelectedNative" component={PracticeNoSelectedNativeScreen} />
        <Stack.Screen name="PracticeSelectedNative" component={PracticeSelectedNativeScreen} />
        <Stack.Screen name="TestFailedNative" component={TestFailedNativeScreen} />
        <Stack.Screen name="TestPassedNative" component={TestPassedNativeScreen} />
        <Stack.Screen name="PerformanceNative" component={PerformanceNativeScreen} options={mainTabScreenOptions} />
        <Stack.Screen name="PerformanceReviewNative" component={PerformanceReviewNativeScreen} />
        <Stack.Screen name="ReadingNative" component={ReadingNativeScreen} options={mainTabScreenOptions} />
        <Stack.Screen name="HelpCenterNative" component={HelpCenterNativeScreen} />
        <Stack.Screen name="SubscriptionNative" component={SubscriptionNativeScreen} />
        <Stack.Screen name="PaymentNative" component={PaymentNativeScreen} />
        <Stack.Screen name="ProfileNative" component={ProfileNativeScreen} />
        <Stack.Screen name="ScreensHub" component={ScreensHubScreen} />
        <Stack.Screen name="ReferenceImage" component={ReferenceImageScreen} />
        <Stack.Screen name="VideoCourseList" component={VideoCourseListScreen} options={mainTabScreenOptions} />
        <Stack.Screen name="VideoCoursePlayer" component={VideoCoursePlayerScreen} />
        <Stack.Screen name="HelpCenter" component={HelpCenterScreen} />
        <Stack.Screen name="PdfViewer" component={PdfViewerScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    'Poppins-Regular': Poppins_400Regular,
    'Poppins-Medium': Poppins_500Medium,
    'Poppins-SemiBold': Poppins_600SemiBold,
    'Poppins-Bold': Poppins_700Bold,
    'Poppins-ExtraBold': Poppins_800ExtraBold,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" />
        <AppFlowProvider>
          <NetworkStatusProvider>
            <AuthProvider>
              <GateModalProvider>
                <FullScreenErrorBoundary>
                  <View style={styles.app}>
                    <OfflineBanner />
                    <RootNavigator />
                  </View>
                </FullScreenErrorBoundary>
              </GateModalProvider>
            </AuthProvider>
          </NetworkStatusProvider>
        </AppFlowProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  app: {
    flex: 1,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.canvas,
    gap: 12,
  },
  appSkeletonLogo: {
    width: 72,
    height: 72,
    borderRadius: 18,
  },
  appSkeletonLine: {
    width: 156,
    height: 14,
    borderRadius: 8,
  },
  appSkeletonLineShort: {
    width: 108,
    height: 10,
    borderRadius: 8,
  },
});
