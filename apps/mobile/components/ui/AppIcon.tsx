import type { ReactNode } from 'react';
import { View, type ColorValue, type StyleProp, type ViewStyle } from 'react-native';

import { colors, iconSizes } from '../../lib/theme';

export type AppIconName =
  | 'home'
  | 'community'
  | 'add'
  | 'chat'
  | 'profile'
  | 'heart'
  | 'heartFilled'
  | 'back'
  | 'chevronRight'
  | 'close'
  | 'check'
  | 'search'
  | 'location'
  | 'filter'
  | 'image'
  | 'info'
  | 'warning'
  | 'refresh';

export interface AppIconProps {
  name: AppIconName;
  size?: number;
  color?: ColorValue;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function AppIcon({
  name,
  size = iconSizes.md,
  color = colors.text,
  accessibilityLabel,
  style,
}: AppIconProps) {
  const stroke = Math.max(1.5, size / 12);
  const line = { backgroundColor: color, borderRadius: stroke, position: 'absolute' } as const;
  let glyph: ReactNode;

  switch (name) {
    case 'home':
      glyph = (
        <>
          <View style={[line, { width: size * 0.55, height: stroke, left: size * 0.08, top: size * 0.32, transform: [{ rotate: '-42deg' }] }]} />
          <View style={[line, { width: size * 0.55, height: stroke, right: size * 0.08, top: size * 0.32, transform: [{ rotate: '42deg' }] }]} />
          <View style={{ position: 'absolute', width: size * 0.58, height: size * 0.48, left: size * 0.21, bottom: size * 0.1, borderColor: color, borderWidth: stroke, borderTopWidth: 0, borderRadius: stroke }} />
        </>
      );
      break;
    case 'community':
      glyph = (
        <>
          <View style={{ position: 'absolute', width: size * 0.26, height: size * 0.26, left: size * 0.17, top: size * 0.13, borderColor: color, borderWidth: stroke, borderRadius: size }} />
          <View style={{ position: 'absolute', width: size * 0.26, height: size * 0.26, right: size * 0.17, top: size * 0.13, borderColor: color, borderWidth: stroke, borderRadius: size }} />
          <View style={{ position: 'absolute', width: size * 0.42, height: size * 0.31, left: size * 0.04, bottom: size * 0.13, borderColor: color, borderWidth: stroke, borderRadius: size, borderBottomWidth: 0 }} />
          <View style={{ position: 'absolute', width: size * 0.42, height: size * 0.31, right: size * 0.04, bottom: size * 0.13, borderColor: color, borderWidth: stroke, borderRadius: size, borderBottomWidth: 0 }} />
        </>
      );
      break;
    case 'add':
      glyph = (
        <>
          <View style={[line, { width: size * 0.7, height: stroke, left: size * 0.15, top: (size - stroke) / 2 }]} />
          <View style={[line, { width: stroke, height: size * 0.7, left: (size - stroke) / 2, top: size * 0.15 }]} />
        </>
      );
      break;
    case 'chat':
      glyph = (
        <>
          <View style={{ position: 'absolute', width: size * 0.8, height: size * 0.62, left: size * 0.1, top: size * 0.13, borderColor: color, borderWidth: stroke, borderRadius: size * 0.18 }} />
          <View style={{ position: 'absolute', width: size * 0.22, height: size * 0.22, right: size * 0.18, bottom: size * 0.12, borderLeftColor: color, borderLeftWidth: stroke, transform: [{ rotate: '45deg' }] }} />
        </>
      );
      break;
    case 'profile':
      glyph = (
        <>
          <View style={{ position: 'absolute', width: size * 0.34, height: size * 0.34, left: size * 0.33, top: size * 0.1, borderColor: color, borderWidth: stroke, borderRadius: size }} />
          <View style={{ position: 'absolute', width: size * 0.72, height: size * 0.38, left: size * 0.14, bottom: size * 0.08, borderColor: color, borderWidth: stroke, borderRadius: size, borderBottomWidth: 0 }} />
        </>
      );
      break;
    case 'heart':
    case 'heartFilled': {
      const fill = name === 'heartFilled' ? color : colors.transparent;
      glyph = (
        <View style={{ position: 'absolute', width: size * 0.56, height: size * 0.56, left: size * 0.22, top: size * 0.25, backgroundColor: fill, borderColor: color, borderWidth: stroke, borderTopLeftRadius: size * 0.34, borderTopRightRadius: size * 0.34, borderBottomLeftRadius: size * 0.08, transform: [{ rotate: '45deg' }] }} />
      );
      break;
    }
    case 'back':
      glyph = (
        <>
          <View style={[line, { width: size * 0.68, height: stroke, left: size * 0.16, top: (size - stroke) / 2 }]} />
          <View style={{ position: 'absolute', width: size * 0.38, height: size * 0.38, left: size * 0.16, top: size * 0.31, borderLeftColor: color, borderTopColor: color, borderLeftWidth: stroke, borderTopWidth: stroke, transform: [{ rotate: '-45deg' }] }} />
        </>
      );
      break;
    case 'chevronRight':
      glyph = <View style={{ width: size * 0.42, height: size * 0.42, borderRightColor: color, borderTopColor: color, borderRightWidth: stroke, borderTopWidth: stroke, transform: [{ rotate: '45deg' }] }} />;
      break;
    case 'close':
      glyph = (
        <>
          <View style={[line, { width: size * 0.72, height: stroke, transform: [{ rotate: '45deg' }] }]} />
          <View style={[line, { width: size * 0.72, height: stroke, transform: [{ rotate: '-45deg' }] }]} />
        </>
      );
      break;
    case 'check':
      glyph = <View style={{ width: size * 0.62, height: size * 0.34, borderLeftColor: color, borderBottomColor: color, borderLeftWidth: stroke, borderBottomWidth: stroke, transform: [{ rotate: '-45deg' }, { translateY: -size * 0.05 }] }} />;
      break;
    case 'search':
      glyph = (
        <>
          <View style={{ position: 'absolute', width: size * 0.58, height: size * 0.58, left: size * 0.12, top: size * 0.1, borderColor: color, borderWidth: stroke, borderRadius: size }} />
          <View style={[line, { width: size * 0.38, height: stroke, right: size * 0.04, bottom: size * 0.18, transform: [{ rotate: '45deg' }] }]} />
        </>
      );
      break;
    case 'location':
      glyph = (
        <>
          <View style={{ position: 'absolute', width: size * 0.62, height: size * 0.62, left: size * 0.19, top: size * 0.08, borderColor: color, borderWidth: stroke, borderRadius: size * 0.32, transform: [{ rotate: '45deg' }] }} />
          <View style={{ position: 'absolute', width: size * 0.14, height: size * 0.14, left: size * 0.43, top: size * 0.3, borderColor: color, borderWidth: stroke, borderRadius: size }} />
        </>
      );
      break;
    case 'filter':
      glyph = (
        <>
          {[0.24, 0.5, 0.76].map((top, index) => (
            <View key={top} style={[line, { width: size * 0.78, height: stroke, left: size * 0.11, top: size * top }]}> 
              <View style={{ position: 'absolute', width: size * 0.18, height: size * 0.18, left: size * ([0.16, 0.52, 0.3][index] ?? 0.3), top: -size * 0.07, backgroundColor: colors.surface, borderColor: color, borderWidth: stroke, borderRadius: size }} />
            </View>
          ))}
        </>
      );
      break;
    case 'image':
      glyph = (
        <>
          <View style={{ position: 'absolute', width: size * 0.82, height: size * 0.68, left: size * 0.09, top: size * 0.16, borderColor: color, borderWidth: stroke, borderRadius: size * 0.1 }} />
          <View style={{ position: 'absolute', width: size * 0.14, height: size * 0.14, right: size * 0.22, top: size * 0.27, backgroundColor: color, borderRadius: size }} />
          <View style={{ position: 'absolute', width: size * 0.48, height: size * 0.32, left: size * 0.2, bottom: size * 0.2, borderLeftColor: color, borderTopColor: color, borderLeftWidth: stroke, borderTopWidth: stroke, transform: [{ rotate: '45deg' }] }} />
        </>
      );
      break;
    case 'info':
    case 'warning':
      glyph = (
        <>
          <View style={{ position: 'absolute', width: size * 0.78, height: size * 0.78, left: size * 0.11, top: size * 0.11, borderColor: color, borderWidth: stroke, borderRadius: name === 'info' ? size : size * 0.12, transform: name === 'warning' ? [{ rotate: '45deg' }] : undefined }} />
          <View style={[line, { width: stroke, height: size * 0.32, left: (size - stroke) / 2, top: size * 0.29 }]} />
          <View style={{ position: 'absolute', width: stroke * 1.25, height: stroke * 1.25, left: (size - stroke * 1.25) / 2, bottom: size * 0.22, backgroundColor: color, borderRadius: size }} />
        </>
      );
      break;
    case 'refresh':
      glyph = (
        <>
          <View style={{ position: 'absolute', width: size * 0.7, height: size * 0.7, borderColor: color, borderWidth: stroke, borderRightColor: colors.transparent, borderRadius: size }} />
          <View style={{ position: 'absolute', width: size * 0.25, height: size * 0.25, right: size * 0.09, top: size * 0.09, borderRightColor: color, borderTopColor: color, borderRightWidth: stroke, borderTopWidth: stroke }} />
        </>
      );
      break;
  }

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessible={Boolean(accessibilityLabel)}
      style={[{ alignItems: 'center', height: size, justifyContent: 'center', width: size }, style]}
    >
      {glyph}
    </View>
  );
}
