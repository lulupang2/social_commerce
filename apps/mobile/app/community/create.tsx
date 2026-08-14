import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import type { Sport } from '@icegear/domain';

import { createCommunityPost } from '../../lib/community/repository';
import { sportLabels } from '../../lib/format';
import { colors, radii } from '../../lib/theme';
import { AppText as Text, AppTextInput as TextInput, fontFamilies } from '../../lib/typography';

const sportOptions: Array<{ id: Sport | undefined; label: string }> = [
  { id: undefined, label: '전체' },
  { id: 'ski', label: sportLabels.ski },
  { id: 'hockey', label: sportLabels.hockey },
];

export default function CommunityCreateScreen() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sport, setSport] = useState<Sport | undefined>('ski');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    const cleanTitle = title.trim();
    const cleanBody = body.trim();
    if (cleanTitle.length < 2) {
      setError('제목을 2자 이상 입력해주세요.');
      return;
    }
    if (cleanBody.length < 5) {
      setError('내용을 5자 이상 입력해주세요.');
      return;
    }
    setError(null);
    setSaving(true);
    const result = await createCommunityPost({ title: cleanTitle, body: cleanBody, sport });
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    router.replace('/(tabs)/community');
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.navBar}>
            <Pressable
              accessibilityLabel="닫기"
              onPress={() => router.back()}
              style={styles.closeButton}
            >
              <Text style={styles.closeText}>×</Text>
            </Pressable>
            <Text style={styles.navTitle}>글쓰기</Text>
            <Pressable disabled={saving} onPress={() => void submit()} style={styles.publishButton}>
              {saving ? (
                <ActivityIndicator color={colors.surface} size="small" />
              ) : (
                <Text style={styles.publishText}>등록</Text>
              )}
            </Pressable>
          </View>

          <Text style={styles.title}>어떤 이야기를 나눠볼까요?</Text>
          <Text style={styles.subtitle}>겨울 스포츠를 좋아하는 이웃들과 경험을 나눠보세요.</Text>

          <Text style={styles.label}>주제</Text>
          <View style={styles.chipRow}>
            {sportOptions.map((option) => {
              const active = sport === option.id;
              return (
                <Pressable
                  key={option.label}
                  onPress={() => setSport(option.id)}
                  style={[styles.chip, active ? styles.chipActive : null]}
                >
                  <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            accessibilityLabel="글 제목"
            onChangeText={setTitle}
            placeholder="제목을 입력해주세요"
            placeholderTextColor={colors.subtle}
            style={styles.titleInput}
            value={title}
          />
          <TextInput
            accessibilityLabel="글 내용"
            multiline
            onChangeText={setBody}
            placeholder="장비 추천, 스팟 후기, 같이 탈 메이트 모집 등 자유롭게 적어주세요."
            placeholderTextColor={colors.subtle}
            style={styles.bodyInput}
            textAlignVertical="top"
            value={body}
          />

          <View style={styles.guideline}>
            <Text style={styles.guidelineTitle}>커뮤니티 이용 가이드</Text>
            <Text style={styles.guidelineText}>• 개인정보와 연락처는 공개 글에 남기지 않기</Text>
            <Text style={styles.guidelineText}>• 거래는 안전한 장소에서 만나기</Text>
            <Text style={styles.guidelineText}>• 서로의 경험과 취향을 존중하기</Text>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable disabled={saving} onPress={() => void submit()} style={styles.bottomButton}>
            {saving ? (
              <ActivityIndicator color={colors.surface} />
            ) : (
              <Text style={styles.bottomButtonText}>커뮤니티에 올리기</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.canvas, flex: 1 },
  keyboard: { flex: 1 },
  content: { paddingBottom: 30, paddingHorizontal: 20 },
  navBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
  },
  closeButton: { justifyContent: 'center', width: 50 },
  closeText: { color: colors.ink, fontSize: 30, fontWeight: '300' },
  navTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  publishButton: { alignItems: 'flex-end', justifyContent: 'center', minWidth: 50 },
  publishText: { color: colors.accent, fontSize: 14, fontWeight: '800' },
  title: {
    color: colors.ink,
    fontFamily: fontFamilies.displayBold,
    fontSize: 23,
    fontWeight: '800',
    lineHeight: 31,
    marginTop: 20,
  },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 8 },
  label: { color: colors.ink, fontSize: 13, fontWeight: '800', marginTop: 27 },
  chipRow: { flexDirection: 'row', gap: 8, marginTop: 11 },
  chip: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: 15,
    paddingVertical: 9,
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: colors.surface },
  titleInput: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    marginTop: 19,
    minHeight: 52,
    paddingHorizontal: 15,
  },
  bodyInput: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
    minHeight: 190,
    paddingHorizontal: 15,
    paddingTop: 14,
  },
  guideline: {
    backgroundColor: colors.navySoft,
    borderRadius: radii.sm,
    gap: 5,
    marginTop: 18,
    padding: 14,
  },
  guidelineTitle: { color: colors.navy, fontSize: 12, fontWeight: '800', marginBottom: 2 },
  guidelineText: { color: colors.navy, fontSize: 11, lineHeight: 17 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19, marginTop: 14 },
  bottomButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.sm,
    justifyContent: 'center',
    marginTop: 19,
    minHeight: 50,
  },
  bottomButtonText: { color: colors.surface, fontSize: 14, fontWeight: '800' },
});
