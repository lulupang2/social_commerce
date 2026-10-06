import { translate } from '@/lib/i18n/translate';

const messages: Record<string, string> = {
  UNAUTHENTICATED: '로그인이 필요해요. 로그인 후 다시 이용해 주세요.',
  UNAUTHORIZED: '로그인이 필요해요. 로그인 후 다시 이용해 주세요.',
  ACCOUNT_UNAVAILABLE: '현재 이용할 수 없는 계정이에요.',
  CSRF_INVALID: '요청을 확인하지 못했어요. 새로고침 후 다시 시도해 주세요.',
  ORIGIN_INVALID: '허용되지 않은 접속 경로예요. 서비스 화면에서 다시 시도해 주세요.',
  REAUTH_REQUIRED: '다시 로그인한 후 이용해 주세요.',
  REAUTH_IDENTITY_MISMATCH: '기존과 같은 계정으로 다시 로그인해 주세요.',
  PROVIDER_DISABLED: '현재 이 로그인 방식을 사용할 수 없어요.',
  STATE_EXPIRED: '로그인 시간이 만료됐어요. 다시 로그인해 주세요.',
  STATE_REUSED: '이미 사용한 로그인 요청이에요. 다시 시작해 주세요.',
  OAUTH_DENIED: '로그인 동의가 취소됐어요.',
  AUTH_RATE_LIMITED: '로그인 요청이 많아요. 잠시 후 다시 시도해 주세요.',
};

/** API codes/statuses stay intact; server diagnostics are not UI copy. */
export function apiErrorMessage(status: number, body: unknown, fallback: string): string {
  if (status === 401) return translate(messages.UNAUTHENTICATED);
  const code = body && typeof body === 'object' && 'code' in body ? body.code : undefined;
  if (typeof code === 'string' && Object.hasOwn(messages, code)) return translate(messages[code]);
  if (status === 403) return translate('이 작업을 수행할 권한이 없어요.');
  if (status === 429) return translate('요청이 많아요. 잠시 후 다시 시도해 주세요.');
  return translate(fallback);
}
