import { useFonts } from 'expo-font';
import {
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
  type TextInputProps,
  type TextProps,
  type TextStyle,
} from 'react-native';

export const fontFamilies = {
  body: 'IceGearPretendardRegular',
  bodySemiBold: 'IceGearPretendardSemiBold',
  bodyBold: 'IceGearPretendardBold',
  displayBold: 'IceGearPaperlogyBold',
  displayExtraBold: 'IceGearPaperlogyExtraBold',
  accentBold: 'IceGearBarlowCondensedBold',
} as const;

const fontSources = {
  [fontFamilies.body]: require('../assets/fonts/Pretendard-Regular.otf'),
  [fontFamilies.bodySemiBold]: require('../assets/fonts/Pretendard-SemiBold.otf'),
  [fontFamilies.bodyBold]: require('../assets/fonts/Pretendard-Bold.otf'),
  [fontFamilies.displayBold]: require('../assets/fonts/Paperlogy-7Bold.ttf'),
  [fontFamilies.displayExtraBold]: require('../assets/fonts/Paperlogy-8ExtraBold.ttf'),
  [fontFamilies.accentBold]: require('../assets/fonts/BarlowCondensed-Bold.ttf'),
} as const;

export function useIceGearFonts() {
  return useFonts(fontSources);
}

/**
 * Semantic text roles. Paperlogy carries editorial hierarchy, Pretendard keeps
 * Korean body copy legible, and Barlow Condensed is reserved for prices/data.
 */
export const typography = StyleSheet.create({
  display: {
    fontFamily: fontFamilies.displayExtraBold,
    fontSize: 36,
    lineHeight: 42,
    letterSpacing: -1.1,
  },
  title: {
    fontFamily: fontFamilies.displayBold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.7,
  },
  headline: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -0.25,
  },
  body: {
    fontFamily: fontFamilies.body,
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: -0.1,
  },
  bodyStrong: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: -0.1,
  },
  label: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: -0.05,
  },
  caption: {
    fontFamily: fontFamilies.body,
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: 0,
  },
  price: {
    fontFamily: fontFamilies.accentBold,
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: 0.2,
  },
});

export type TypographyVariant = keyof typeof typography;

function numericWeight(weight: TextStyle['fontWeight']): number {
  if (typeof weight === 'number') return weight;
  if (!weight || weight === 'normal') return 400;
  if (weight === 'bold') return 700;
  const parsed = Number(weight);
  return Number.isFinite(parsed) ? parsed : 400;
}

function resolveFamily(style: TextProps['style'] | TextInputProps['style']): string {
  const flattened = StyleSheet.flatten(style);
  if (flattened?.fontFamily) return flattened.fontFamily;

  const weight = numericWeight(flattened?.fontWeight);
  if (weight >= 700) return fontFamilies.bodyBold;
  if (weight >= 600) return fontFamilies.bodySemiBold;
  return fontFamilies.body;
}

export interface AppTextProps extends TextProps {
  variant?: TypographyVariant;
}

/**
 * App-wide text primitive. Explicit fontWeight styles map to real Pretendard
 * files, so Android never synthesizes a Korean font weight.
 */
export function AppText({ style, variant, ...props }: AppTextProps) {
  const roleStyle = variant ? typography[variant] : undefined;
  const fontFamily = resolveFamily([roleStyle, style]);
  return <NativeText {...props} style={[roleStyle, style, { fontFamily, fontWeight: 'normal' }]} />;
}

export interface AppTextInputProps extends TextInputProps {
  variant?: Extract<TypographyVariant, 'body' | 'bodyStrong' | 'label'>;
}

/** TextInput counterpart with the same concrete Pretendard weight mapping. */
export function AppTextInput({ style, variant, ...props }: AppTextInputProps) {
  const roleStyle = variant ? typography[variant] : undefined;
  const fontFamily = resolveFamily([roleStyle, style]);
  return (
    <NativeTextInput {...props} style={[roleStyle, style, { fontFamily, fontWeight: 'normal' }]} />
  );
}
