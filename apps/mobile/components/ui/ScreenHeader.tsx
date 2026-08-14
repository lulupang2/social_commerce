import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { colors, interaction, spacing } from '../../lib/theme';
import { AppText } from '../../lib/typography';
import { IconButton } from './IconButton';

export interface ScreenHeaderProps extends ViewProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  onBack?: () => void;
  backAccessibilityLabel?: string;
  action?: ReactNode;
}

export function ScreenHeader({
  title,
  subtitle,
  eyebrow,
  onBack,
  backAccessibilityLabel = '뒤로 가기',
  action,
  style,
  ...props
}: ScreenHeaderProps) {
  return (
    <View {...props} accessibilityRole="header" style={[styles.container, style]}>
      {onBack ? (
        <View style={styles.leading}>
          <IconButton accessibilityLabel={backAccessibilityLabel} icon="back" onPress={onBack} />
        </View>
      ) : null}
      <View style={styles.copy}>
        {eyebrow ? (
          <AppText style={styles.eyebrow} variant="caption">
            {eyebrow}
          </AppText>
        ) : null}
        <AppText numberOfLines={2} style={styles.title} variant="title">
          {title}
        </AppText>
        {subtitle ? (
          <AppText style={styles.subtitle} variant="body">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    minHeight: interaction.minimumTarget,
    paddingHorizontal: spacing.page,
    paddingVertical: spacing.md,
  },
  leading: { marginLeft: -spacing.md, marginRight: spacing.xs },
  copy: { flex: 1, gap: spacing.xs },
  eyebrow: { color: colors.accent, textTransform: 'uppercase' },
  title: { color: colors.text },
  subtitle: { color: colors.textMuted },
  action: { marginLeft: spacing.md, minHeight: interaction.minimumTarget, justifyContent: 'center' },
});
