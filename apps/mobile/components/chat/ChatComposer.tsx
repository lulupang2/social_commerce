import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { colors, radii } from '../../lib/theme';
import { AppText as Text, AppTextInput as TextInput } from '../../lib/typography';

export interface ChatComposerProps {
  disabled?: boolean;
  sending?: boolean;
  onSend: (body: string) => Promise<void> | void;
}

export function ChatComposer({ disabled = false, sending = false, onSend }: ChatComposerProps) {
  const [text, setText] = useState('');

  const canSend = Boolean(text.trim()) && !disabled && !sending;

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || disabled || sending) return;
    setText('');
    await onSend(trimmed);
  }

  return (
    <View style={styles.composer}>
      <TextInput
        accessibilityLabel="메시지 입력"
        editable={!disabled && !sending}
        onChangeText={setText}
        onSubmitEditing={() => void handleSend()}
        placeholder={disabled ? '대화를 이용할 수 없어요' : '메시지를 입력하세요'}
        placeholderTextColor={colors.subtle}
        returnKeyType="send"
        style={[styles.input, disabled ? styles.inputDisabled : null]}
        value={text}
      />
      <Pressable
        accessibilityLabel="메시지 보내기"
        accessibilityRole="button"
        disabled={!canSend}
        onPress={() => void handleSend()}
        style={[styles.sendButton, !canSend ? styles.sendButtonDisabled : null]}
      >
        {sending ? (
          <ActivityIndicator color={colors.surface} size="small" />
        ) : (
          <Text style={[styles.sendText, !canSend ? styles.sendDisabled : null]}>↑</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  composer: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    padding: 10,
  },
  input: {
    backgroundColor: colors.canvas,
    borderRadius: radii.pill,
    color: colors.ink,
    flex: 1,
    fontSize: 13,
    minHeight: 42,
    paddingHorizontal: 15,
    paddingVertical: 9,
  },
  inputDisabled: {
    backgroundColor: colors.line,
    color: colors.muted,
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    height: 38,
    justifyContent: 'center',
    marginLeft: 8,
    width: 38,
  },
  sendButtonDisabled: {
    backgroundColor: colors.line,
  },
  sendText: { color: colors.surface, fontSize: 20, fontWeight: '800' },
  sendDisabled: { opacity: 0.45 },
});
