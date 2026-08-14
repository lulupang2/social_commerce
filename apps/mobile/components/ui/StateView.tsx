import { ActivityIndicator, StyleSheet, View, type ViewProps } from 'react-native';

import { colors, spacing } from '../../lib/theme';
import { AppText } from '../../lib/typography';
import { AppIcon, type AppIconName } from './AppIcon';
import { Button } from './Button';

export type StateViewKind = 'loading' | 'empty' | 'error' | 'success';

export interface StateViewProps extends ViewProps {
  kind: StateViewKind;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: AppIconName;
}

const defaultIcons: Record<Exclude<StateViewKind, 'loading'>, AppIconName> = {
  empty: 'image',
  error: 'warning',
  success: 'check',
};

export function StateView({
  kind,
  title,
  message,
  actionLabel,
  onAction,
  icon,
  style,
  ...props
}: StateViewProps) {
  const tone = kind === 'error' ? colors.error : kind === 'success' ? colors.success : colors.textMuted;

  return (
    <View
      {...props}
      accessibilityLiveRegion="polite"
      accessibilityRole={kind === 'error' ? 'alert' : undefined}
      style={[styles.container, style]}
    >
      {kind === 'loading' ? (
        <ActivityIndicator color={colors.accent} size="large" />
      ) : (
        <View style={[styles.icon, { backgroundColor: kind === 'error' ? colors.errorSoft : kind === 'success' ? colors.successSoft : colors.surfaceSubtle }]}>
          <AppIcon color={tone} name={icon ?? defaultIcons[kind]} size={28} />
        </View>
      )}
      <AppText style={styles.title} variant="headline">
        {title}
      </AppText>
      {message ? (
        <AppText style={styles.message} variant="body">
          {message}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          leadingIcon={kind === 'error' ? 'refresh' : undefined}
          onPress={onAction}
          variant="secondary"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: spacing.md,
    justifyContent: 'center',
    minHeight: 240,
    padding: spacing.xxl,
  },
  icon: { alignItems: 'center', borderRadius: 28, height: 56, justifyContent: 'center', width: 56 },
  title: { color: colors.text, textAlign: 'center' },
  message: { color: colors.textMuted, maxWidth: 360, textAlign: 'center' },
});
