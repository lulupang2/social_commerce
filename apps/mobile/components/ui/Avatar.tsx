import { Image, StyleSheet, View, type ViewProps } from 'react-native';

import { initials } from '../../lib/format';
import { colors, interaction, radii } from '../../lib/theme';
import { AppText } from '../../lib/typography';

export interface AvatarProps extends ViewProps {
  name: string;
  imageUrl?: string | null;
  size?: number;
  status?: 'online' | 'offline';
}

export function Avatar({ name, imageUrl, size = interaction.minimumTarget, status, style, ...props }: AvatarProps) {
  const statusSize = Math.max(10, size * 0.24);

  return (
    <View
      {...props}
      accessibilityLabel={`${name} 프로필 사진`}
      accessibilityRole="image"
      style={[styles.container, { height: size, width: size }, style]}
    >
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={{ borderRadius: size / 2, height: size, width: size }} />
      ) : (
        <View style={[styles.fallback, { borderRadius: size / 2, height: size, width: size }]}>
          <AppText style={[styles.initials, { fontSize: Math.max(12, size * 0.36) }]} variant="bodyStrong">
            {initials(name)}
          </AppText>
        </View>
      )}
      {status ? (
        <View
          accessibilityLabel={status === 'online' ? '온라인' : '오프라인'}
          style={[
            styles.status,
            {
              backgroundColor: status === 'online' ? colors.success : colors.textSubtle,
              borderRadius: radii.pill,
              height: statusSize,
              width: statusSize,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'relative' },
  fallback: { alignItems: 'center', backgroundColor: colors.infoSoft, justifyContent: 'center' },
  initials: { color: colors.info },
  status: { borderColor: colors.surface, borderWidth: 2, bottom: 0, position: 'absolute', right: 0 },
});
