import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, interaction, radii, spacing, stateStyles } from '../../lib/theme';
import { AppText } from '../../lib/typography';
import { AppIcon, type AppIconName } from './AppIcon';

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'destructive';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: ButtonVariant;
  size?: 'default' | 'large';
  leadingIcon?: AppIconName;
  trailingIcon?: AppIconName;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

const variantStyles = StyleSheet.create({
  primary: { backgroundColor: colors.primary, borderColor: colors.primary },
  accent: { backgroundColor: colors.accent, borderColor: colors.accent },
  secondary: { backgroundColor: colors.surface, borderColor: colors.borderStrong },
  ghost: { backgroundColor: colors.transparent, borderColor: colors.transparent },
  destructive: { backgroundColor: colors.error, borderColor: colors.error },
});

export function Button({
  label,
  variant = 'primary',
  size = 'default',
  leadingIcon,
  trailingIcon,
  loading = false,
  fullWidth = false,
  disabled,
  accessibilityLabel = label,
  accessibilityState,
  onFocus,
  onBlur,
  style,
  ...props
}: ButtonProps) {
  const [focused, setFocused] = useState(false);
  const isDisabled = disabled || loading;
  const foreground = variant === 'secondary' || variant === 'ghost' ? colors.text : colors.textInverse;

  return (
    <Pressable
      {...props}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ ...accessibilityState, busy: loading, disabled: isDisabled }}
      disabled={isDisabled}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        size === 'large' && styles.large,
        fullWidth && styles.fullWidth,
        pressed && !isDisabled && styles.pressed,
        focused && stateStyles.focus,
        isDisabled && stateStyles.disabled,
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? <ActivityIndicator color={foreground} size="small" /> : null}
        {!loading && leadingIcon ? <AppIcon color={foreground} name={leadingIcon} size={18} /> : null}
        <AppText numberOfLines={1} style={{ color: foreground }} variant="label">
          {label}
        </AppText>
        {!loading && trailingIcon ? <AppIcon color={foreground} name={trailingIcon} size={18} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: interaction.controlHeight,
    minWidth: interaction.minimumTarget,
    paddingHorizontal: spacing.lg,
  },
  large: { minHeight: interaction.controlHeightLarge, paddingHorizontal: spacing.xl },
  fullWidth: { alignSelf: 'stretch' },
  pressed: { opacity: interaction.pressedOpacity },
  content: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' },
});
