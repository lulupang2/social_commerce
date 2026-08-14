import { StyleSheet, View, type ViewProps } from 'react-native';

import { colors, elevation, radii, spacing } from '../../lib/theme';

export interface SurfaceProps extends ViewProps {
  variant?: 'plain' | 'raised' | 'outlined' | 'subtle' | 'accent';
  padding?: 'none' | 'small' | 'medium' | 'large';
}

const paddingStyles = StyleSheet.create({
  none: { padding: spacing.none },
  small: { padding: spacing.md },
  medium: { padding: spacing.lg },
  large: { padding: spacing.xxl },
});

const variantStyles = StyleSheet.create({
  plain: { backgroundColor: colors.surface },
  raised: { backgroundColor: colors.surface, ...elevation.low },
  outlined: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
  subtle: { backgroundColor: colors.surfaceSubtle },
  accent: { backgroundColor: colors.accentSoft, borderColor: colors.accent, borderWidth: 1 },
});

export function Surface({ variant = 'plain', padding = 'medium', style, ...props }: SurfaceProps) {
  return (
    <View {...props} style={[styles.base, variantStyles[variant], paddingStyles[padding], style]} />
  );
}

const styles = StyleSheet.create({ base: { borderRadius: radii.lg } });
