import { Platform, type TextStyle, type ViewStyle } from 'react-native';

const palette = {
  ice50: '#F4F8FC',
  ice100: '#E8F0F7',
  ice200: '#CFDDEA',
  slate300: '#9BA9B7',
  slate500: '#617080',
  slate700: '#344454',
  slate900: '#162331',
  white: '#FFFFFF',
  orange100: '#FFF0EB',
  orange500: '#E85D3F',
  orange600: '#C9472D',
  green100: '#EAF7F0',
  green600: '#227A52',
  amber100: '#FFF6DE',
  amber600: '#A96708',
  red100: '#FDEDED',
  red600: '#B73D45',
  blue100: '#E8F1FB',
  blue600: '#27689F',
  black: '#000000',
} as const;

/** Semantic colors. Components should consume these instead of raw hex values. */
export const colors = {
  background: palette.ice50,
  surface: palette.white,
  surfaceSubtle: palette.ice100,
  surfaceStrong: palette.slate900,
  text: palette.slate900,
  textMuted: palette.slate500,
  textSubtle: palette.slate300,
  textInverse: palette.white,
  border: palette.ice200,
  borderStrong: palette.slate300,
  primary: palette.slate900,
  primaryPressed: palette.slate700,
  onPrimary: palette.white,
  accent: palette.orange500,
  accentPressed: palette.orange600,
  accentSoft: palette.orange100,
  success: palette.green600,
  successSoft: palette.green100,
  warning: palette.amber600,
  warningSoft: palette.amber100,
  error: palette.red600,
  errorSoft: palette.red100,
  info: palette.blue600,
  infoSoft: palette.blue100,
  focus: palette.blue600,
  disabledSurface: palette.ice100,
  disabledText: palette.slate300,
  scrim: 'rgba(22, 35, 49, 0.48)',
  transparent: 'transparent',

  // Stable names used by the current route layer.
  ink: palette.slate900,
  muted: palette.slate500,
  subtle: palette.slate300,
  canvas: palette.ice50,
  line: palette.ice200,
  navy: palette.slate900,
  navySoft: palette.blue100,
  green: palette.green600,
  yellow: palette.amber600,
  danger: palette.red600,
} as const;

export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  jumbo: 40,
  page: 20,
} as const;

export const radii = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
} as const;

export const iconSizes = {
  xs: 14,
  sm: 18,
  md: 22,
  lg: 28,
  xl: 36,
} as const;

export const interaction = {
  minimumTarget: 44,
  controlHeight: 48,
  controlHeightLarge: 54,
  disabledOpacity: 0.56,
  pressedOpacity: 0.82,
} as const;

const nativeShadow = Platform.select<ViewStyle>({
  ios: {
    shadowColor: palette.slate900,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.09,
    shadowRadius: 16,
  },
  android: { elevation: 3 },
  default: {
    boxShadow: '0 6px 20px rgba(22, 35, 49, 0.09)',
  },
});

export const elevation = {
  none: {} satisfies ViewStyle,
  low: {
    ...nativeShadow,
  } satisfies ViewStyle,
  medium: {
    ...Platform.select<ViewStyle>({
      ios: {
        shadowColor: palette.slate900,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.13,
        shadowRadius: 24,
      },
      android: { elevation: 6 },
      default: { boxShadow: '0 10px 30px rgba(22, 35, 49, 0.13)' },
    }),
  } satisfies ViewStyle,
} as const;

export const stateStyles = {
  focus: {
    outlineColor: colors.focus,
    outlineOffset: 2,
    outlineStyle: 'solid',
    outlineWidth: 2,
  } satisfies ViewStyle,
  disabled: {
    backgroundColor: colors.disabledSurface,
    opacity: interaction.disabledOpacity,
  } satisfies ViewStyle,
  error: {
    backgroundColor: colors.errorSoft,
    borderColor: colors.error,
  } satisfies ViewStyle,
  success: {
    backgroundColor: colors.successSoft,
    borderColor: colors.success,
  } satisfies ViewStyle,
} as const;

export const motion = {
  quick: 120,
  standard: 200,
} as const;

export const hitSlop = { top: 4, right: 4, bottom: 4, left: 4 } as const;

export type SemanticColor = keyof typeof colors;
export type TypographyStyle = Pick<
  TextStyle,
  'fontFamily' | 'fontSize' | 'lineHeight' | 'letterSpacing'
>;
