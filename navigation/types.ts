import { ReferenceScreenKey } from '../assets/referenceScreens';

export type ExamMode = 'traffic' | 'signs';

export type ExamAnswerDetail = {
  questionId: string;
  questionText: string;
  questionImageUrls?: string[];
  options?: Array<{
    id: string;
    text: string;
    imageUrl?: string | null;
    isCorrect: boolean;
  }>;
  selectedOptionId: string | null;
  selectedOptionText: string | null;
  correctOptionId: string | null;
  correctOptionText: string | null;
  explanation?: string | null;
  isCorrect: boolean;
};

export type ExamResultParams = {
  mode?: ExamMode;
  title?: string;
  correct?: number;
  total?: number;
  percent?: number;
  timeLabel?: string;
  passed?: boolean;
  answeredCount?: number;
  startedAt?: string;
  finishedAt?: string;
  elapsedSec?: number;
  answerDetails?: ExamAnswerDetail[];
};

export type RootStackParamList = {
  LanguageSelection: { changeOnly?: boolean } | undefined;
  LanguageSettings: undefined;
  Login: { prefill?: { phone?: string; name?: string }; showSignupSuccess?: boolean } | undefined;
  CreateAccount: undefined;
  ForgotPassword: undefined;
  ResetPassword: undefined;
  HomeNative: undefined;
  ExamNative: { mode?: ExamMode; trial?: boolean } | undefined;
  ExamInstructionsNative: { trial?: boolean } | undefined;

  ExamTypeSelectNative: { trial?: boolean } | undefined;
  StartExamNative: { gateFor?: 'exam' | 'read' | 'watch' } | undefined;
  PracticeNoSelectedNative: undefined;
  PracticeSelectedNative: undefined;
  TestFailedNative: ExamResultParams | undefined;
  TestPassedNative: ExamResultParams | undefined;
  PerformanceNative: undefined;
  CertificateNative: undefined;
  CertificateWebViewer: { title?: string; url: string } | undefined;
  CertificatePaymentNative: { requestId?: string; amountRwf?: number } | undefined;

  PerformanceReviewNative:
    | {
        title?: string;
        dateLabel?: string;
        correct?: number;
        total?: number;
        percent?: number;
        timeLabel?: string;
        passed?: boolean;
        answeredCount?: number;
        startedAt?: string;
        finishedAt?: string;
        elapsedSec?: number;
        answerDetails?: ExamAnswerDetail[];
      }
    | undefined;
  ReadingNative: { initialTab?: 'documents' | 'signs' } | undefined;
  HelpCenterNative: undefined;
  SubscriptionNative: undefined;
  PaymentNative:
    | {
        planTitle?: string;
        amountRwf?: number;
        subscriptionType?: string;
        paymentLanguage?: 'en' | 'rw' | 'fr';
      }
    | undefined;
  ProfileNative: undefined;
  ScreensHub: undefined;
  ReferenceImage: { key: ReferenceScreenKey };
  VideoCourseList: undefined;
  VideoCoursePlayer:
    | {
        title?: string;
        videoUrl?: string;
        videoId?: string;
        currentIndex?: number;
        allVideos?: Array<{
          _id?: string;
          title?: string;
          videoUrl?: string;
          thumbUri?: string;
          duration?: string;
        }>;
      }
    | undefined;
  HelpCenter: undefined;
  PdfViewer: { title: string; url: string };
};
