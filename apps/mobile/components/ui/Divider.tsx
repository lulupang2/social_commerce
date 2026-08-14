import { StyleSheet, View, type ViewProps } from 'react-native';

import { colors, spacing } from '../../lib/theme';
import { AppText } from '../../lib/typography';

export interface DividerProps extends ViewProps {
  label?: string;
  inset?: boolean;
}

export function Divider({ label, inset = false, style, ...props }: DividerProps) {
  if (!label) {
    return (
      <View
        {...props}
        accessibilityRole="none"
        style={[styles.line, inset && styles.inset, style]}
      />
    );
  }

  return (
    <View
      {...props}
      accessibilityRole="none"
      style={[styles.labeled, inset && styles.inset, style]}
    >
      <View style={styles.flexLine} />
      <AppText style={styles.label} variant="caption">
        {label}
      </AppText>
      <View style={styles.flexLine} />
    </View>
  );
}

const styles = StyleSheet.create({
  line: { backgroundColor: colors.border, height: StyleSheet.hairlineWidth },
  inset: { marginHorizontal: spacing.page },
  labeled: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  flexLine: { backgroundColor: colors.border, flex: 1, height: StyleSheet.hairlineWidth },
  label: { color: colors.textMuted },
});
