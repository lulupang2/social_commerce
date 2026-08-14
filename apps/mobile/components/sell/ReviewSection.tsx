import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';

import { colors, radii } from '../../lib/theme';
import { AppText as Text } from '../../lib/typography';
import type { SellFormState } from './types';

interface ReviewSectionProps {
  form: SellFormState;
  onEditStep: (step: 1 | 2 | 3) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
  onRetryUpload?: () => void;
}

export function ReviewSection({
  form,
  onEditStep,
  onSubmit,
  submitting,
  error,
  onRetryUpload,
}: ReviewSectionProps) {
  const isSki = form.sport === 'ski';
  const details = isSki ? form.skiDetails : form.hockeyDetails;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionHeader}>📋 등록 정보 최종 검토</Text>
      <Text style={styles.subText}>
        제출 전 작성하신 내용을 확인하세요. 등록 후 검토 요청(임시저장) 상태로 관리됩니다.
      </Text>

      {/* 사진 미리와보기 */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>📸 등록 사진 ({form.photos.length}장)</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="사진 수정하기"
            onPress={() => onEditStep(1)}
          >
            <Text style={styles.editText}>수정</Text>
          </Pressable>
        </View>
        {form.photos.length > 0 ? (
          <View style={styles.photoRow}>
            {form.photos.map((p, idx) => (
              <Image key={`${p.uri}-${idx}`} source={{ uri: p.uri }} style={styles.thumb} />
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>첨부된 사진이 없습니다. (사진 없이도 등록 가능)</Text>
        )}
      </View>

      {/* 기본 정보 */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>📌 기본 정보</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="기본 정보 수정하기"
            onPress={() => onEditStep(1)}
          >
            <Text style={styles.editText}>수정</Text>
          </Pressable>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>종목</Text>
          <Text style={styles.infoValue}>{form.sport === 'ski' ? '⛷️ 스키' : '🏒 아이스하키'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>제목</Text>
          <Text style={[styles.infoValue, styles.bold]}>{form.title}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>카테고리 / 상태</Text>
          <Text style={styles.infoValue}>
            {form.category} / {form.condition}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>설명</Text>
          <Text numberOfLines={3} style={styles.infoValue}>
            {form.description}
          </Text>
        </View>
      </View>

      {/* 세부 사양 */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>
            ⚙️ {form.sport === 'ski' ? '스키' : '하키'} 세부 사양
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="세부 사양 수정하기"
            onPress={() => onEditStep(2)}
          >
            <Text style={styles.editText}>수정</Text>
          </Pressable>
        </View>
        {details.equipmentType ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>장비 종류</Text>
            <Text style={styles.infoValue}>{details.equipmentType}</Text>
          </View>
        ) : null}
        {details.brand ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>브랜드 / 모델</Text>
            <Text style={styles.infoValue}>
              {details.brand} {details.model}
            </Text>
          </View>
        ) : null}
        {details.size ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>사이즈 / 연식</Text>
            <Text style={styles.infoValue}>
              {details.size} {details.year ? `(${details.year}년식)` : ''}
            </Text>
          </View>
        ) : null}
        {isSki && form.skiDetails.lengthCm ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>스키 길이</Text>
            <Text style={styles.infoValue}>{form.skiDetails.lengthCm} cm</Text>
          </View>
        ) : null}
        {!isSki && form.hockeyDetails.stickFlex ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>스틱 플렉스</Text>
            <Text style={styles.infoValue}>{form.hockeyDetails.stickFlex}</Text>
          </View>
        ) : null}
      </View>

      {/* 가격 & 거래 */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>💰 가격 및 거래 정보</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="가격 및 거래 정보 수정하기"
            onPress={() => onEditStep(3)}
          >
            <Text style={styles.editText}>수정</Text>
          </Pressable>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>희망 가격</Text>
          <Text style={[styles.infoValue, styles.priceText]}>
            {Number(form.price).toLocaleString()} {form.currency}
          </Text>
        </View>
        {form.location ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>희망 지역</Text>
            <Text style={styles.infoValue}>{form.location}</Text>
          </View>
        ) : null}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>거래 옵션</Text>
          <Text style={styles.infoValue}>
            {[
              form.isNegotiable ? '가격 제안 받음' : null,
              form.localPickupAvailable ? '직거래 가능' : null,
              form.shippingAvailable ? '택배 가능' : null,
            ]
              .filter(Boolean)
              .join(' · ') || '기본 설정'}
          </Text>
        </View>
      </View>

      {/* 안내 문구 */}
      <View style={styles.noticeBox}>
        <Text style={styles.noticeTitle}>📌 검토 요청 (임시저장) 안내</Text>
        <Text style={styles.noticeBody}>
          일반 사용자의 판매글은 등록 즉시 public 피드에 노출되지 않으며, 검토 요청(임시저장) 상태로
          안전하게 등록됩니다.
        </Text>
      </View>

      {/* 오류 메시지 및 재시도 */}
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>제출 오류 발생</Text>
          <Text style={styles.errorBody}>{error}</Text>
          {onRetryUpload ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="재시도 하기"
              onPress={onRetryUpload}
              style={styles.retryBtn}
            >
              <Text style={styles.retryBtnText}>다시 시도하기</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* 제출 버튼 */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="판매글 검토 요청 제출"
        disabled={submitting}
        onPress={onSubmit}
        style={[styles.submitButton, submitting ? styles.submitButtonDisabled : null]}
      >
        {submitting ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.submitButtonText}>검토 요청 및 임시저장 제출</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 14 },
  sectionHeader: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  subText: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: -6 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between' },
  cardTitle: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  editText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  thumb: { borderRadius: radii.xs, height: 50, width: 50 },
  emptyText: { color: colors.muted, fontSize: 12, fontStyle: 'italic' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  infoLabel: { color: colors.muted, fontSize: 12, width: 100 },
  infoValue: { color: colors.ink, flex: 1, fontSize: 12, textAlign: 'right' },
  bold: { fontWeight: '700' },
  priceText: { color: colors.accent, fontSize: 14, fontWeight: '800' },
  noticeBox: {
    backgroundColor: '#F0F7FF',
    borderColor: '#BAE6FD',
    borderRadius: radii.sm,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  noticeTitle: { color: colors.navy, fontSize: 13, fontWeight: '800' },
  noticeBody: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderRadius: radii.sm,
    borderWidth: 1,
    gap: 6,
    padding: 12,
  },
  errorTitle: { color: colors.danger, fontSize: 13, fontWeight: '800' },
  errorBody: { color: colors.danger, fontSize: 12, lineHeight: 18 },
  retryBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.danger,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  retryBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  submitButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.sm,
    justifyContent: 'center',
    minHeight: 48,
    marginTop: 6,
    paddingHorizontal: 16,
  },
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: { color: colors.surface, fontSize: 15, fontWeight: '800' },
});
