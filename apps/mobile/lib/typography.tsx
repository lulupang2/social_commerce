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

/**
 * App-wide text primitive. Existing fontWeight styles are mapped to an actual
 * Pretendard face so Android never has to synthesize a Korean font weight.
 */
export function AppText({ style, ...props }: TextProps) {
  const fontFamily = resolveFamily(style);
  return <NativeText {...props} style={[style, { fontFamily, fontWeight: 'normal' }]} />;
}

/** TextInput counterpart to AppText with the same Pretendard weight mapping. */
export function AppTextInput({ style, ...props }: TextInputProps) {
  const fontFamily = resolveFamily(style);
  return <NativeTextInput {...props} style={[style, { fontFamily, fontWeight: 'normal' }]} />;
}
