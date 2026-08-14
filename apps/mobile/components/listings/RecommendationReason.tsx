import { StyleSheet, View, type ViewProps } from 'react-native';

import { colors, radii, spacing } from '../../lib/theme';
import { AppText } from '../../lib/typography';
import { AppIcon } from '../ui/AppIcon';

export interface RecommendationReasonProps extends ViewProps {
  reason: string;
  compact?: boolean;
}

export function RecommendationReason({ reason, compact = false, style, ...props }: RecommendationReasonProps) {
  return (
    <View
      {...props}
      accessibilityLabel={`추천 이유: ${reason}`}
      style={[styles.container, compact && styles.compact, style]}
    >
      <AppIcon color={colors.info} name="info" size={14} />
      <AppText numberOfLines={compact ? 1 : 2} style={styles.text} variant="caption">
        {reason}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.infoSoft, borderRadius: radii.sm, flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  compact: { maxWidth: '100%' },
  text: { color: colors.info, flexShrink: 1 },
});
