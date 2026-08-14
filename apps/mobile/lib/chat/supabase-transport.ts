import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

import { formatTime } from '../format';
import {
  failure,
  mapMessageRow,
  messageCursor,
  participantInitial,
  success,
  type ChatMessage,
  type ChatPage,
  type ChatRepositoryError,
  type ChatResult,
  type ChatSummary,
  type ConversationCursor,
  type MessageCursor,
  type MessageRow,
  type UnreadSummary,
} from './model';
import type {
  ChatSubscription,
  ChatSubscriptionHandlers,
  ChatTransport,
  ConversationPageOptions,
  InsertMessageInput,
  MessagePageOptions,
} from './transport';

const CONVERSATION_SELECT =
  'id,listing_id,buyer_id,seller_id,status,created_at,updated_at,listing:listings(title),buyer:profiles!conversations_buyer_id_fkey(display_name),seller:profiles!conversations_seller_id_fkey(display_name)';
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const CATCH_UP_PAGE_SIZE = 200;

type NamedRelation = { display_name?: string | null };
type ListingRelation = { title?: string | null };
type ConversationRow = {
  id: string;
  listing_id: string | null;
  buyer_id: string;
  seller_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  listing?: ListingRelation | ListingRelation[] | null;
  buyer?: NamedRelation | NamedRelation[] | null;
  seller?: NamedRelation | NamedRelation[] | null;
};

type UnreadRow = { conversation_id: string; unread_count: number | string };
type ListingOwnerRow = { seller_id: string };
type ErrorLike = { code?: string; status?: number; message?: string };

function relationOne<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : (value ?? undefined);
}

function pageSize(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(value as number)));
}

function errorLike(value: unknown): ErrorLike {
  if (typeof value !== 'object' || value === null) return {};
  return value as ErrorLike;
}

function transportError(
  value: unknown,
  fallbackCode: ChatRepositoryError['code'] = 'network',
  fallbackMessage = '채팅 서버에 연결하지 못했어요.',
): ChatRepositoryError {
  const candidate = errorLike(value);
  const code = candidate.code ?? '';
  const message = candidate.message ?? '';

  if (candidate.status === 401 || /jwt|session|auth/i.test(message)) {
    return { code: 'auth', message: '로그인이 필요해요.', cause: value };
  }
  if (
    code === '42501' ||
    candidate.status === 403 ||
    /permission|policy|accessible/i.test(message)
  ) {
    return { code: 'permission', message: '이 채팅에 접근할 권한이 없어요.', cause: value };
  }
  if (code === 'PGRST116' || code === '23503') {
    return { code: 'not_found', message: '채팅을 찾을 수 없어요.', cause: value };
  }
  return { code: fallbackCode, message: fallbackMessage, cause: value };
}

function unavailable(): ChatResult<never> {
  return failure({ code: 'network', message: 'Supabase 채팅 연결이 설정되지 않았어요.' });
}

function unreadSummary(rows: readonly UnreadRow[]): UnreadSummary {
  const byConversation: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    const count = Math.max(0, Number(row.unread_count) || 0);
    byConversation[row.conversation_id] = count;
    total += count;
  }
  return { total, byConversation };
}

function summaryFromRow(
  row: ConversationRow,
  userId: string,
  latest: ChatMessage | undefined,
  unreadCount: number,
): ChatSummary {
  const otherIsBuyer = row.seller_id === userId;
  const participantId = otherIsBuyer ? row.buyer_id : row.seller_id;
  const participant = relationOne(otherIsBuyer ? row.buyer : row.seller);
  const participantName = participant?.display_name?.trim() || (otherIsBuyer ? '구매자' : '판매자');
  const listing = relationOne(row.listing);

  return {
    id: row.id,
    listingId: row.listing_id,
    participantId,
    participantName,
    participantInitial: participantInitial(participantName),
    listingTitle: listing?.title?.trim() || '상품 문의',
    preview: latest?.body ?? '대화를 시작해보세요.',
    unreadCount,
    updatedAt: row.updated_at,
    timeLabel: formatTime(row.updated_at),
    messages: latest ? [latest] : [],
  };
}

async function authenticatedUser(client: SupabaseClient): Promise<ChatResult<string>> {
  const { data, error } = await client.auth.getUser();
  if (error) {
    const mapped = /fetch|network|timeout/i.test(error.message)
      ? transportError(error)
      : ({
          code: 'auth',
          message: '로그인이 필요해요.',
          cause: error,
        } satisfies ChatRepositoryError);
    return failure(mapped);
  }
  if (!data.user) return failure({ code: 'auth', message: '로그인이 필요해요.' });
  return success(data.user.id);
}

export function createSupabaseChatTransport(client: SupabaseClient | null): ChatTransport {
  async function getCurrentUserId(): Promise<ChatResult<string>> {
    return client ? authenticatedUser(client) : unavailable();
  }

  async function getConversation(id: string): Promise<ChatResult<ChatSummary>> {
    if (!client) return unavailable();
    const auth = await authenticatedUser(client);
    if (auth.error) return auth;

    const { data, error } = await client
      .from('conversations')
      .select(CONVERSATION_SELECT)
      .eq('id', id)
      .maybeSingle();
    if (error) return failure(transportError(error));
    if (!data) return failure({ code: 'not_found', message: '채팅을 찾을 수 없어요.' });

    const messagePage = await listMessages(id, { pageSize: 1 });
    if (messagePage.error) return messagePage;
    const unread = await getUnreadSummary();
    if (unread.error) return unread;

    return success(
      summaryFromRow(
        data as unknown as ConversationRow,
        auth.data,
        messagePage.data.items[0],
        unread.data.byConversation[id] ?? 0,
      ),
    );
  }

  async function findOrCreateConversation(
    listingId: string,
    participantId: string,
  ): Promise<ChatResult<ChatSummary>> {
    if (!client) return unavailable();
    const auth = await authenticatedUser(client);
    if (auth.error) return auth;
    if (!listingId.trim()) return failure({ code: 'not_found', message: '상품을 찾을 수 없어요.' });
    if (!participantId.trim() || participantId === auth.data) {
      return failure({ code: 'permission', message: '본인과 채팅을 만들 수 없어요.' });
    }

    const { data: listing, error: listingError } = await client
      .from('listings')
      .select('seller_id')
      .eq('id', listingId)
      .maybeSingle();
    if (listingError) return failure(transportError(listingError));
    if (!listing) return failure({ code: 'not_found', message: '상품을 찾을 수 없어요.' });

    const sellerId = (listing as ListingOwnerRow).seller_id;
    if (sellerId !== auth.data && sellerId !== participantId) {
      return failure({ code: 'permission', message: '상품 판매자와만 채팅을 만들 수 있어요.' });
    }
    const buyerId = sellerId === auth.data ? participantId : auth.data;

    async function findExisting(): Promise<ChatResult<string> | null> {
      if (!client) return unavailable();
      const { data, error } = await client
        .from('conversations')
        .select('id')
        .eq('listing_id', listingId)
        .eq('buyer_id', buyerId)
        .eq('seller_id', sellerId)
        .maybeSingle();
      if (error) return failure(transportError(error));
      if (!data) return null;
      if (typeof data !== 'object' || !('id' in data) || typeof data.id !== 'string') {
        return failure({ code: 'network', message: '채팅 식별자 응답이 올바르지 않아요.' });
      }
      return success(data.id);
    }

    const existing = await findExisting();
    if (existing?.error) return failure(existing.error);
    if (existing) return getConversation(existing.data);

    const { data, error } = await client
      .from('conversations')
      .insert({ listing_id: listingId, buyer_id: buyerId, seller_id: sellerId })
      .select(CONVERSATION_SELECT)
      .single();
    if (error) {
      if (error.code === '23505') {
        const raced = await findExisting();
        if (raced?.error) return failure(raced.error);
        if (raced) return getConversation(raced.data);
      }
      return failure(transportError(error));
    }

    return success(summaryFromRow(data as unknown as ConversationRow, auth.data, undefined, 0));
  }

  async function listConversations(
    options: ConversationPageOptions = {},
  ): Promise<ChatResult<ChatPage<ChatSummary, ConversationCursor>>> {
    if (!client) return unavailable();
    const auth = await authenticatedUser(client);
    if (auth.error) return auth;
    const limit = pageSize(options.pageSize);

    let query = client
      .from('conversations')
      .select(CONVERSATION_SELECT)
      .or(`buyer_id.eq.${auth.data},seller_id.eq.${auth.data}`)
      .neq('status', 'blocked')
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);
    if (options.cursor) {
      query = query.or(
        `updated_at.lt.${options.cursor.updatedAt},and(updated_at.eq.${options.cursor.updatedAt},id.lt.${options.cursor.id})`,
      );
    }

    const { data, error } = await query;
    if (error) return failure(transportError(error));
    const rows = (data ?? []) as unknown as ConversationRow[];
    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    const ids = pageRows.map((row) => row.id);

    const latestByConversation = new Map<string, ChatMessage>();
    if (ids.length) {
      const { data: messages, error: messageError } = await client
        .from('messages')
        .select('id,conversation_id,sender_id,body,read_at,deleted_at,created_at')
        .in('conversation_id', ids)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });
      if (messageError) return failure(transportError(messageError));
      for (const row of (messages ?? []) as MessageRow[]) {
        if (!latestByConversation.has(row.conversation_id)) {
          latestByConversation.set(row.conversation_id, mapMessageRow(row, auth.data));
        }
      }
    }

    const unread = await getUnreadSummary();
    if (unread.error) return unread;
    const items = pageRows.map((row) =>
      summaryFromRow(
        row,
        auth.data,
        latestByConversation.get(row.id),
        unread.data.byConversation[row.id] ?? 0,
      ),
    );
    const boundary = pageRows[pageRows.length - 1];

    return success({
      items,
      nextCursor: hasMore && boundary ? { updatedAt: boundary.updated_at, id: boundary.id } : null,
    });
  }

  async function listMessages(
    conversationId: string,
    options: MessagePageOptions = {},
  ): Promise<ChatResult<ChatPage<ChatMessage, MessageCursor>>> {
    if (!client) return unavailable();
    const auth = await authenticatedUser(client);
    if (auth.error) return auth;
    const limit = pageSize(options.pageSize);

    let query = client
      .from('messages')
      .select('id,conversation_id,sender_id,body,read_at,deleted_at,created_at')
      .eq('conversation_id', conversationId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);
    if (options.cursor) {
      query = query.or(
        `created_at.lt.${options.cursor.createdAt},and(created_at.eq.${options.cursor.createdAt},id.lt.${options.cursor.id})`,
      );
    }

    const { data, error } = await query;
    if (error) return failure(transportError(error));
    const rows = (data ?? []) as MessageRow[];
    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    const items = pageRows.map((row) => mapMessageRow(row, auth.data)).reverse();
    const oldest = items[0];

    return success({ items, nextCursor: hasMore && oldest ? messageCursor(oldest) : null });
  }

  async function insertMessage(input: InsertMessageInput): Promise<ChatResult<ChatMessage>> {
    if (!client) return unavailable();
    const auth = await authenticatedUser(client);
    if (auth.error) return auth;
    if (auth.data !== input.senderId) {
      return failure({ code: 'permission', message: '다른 사용자로 메시지를 보낼 수 없어요.' });
    }

    const select = 'id,conversation_id,sender_id,body,read_at,deleted_at,created_at';
    const { data, error } = await client
      .from('messages')
      .insert({
        id: input.id,
        conversation_id: input.conversationId,
        sender_id: input.senderId,
        body: input.body,
      })
      .select(select)
      .single();

    if (error?.code === '23505') {
      const { data: existing, error: existingError } = await client
        .from('messages')
        .select(select)
        .eq('id', input.id)
        .maybeSingle();
      if (existingError) return failure(transportError(existingError));
      const row = existing as MessageRow | null;
      if (
        !row ||
        row.conversation_id !== input.conversationId ||
        row.sender_id !== input.senderId ||
        row.body !== input.body
      ) {
        return failure({ code: 'permission', message: '메시지 재시도 식별자가 충돌했어요.' });
      }
      return success(mapMessageRow(row, auth.data));
    }
    if (error) return failure(transportError(error));
    if (!data) return failure({ code: 'network', message: '메시지 확인 응답이 비어 있어요.' });
    return success(mapMessageRow(data as MessageRow, auth.data));
  }

  async function getUnreadSummary(): Promise<ChatResult<UnreadSummary>> {
    if (!client) return unavailable();
    const auth = await authenticatedUser(client);
    if (auth.error) return auth;
    const { data, error } = await client.rpc('get_my_conversation_unread_counts');
    if (error) return failure(transportError(error));
    return success(unreadSummary((data ?? []) as UnreadRow[]));
  }

  async function markConversationRead(
    conversationId: string,
  ): Promise<ChatResult<{ updatedCount: number; unread: UnreadSummary }>> {
    if (!client) return unavailable();
    const conversation = await getConversation(conversationId);
    if (conversation.error) return conversation;

    const { data, error } = await client.rpc('mark_conversation_read', {
      p_conversation_id: conversationId,
    });
    if (error) return failure(transportError(error));
    const unread = await getUnreadSummary();
    if (unread.error) return unread;
    return success({ updatedCount: Math.max(0, Number(data) || 0), unread: unread.data });
  }

  async function subscribeToMessages(
    conversationId: string,
    after: MessageCursor | undefined,
    handlers: ChatSubscriptionHandlers,
  ): Promise<ChatResult<ChatSubscription>> {
    if (!client) return unavailable();
    const auth = await authenticatedUser(client);
    if (auth.error) return auth;
    const userId = auth.data;
    const conversation = await getConversation(conversationId);
    if (conversation.error) return conversation;

    let active = true;
    let watermark = after;
    let catchUpQueue = Promise.resolve();
    let channel: RealtimeChannel;

    const catchUp = async () => {
      let cursor = watermark;
      while (active) {
        let query = client
          .from('messages')
          .select('id,conversation_id,sender_id,body,read_at,deleted_at,created_at')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .limit(CATCH_UP_PAGE_SIZE);
        if (cursor) {
          query = query.or(
            `created_at.gt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.gt.${cursor.id})`,
          );
        }
        const { data, error } = await query;
        if (error) {
          handlers.onError?.({
            ...transportError(error, 'realtime', '놓친 메시지를 동기화하지 못했어요.'),
            code: 'realtime',
          });
          return;
        }
        const messages = ((data ?? []) as MessageRow[]).map((row) => mapMessageRow(row, userId));
        if (messages.length) {
          handlers.onEvent({ type: 'upsert', messages });
          const newest = messages[messages.length - 1];
          if (newest) {
            cursor = messageCursor(newest);
            watermark = cursor;
          }
        }
        if (messages.length < CATCH_UP_PAGE_SIZE) return;
      }
    };

    channel = client
      .channel(`chat:${conversationId}:${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (!active) return;
          if (payload.eventType === 'DELETE') {
            const removed = payload.old as { id?: string };
            if (removed.id) handlers.onEvent({ type: 'remove', messageIds: [removed.id] });
            return;
          }
          const row = payload.new as MessageRow;
          const message = mapMessageRow(row, userId);
          if (message.deletedAt) {
            handlers.onEvent({ type: 'remove', messageIds: [message.id] });
          } else {
            handlers.onEvent({ type: 'upsert', messages: [message] });
          }
          if (
            !watermark ||
            message.createdAt > watermark.createdAt ||
            (message.createdAt === watermark.createdAt && message.id > watermark.id)
          ) {
            watermark = messageCursor(message);
          }
        },
      )
      .subscribe((status) => {
        if (!active) return;
        if (status === 'SUBSCRIBED') {
          handlers.onStatus?.('connected');
          catchUpQueue = catchUpQueue.then(catchUp, catchUp);
          return;
        }
        if (status === 'CLOSED') {
          handlers.onStatus?.('closed');
          return;
        }
        handlers.onStatus?.('reconnecting');
        handlers.onError?.({
          code: 'realtime',
          message:
            status === 'TIMED_OUT'
              ? '실시간 채팅 연결 시간이 초과됐어요.'
              : '실시간 채팅 연결이 끊겼어요.',
        });
      });

    let teardown: Promise<void> | undefined;
    return success({
      unsubscribe(): Promise<void> {
        if (teardown) return teardown;
        active = false;
        teardown = client.removeChannel(channel).then((status) => {
          if (status !== 'ok') {
            handlers.onError?.({
              code: 'realtime',
              message: '실시간 채팅 연결을 정리하지 못했어요.',
            });
          }
          handlers.onStatus?.('closed');
        });
        return teardown;
      },
    });
  }

  return {
    getCurrentUserId,
    findOrCreateConversation,
    listConversations,
    getConversation,
    listMessages,
    insertMessage,
    markConversationRead,
    getUnreadSummary,
    subscribeToMessages,
  };
}
