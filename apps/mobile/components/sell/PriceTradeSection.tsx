import { CURRENCY_CODES, type CurrencyCode } from '@icegear/domain';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radii } from '../../lib/theme';
import { AppText as Text, AppTextInput as TextInput } from '../../lib/typography';

interface PriceTradeSectionProps {
  price: string;
  onPriceChange: (price: string) => void;
  currency: string;
  onCurrencyChange: (curr: string) => void;
  location: string;
  onLocationChange: (loc: string) => void;
  isNegotiable: boolean;
  onIsNegotiableChange: (val: boolean) => void;
  shippingAvailable: boolean;
  onShippingAvailableChange: (val: boolean) => void;
  localPickupAvailable: boolean;
  onLocalPickupAvailableChange: (val: boolean) => void;
  errors?: Record<string, string>;
}

export function PriceTradeSection({
  price,
  onPriceChange,
  currency,
  onCurrencyChange,
  location,
  onLocationChange,
  isNegotiable,
  onIsNegotiableChange,
  shippingAvailable,
  onShippingAvailableChange,
  localPickupAvailable,
  onLocalPickupAvailableChange,
  errors = {},
}: PriceTradeSectionProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.sectionHeader}>💰 가격 및 거래 방법</Text>

      {/* 가격 & 통화 */}
      <View style={styles.row}>
        <View style={styles.priceInputItem}>
          <Text style={styles.label}>
            판매 가격 <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            accessibilityLabel="판매 가격 입력"
            keyboardType="decimal-pad"
            onChangeText={onPriceChange}
            placeholder="예: 450000"
            style={[styles.input, errors.price ? styles.inputError : null]}
            value={price}
          />
          {errors.price ? <Text style={styles.errorText}>{errors.price}</Text> : null}
        </View>
        <View style={styles.currencyItem}>
          <Text style={styles.label}>통화</Text>
          <View style={styles.currencyWrap}>
            {CURRENCY_CODES.map((code) => (
              <Pressable
                key={code}
                accessibilityRole="button"
                accessibilityLabel={`통화 ${code} 선택`}
                onPress={() => onCurrencyChange(code)}
                style={[
                  styles.currencyChip,
                  currency === code ? styles.currencyChipSelected : null,
                ]}
              >
                <Text
                  style={[
                    styles.currencyChipText,
                    currency === code ? styles.currencyChipTextSelected : null,
                  ]}
                >
                  {code}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      {/* 거래 희망 지역 */}
      <View style={styles.field}>
        <Text style={styles.label}>거래 희망 지역 (선택)</Text>
        <TextInput
          accessibilityLabel="거래 희망 지역 입력"
          onChangeText={onLocationChange}
          placeholder="예: 서울시 송파구 잠실동 / 대관령 스키장"
          style={styles.input}
          value={location}
        />
      </View>

      {/* 거래 옵션 */}
      <Text style={styles.subHeader}>거래 방식 및 옵션</Text>
      <View style={styles.optionsWrap}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="가격 제안 받기 토글"
          onPress={() => onIsNegotiableChange(!isNegotiable)}
          style={[styles.optionCard, isNegotiable ? styles.optionCardActive : null]}
        >
          <Text style={styles.optionCheck}>{isNegotiable ? '✓' : '○'}</Text>
          <View style={styles.optionTextWrap}>
            <Text style={styles.optionTitle}>가격 제안(네고) 받기</Text>
            <Text style={styles.optionBody}>구매 희망자의 가격 제안을 수신합니다.</Text>
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="직거래 가능 토글"
          onPress={() => onLocalPickupAvailableChange(!localPickupAvailable)}
          style={[styles.optionCard, localPickupAvailable ? styles.optionCardActive : null]}
        >
          <Text style={styles.optionCheck}>{localPickupAvailable ? '✓' : '○'}</Text>
          <View style={styles.optionTextWrap}>
            <Text style={styles.optionTitle}>직거래 가능</Text>
            <Text style={styles.optionBody}>직접 만나서 장비를 전달합니다.</Text>
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="택배 거래 가능 토글"
          onPress={() => onShippingAvailableChange(!shippingAvailable)}
          style={[styles.optionCard, shippingAvailable ? styles.optionCardActive : null]}
        >
          <Text style={styles.optionCheck}>{shippingAvailable ? '✓' : '○'}</Text>
          <View style={styles.optionTextWrap}>
            <Text style={styles.optionTitle}>택배/화물 거래 가능</Text>
            <Text style={styles.optionBody}>택배 또는 화물 운송으로 전달합니다.</Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  sectionHeader: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  subHeader: { color: colors.muted, fontSize: 13, fontWeight: '700', marginTop: 4 },
  field: { gap: 6 },
  label: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  required: { color: colors.accent, fontWeight: '800' },
  row: { flexDirection: 'column', gap: 12 },
  priceInputItem: { gap: 6 },
  currencyItem: { gap: 6 },
  currencyWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  currencyChip: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  currencyChipSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  currencyChipText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  currencyChipTextSelected: { color: colors.surface },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 14,
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputError: { borderColor: colors.danger },
  errorText: { color: colors.danger, fontSize: 12 },
  optionsWrap: { gap: 8 },
  optionCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  optionCardActive: {
    backgroundColor: '#F0F7FF',
    borderColor: colors.accent,
  },
  optionCheck: { color: colors.accent, fontSize: 16, fontWeight: '900' },
  optionTextWrap: { flex: 1, gap: 2 },
  optionTitle: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  optionBody: { color: colors.muted, fontSize: 12 },
});
