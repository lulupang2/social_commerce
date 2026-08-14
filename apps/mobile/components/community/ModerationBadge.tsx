import type { CommunityPostStatus } from '@icegear/domain';
import { StyleSheet, View } from 'react-native';

import { AppText as Text } from '../../lib/typography';

interface ModerationBadgeProps {
  status: CommunityPostStatus;
  isDemo?: boolean;
}

export function ModerationBadge({ status, isDemo }: ModerationBadgeProps) {
  if (status === 'active' && !isDemo) {
    return null;
  }

  const getStatusConfig = () => {
    switch (status) {
      case 'draft':
        return { label: '검토 중 (드래프트)', bgColor: '#FEF3C7', textColor: '#D97706' };
      case 'hidden':
        return { label: '숨김 처리됨', bgColor: '#F3F4F6', textColor: '#4B5563' };
      case 'deleted':
        return { label: '삭제됨', bgColor: '#FEE2E2', textColor: '#DC2626' };
      case 'active':
      default:
        return null;
    }
  };

  const config = getStatusConfig();

  return (
    <View style={styles.badgeContainer}>
      {isDemo && (
        <View
          style={[styles.badge, { backgroundColor: '#E0E7FF' }]}
          accessibilityLabel="데모 데이터 표시"
        >
          <Text style={[styles.badgeText, { color: '#3730A3' }]}>DEMO</Text>
        </View>
      )}
      {config && (
        <View
          style={[styles.badge, { backgroundColor: config.bgColor }]}
          accessibilityLabel={`상태: ${config.label}`}
        >
          <Text style={[styles.badgeText, { color: config.textColor }]}>{config.label}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badgeContainer: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
