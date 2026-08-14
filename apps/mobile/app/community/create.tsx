import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import type { CommunityPostType, Sport } from '@icegear/domain';

import { communityTypeLabel, createCommunityPost } from '../../lib/community/repository';
import { sportLabels } from '../../lib/format';
import { colors, radii } from '../../lib/theme';
import { AppText as Text, AppTextInput as TextInput } from '../../lib/typography';
import { ModerationBadge } from '../../components/community/ModerationBadge';

const sportOptions: Array<{ id: Sport | undefined; label: string }> = [
  { id: undefined, label: '전체' },
  { id: 'ski', label: sportLabels.ski },
  { id: 'hockey', label: sportLabels.hockey },
];

const typeOptions: Array<{ id: CommunityPostType; label: string }> = [
  { id: 'discussion', label: communityTypeLabel('discussion') },
  { id: 'question', label: communityTypeLabel('question') },
  { id: 'guide', label: communityTypeLabel('guide') },
  { id: 'review', label: communityTypeLabel('review') },
  { id: 'event', label: communityTypeLabel('event') },
];

export default function CommunityCreateScreen() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sport, setSport] = useState<Sport | undefined>('ski');
  const [type, setType] = useState<CommunityPostType>('discussion');

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('제목을 입력해 주세요.');
      return;
    }
    if (!body.trim()) {
      setError('내용을 입력해 주세요.');
      return;
    }

    setError(null);
    setSaving(true);

    const res = await createCommunityPost({
      title: title.trim(),
      body: body.trim(),
      sport,
      type,
    });

    setSaving(false);

    if (res.error) {
      setError(res.error.message || '검토 요청 등록 중 오류가 발생했습니다.');
      return;
    }

    // REQUIREMENT: Draft creation success language must be "검토 요청" rather than "게시 완료".
    Alert.alert('검토 요청 완료', '게시글 검토 요청이 접수되었습니다. 검토 후 등록됩니다.', [
      {
        text: '확인',
        onPress: () => router.back(),
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}
      >
        <View style={styles.navBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="닫기"
            accessibilityHint="글쓰기 화면을 닫습니다"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          >
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
          <Text style={styles.navTitle}>새 글 검토 요청</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="검토 요청"
            accessibilityHint="작성한 글의 검토를 요청합니다"
            onPress={handleSubmit}
            disabled={saving}
            style={({ pressed }) => [styles.publishButton, pressed && styles.pressed]}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Text style={styles.publishText}>검토 요청</Text>
            )}
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>게시글 작성</Text>
          <Text style={styles.subtitle}>
            커뮤니티 가이드라인을 준수하여 작성해 주세요. 작성 후 검토 절차를 거치게 됩니다.
          </Text>

          {/* Sport selection */}
          <Text style={styles.label}>종목 선택</Text>
          <View style={styles.chipRow}>
            {sportOptions.map((opt) => {
              const active = sport === opt.id;
              return (
                <Pressable
                  key={`sport-${opt.label}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setSport(opt.id)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Post Type selection */}
          <Text style={styles.label}>글 유형 선택</Text>
          <View style={styles.chipRow}>
            {typeOptions.map((opt) => {
              const active = type === opt.id;
              return (
                <Pressable
                  key={`type-${opt.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setType(opt.id)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Title Input */}
          <Text style={styles.label}>제목</Text>
          <TextInput
            style={styles.titleInput}
            placeholder="제목을 입력해 주세요"
            placeholderTextColor={colors.muted}
            value={title}
            onChangeText={setTitle}
            maxLength={100}
            accessibilityLabel="게시글 제목"
          />

          {/* Body Input */}
          <Text style={styles.label}>내용</Text>
          <TextInput
            style={styles.bodyInput}
            placeholder="내용을 입력해 주세요 (장비 리뷰, 정보 공유, 모임 모집 등)"
            placeholderTextColor={colors.muted}
            value={body}
            onChangeText={setBody}
            multiline
            numberOfLines={8}
            textAlignVertical="top"
            accessibilityLabel="게시글 내용"
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.guideline}>
            <View style={styles.guidelineHeader}>
              <Text style={styles.guidelineTitle}>검토 요청 안내</Text>
              <ModerationBadge status="draft" />
            </View>
            <Text style={styles.guidelineText}>
              • 작성하신 글은 [검토 요청] 상태로 제출되며, 운영진의 검토 후 공개 게시됩니다.
            </Text>
            <Text style={styles.guidelineText}>
              • 타인 비방, 광고, 부적절한 언어 사용 시 게시가 제한될 수 있습니다.
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="검토 요청하기"
            onPress={handleSubmit}
            disabled={saving}
            style={({ pressed }) => [styles.bottomButton, pressed && styles.pressed]}
          >
            {saving ? (
              <ActivityIndicator color={colors.surface} />
            ) : (
              <Text style={styles.bottomButtonText}>검토 요청하기</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  keyboard: {
    flex: 1,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  closeButton: {
    width: 40,
    justifyContent: 'center',
  },
  closeText: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '400',
  },
  navTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  publishButton: {
    minWidth: 60,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  publishText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '800',
  },
  content: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 40,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  label: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 20,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  chipText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  chipTextActive: {
    color: colors.surface,
  },
  titleInput: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
    marginTop: 8,
  },
  bodyInput: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.ink,
    marginTop: 8,
    minHeight: 150,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    marginTop: 12,
  },
  guideline: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: radii.md,
    padding: 14,
    marginTop: 24,
  },
  guidelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  guidelineTitle: {
    color: '#92400E',
    fontSize: 13,
    fontWeight: '800',
  },
  guidelineText: {
    color: '#78350F',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  bottomButton: {
    backgroundColor: colors.ink,
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: 'center',
    marginTop: 24,
  },
  bottomButtonText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.8,
  },
});
