import { Platform } from 'react-native';

export const colors = {
  primary: '#2563EB',
  secondary: '#2D5FBF',
  darkEmphasis: '#1E3A8A',
  background: '#F9FAFB',
  surface: '#FFFFFF',
  surfaceAlt: '#F3F4F6',
  blueTint: '#EFF6FF',
  textPrimary: '#111827',
  textSecondary: '#374151',
  textMuted: '#6B7280',
  border: '#E5E7EB',
  success: '#2563EB',
  successSoft: '#EFF6FF',
  warning: '#F05252',
  warningSoft: '#FFFBEB',
  error: '#F05252',
  errorSoft: '#FDE8E8',
  info: '#1C64F2',
  infoSoft: '#EFF6FF',
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(17,24,39,0.48)',
  overlaySoft: 'rgba(17,24,39,0.12)',
  focus: '#2563EB',
  providerMtn: '#FFCC00',
  providerAirtel: '#E3242B',

  // Compatibility aliases keep existing screens compiling while mapping the
  // older mobile names onto the new IBYAPA web-led palette.
  brand: '#2563EB',
  brandStrong: '#2D5FBF',
  brandSoft: '#EFF6FF',
  brandMist: '#EFF6FF',
  canvas: '#F9FAFB',
  ink: '#111827',
  inkMuted: '#374151',
  inkSoft: '#6B7280',
  line: '#E5E7EB',
  danger: '#F05252',
  dangerSoft: '#FDE8E8',
  amber: '#F05252',
  amberSoft: '#FFFBEB',
  green: '#2563EB',
  greenSoft: '#EFF6FF',
  red: '#F05252',
  redSoft: '#FDE8E8',
} as const;

export const gradients = {
  header: [colors.darkEmphasis, colors.secondary] as const,
  hero: [colors.blueTint, colors.surface] as const,
  cta: [colors.primary, colors.secondary] as const,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 18,
  xxl: 24,
  sheet: 24,
  pill: 999,
} as const;

const font = {
  regular: 'Poppins-Regular',
  medium: 'Poppins-Medium',
  semiBold: 'Poppins-SemiBold',
  bold: 'Poppins-Bold',
  extraBold: 'Poppins-ExtraBold',
} as const;

export const typography = {
  caption: {
    fontFamily: font.medium,
    fontSize: 12,
    lineHeight: 17,
  },
  body: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 21,
  },
  bodyStrong: {
    fontFamily: font.semiBold,
    fontSize: 14,
    lineHeight: 20,
  },
  sectionTitle: {
    fontFamily: font.bold,
    fontSize: 17,
    lineHeight: 23,
  },
  screenTitle: {
    fontFamily: font.bold,
    fontSize: 18,
    lineHeight: 24,
  },
  heading: {
    fontFamily: font.bold,
    fontSize: 22,
    lineHeight: 30,
    letterSpacing: -0.25,
  },
  result: {
    fontFamily: font.extraBold,
    fontSize: 30,
    lineHeight: 38,
    letterSpacing: -0.5,
  },
  eyebrow: {
    fontFamily: font.bold,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.6,
  },
  title: {
    fontFamily: font.bold,
    fontSize: 17,
    lineHeight: 23,
  },
  display: {
    fontFamily: font.extraBold,
    fontSize: 30,
    lineHeight: 38,
    letterSpacing: -0.5,
  },
} as const;

export const shadows = {
  card: Platform.select({
    ios: {
      shadowColor: '#111827',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.06,
      shadowRadius: 18,
    },
    default: {
      elevation: 2,
      shadowColor: '#111827',
    },
  }),
  subtle: Platform.select({
    ios: {
      shadowColor: '#111827',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 10,
    },
    default: {
      elevation: 1,
      shadowColor: '#111827',
    },
  }),
  floating: Platform.select({
    ios: {
      shadowColor: '#111827',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.14,
      shadowRadius: 24,
    },
    default: {
      elevation: 8,
      shadowColor: '#111827',
    },
  }),
} as const;
