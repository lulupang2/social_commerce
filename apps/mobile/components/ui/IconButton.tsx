import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, interaction, radii, stateStyles } from '../../lib/theme';
import { AppIcon, type AppIconName } from './AppIcon';

export interface IconButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  icon: AppIconName;
  accessibilityLabel: string;
  size?: number;
  iconSize?: number;
  tone?: 'default' | 'surface' | 'accent' | 'danger';
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({
  icon,
  accessibilityLabel,
  size = interaction.minimumTarget,
  iconSize = 22,
  tone = 'default',
  selected = false,
  disabled,
  accessibilityState,
  onFocus,
  onBlur,
  style,
  ...props
}: IconButtonProps) {
  const [focused, setFocused] = useState(false);
  const backgroundColor =
    tone === 'surface'
      ? colors.surface
      : tone === 'accent'
        ? colors.accentSoft
        : tone === 'danger'
          ? colors.errorSoft
          : colors.transparent;
  const iconColor =
    selected || tone === 'accent' ? colors.accent : tone === 'danger' ? colors.error : colors.text;

  return (
    <Pressable
      {...props}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ ...accessibilityState, disabled: Boolean(disabled), selected }}
      disabled={disabled}
      hitSlop={Math.max(0, (interaction.minimumTarget - size) / 2)}
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
        {
          backgroundColor,
          height: Math.max(size, interaction.minimumTarget),
          width: Math.max(size, interaction.minimumTarget),
        },
        pressed && !disabled && styles.pressed,
        focused && stateStyles.focus,
        disabled && styles.disabled,
        style,
      ]}
    >
      <AppIcon
        color={iconColor}
        name={selected && icon === 'heart' ? 'heartFilled' : icon}
        size={iconSize}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', borderRadius: radii.pill, justifyContent: 'center' },
  pressed: { opacity: interaction.pressedOpacity },
  disabled: { opacity: interaction.disabledOpacity },
});
