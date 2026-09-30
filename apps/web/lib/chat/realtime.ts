'use client';

import { chatMessageSchema, conversationPageSchema, conversationSummarySchema, createChatMessageSchema, uuidSchema, type ChatMessage } from '@icegear/domain';
import { z } from 'zod';
import { requestJson } from '../api/json-request';

const summariesSchema = z.object({ items: z.array(conversationSummarySchema) }).strict();
type ConversationModel = z.infer<typeof conversationPageSchema>;
export interface RealtimeConversationSession {
  model: ConversationModel;
  markRead(throughMessageId: string): Promise<void>;
  loadOlder(): Promise<{ messages: ChatMessage[]; hasMore: boolean }>;
  send(body: string): Promise<ChatMessage>;
  subscribe(onMessage: (message: ChatMessage) => void, onError?: (message: string) => void, onIdentityChange?: () => void): () => void;
}
export type RealtimeConversationSummary = Omit<z.infer<typeof conversationSummarySchema>, 'lastMessageTime'> & { lastMessageTime: string };
export type RealtimeConversationResult =
  | { ok: true; session: RealtimeConversationSession }
  | { ok: false; reason: 'invalid_id' | 'unauthenticated' | 'not_found' | 'request_failed'; message: string };

type Result<T> = { ok: true; data: T } | { ok: false; status: number; message: string };
async function request<T>(path: string, schema: z.ZodType<T>, method = 'GET', body?: unknown, memberId?: string, background = false): Promise<Result<T>> {
  const result = await requestJson(path, schema, {
    method, body, background, allowNoContent: true,
    identity: memberId ? { memberId, changedMessage: '로그인 계정이 변경됐어요. 채팅 목록에서 다시 열어 주세요.' } : undefined,
    messages: {
      http: '채팅 서버 요청에 실패했어요.',
      invalid: '채팅 서버 응답을 확인할 수 없어요.',
      network: '채팅 서버에 연결하지 못했어요.',
    },
  });
  return result.ok ? { ok: true, data: result.data } : result;
}

const endpoint = (id: string) => `/api/v1/conversations/${encodeURIComponent(id)}`;

export async function connectRealtimeConversation(id: string): Promise<RealtimeConversationResult> {
  if (!uuidSchema.safeParse(id).success) return { ok: false, reason: 'invalid_id', message: '대화방 ID가 올바르지 않아요.' };
  const result = await request(endpoint(id), conversationPageSchema);
  if (!result.ok) return { ok: false, reason: result.status === 401 ? 'unauthenticated' : result.status === 404 ? 'not_found' : 'request_failed', message: result.message };
  const model = result.data;
  let beforeCursor = model.beforeCursor;
  let afterCursor = model.afterCursor;
  let hasOlder = model.hasMore;
  const seen = new Set(model.messages.map((message) => message.id));
  let pending: { body: string; nonce: string } | null = null;
  return { ok: true, session: {
    model,
    async markRead(throughMessageId) {
      const response = await request(endpoint(id) + '/read', z.unknown(), 'POST', { throughMessageId }, model.currentUserId);
      if (!response.ok) throw new Error(response.message);
    },
    async loadOlder() {
      if (!hasOlder || !beforeCursor) return { messages: [], hasMore: false };
      const response = await request(endpoint(id) + `?before=${encodeURIComponent(beforeCursor)}&limit=30`, conversationPageSchema);
      if (!response.ok) throw new Error(response.message);
      if (response.data.currentUserId !== model.currentUserId) throw new Error('로그인 계정이 변경됐어요.');
      beforeCursor = response.data.beforeCursor;
      hasOlder = response.data.hasMore;
      const messages = response.data.messages.filter((message) => !seen.has(message.id));
      for (const message of messages) seen.add(message.id);
      return { messages, hasMore: hasOlder };
    },
    async send(body) {
      const input = createChatMessageSchema.safeParse({ conversationId: id, body });
      if (!input.success || Array.from(body.trim()).length > 5000) throw new Error('메시지는 1~5,000자로 입력해 주세요.');
      if (!pending || pending.body !== input.data.body) pending = { body: input.data.body, nonce: crypto.randomUUID() };
      const response = await request(endpoint(id) + '/messages', chatMessageSchema, 'POST', { body: pending.body, clientNonce: pending.nonce }, model.currentUserId);
      if (!response.ok) throw new Error(response.message);
      pending = null;
      seen.add(response.data.id);
      return response.data;
    },
    subscribe(onMessage, onError, onIdentityChange) {
      let active = true;
      let working = false;
      const poll = async () => {
        if (!active || working || document.hidden) return;
        working = true;
        try {
          let more = true;
          while (active && more) {
            const query = afterCursor ? `?after=${encodeURIComponent(afterCursor)}&limit=100` : '?limit=100';
            const response = await request(endpoint(id) + query, conversationPageSchema);
            if (!active) return;
            if (!response.ok) {
              if (response.status === 401 || response.status === 404) onIdentityChange?.();
              else onError?.(response.message);
              return;
            }
            if (response.data.currentUserId !== model.currentUserId) { onIdentityChange?.(); return; }
            onError?.('');
            if (!afterCursor && response.data.hasMore && response.data.beforeCursor) {
              // A room opened empty can accumulate over one page while away.
              const pages = [...response.data.messages];
              let before = response.data.beforeCursor;
              let older = true;
              while (older && active) {
                const page = await request(endpoint(id) + `?before=${encodeURIComponent(before)}&limit=100`, conversationPageSchema);
                if (!page.ok || page.data.currentUserId !== model.currentUserId) {
                  onError?.(page.ok ? '로그인 계정이 변경됐어요.' : page.message);
                  return;
                }
                pages.unshift(...page.data.messages);
                older = page.data.hasMore;
                if (page.data.beforeCursor) before = page.data.beforeCursor;
              }
              for (const message of pages) if (!seen.has(message.id)) { seen.add(message.id); onMessage(message); }
            } else {
              for (const message of response.data.messages) {
                if (seen.has(message.id)) continue;
                seen.add(message.id);
                onMessage(message);
              }
            }
            if (response.data.afterCursor) afterCursor = response.data.afterCursor;
            more = response.data.hasMore && response.data.messages.length > 0 && Boolean(afterCursor);
          }
        } finally { working = false; }
      };
      const timer = window.setInterval(() => { void poll(); }, 3000);
      const visible = () => { if (!document.hidden) void poll(); };
      document.addEventListener('visibilitychange', visible);
      return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
    },
  } };
}

export async function listRealtimeConversations(options: { background?: boolean } = {}): Promise<
  { ok: true; conversations: RealtimeConversationSummary[] } | { ok: false; message: string }
> {
  const result = await request('/api/v1/conversations', summariesSchema, 'GET', undefined, undefined, options.background);
  if (!result.ok) return { ok: false, message: result.message };
  return { ok: true, conversations: result.data.items.map((item) => ({ ...item,
    lastMessageTime: item.lastMessageTime ? new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(item.lastMessageTime)) : '',
  })) };
}

export async function startListingConversation(listingId: string): Promise<
  { ok: true; conversationId: string } | { ok: false; reason: 'unauthenticated' | 'own_listing' | 'request_failed'; message: string }
> {
  if (!uuidSchema.safeParse(listingId).success) return { ok: false, reason: 'request_failed', message: '서버 매물 ID가 올바르지 않아요.' };
  const result = await request('/api/v1/conversations', z.object({ conversationId: uuidSchema }).strict(), 'POST', { listingId });
  if (!result.ok) return { ok: false, reason: result.status === 401 ? 'unauthenticated' : result.status === 409 ? 'own_listing' : 'request_failed', message: result.message };
  return { ok: true, conversationId: result.data.conversationId };
}
