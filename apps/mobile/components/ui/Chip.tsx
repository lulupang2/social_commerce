import { useState } from 'react';
import { Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { colors, interaction, radii, spacing, stateStyles } from '../../lib/theme';
import { AppText } from '../../lib/typography';
import { AppIcon, type AppIconName } from './AppIcon';

export interface ChipProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  icon?: AppIconName;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Chip({
  label,
  icon,
  selected = false,
  onPress,
  disabled,
  accessibilityLabel = label,
  accessibilityState,
  onFocus,
  onBlur,
  style,
  ...props
}: ChipProps) {
  const [focused, setFocused] = useState(false);
  const content = (
    <>
      {icon ? <AppIcon color={selected ? colors.textInverse : colors.textMuted} name={icon} size={16} /> : null}
      <AppText style={{ color: selected ? colors.textInverse : colors.text }} variant="label">
        {label}
      </AppText>
    </>
  );

  if (!onPress) {
    return <View style={[styles.base, selected && styles.selected, disabled && styles.disabled, style]}>{content}</View>;
  }

  return (
    <Pressable
      {...props}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ ...accessibilityState, disabled: Boolean(disabled), selected }}
      disabled={disabled}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        selected && styles.selected,
        pressed && styles.pressed,
        focused && stateStyles.focus,
        disabled && styles.disabled,
        style,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: interaction.minimumTarget,
    paddingHorizontal: spacing.md,
  },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  pressed: { opacity: interaction.pressedOpacity },
  disabled: { opacity: interaction.disabledOpacity },
});
