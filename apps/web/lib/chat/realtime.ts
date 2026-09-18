'use client';

import {
  chatMessageSchema,
  createChatMessageSchema,
  uuidSchema,
  type ChatMessage,
} from '@icegear/domain';

import { createBrowserSupabaseClient, type BrowserSupabaseClient } from '../supabase/browser';
import type { Database } from '../supabase/database.types';

export interface RealtimeConversationModel {
  id: string;
  currentUserId: string;
  otherUserName: string;
  listing: {
    id: string;
    title: string;
    price: number;
  } | null;
  messages: ChatMessage[];
}

export interface RealtimeConversationSession {
  model: RealtimeConversationModel;
  markRead(): Promise<void>;
  send(body: string): Promise<ChatMessage>;
  subscribe(onMessage: (message: ChatMessage) => void): () => void;
}

export type RealtimeConversationResult =
  | { ok: true; session: RealtimeConversationSession }
  | {
      ok: false;
      reason: 'invalid_id' | 'unconfigured' | 'unauthenticated' | 'not_found' | 'request_failed';
      message: string;
    };

type MessageRow = Database['public']['Tables']['messages']['Row'];

function parseMessage(row: MessageRow): ChatMessage | null {
  const parsed = chatMessageSchema.safeParse({
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    readAt: row.read_at,
    createdAt: row.created_at,
  });
  return parsed.success ? parsed.data : null;
}

function buildSession(
  client: BrowserSupabaseClient,
  model: RealtimeConversationModel,
): RealtimeConversationSession {
  return {
    model,
    async markRead() {
      await client.rpc('mark_conversation_read', { p_conversation_id: model.id });
    },
    async send(body) {
      const input = createChatMessageSchema.parse({ conversationId: model.id, body });
      const { data, error } = await client
        .from('messages')
        .insert({
          conversation_id: input.conversationId,
          sender_id: model.currentUserId,
          body: input.body,
        })
        .select('*')
        .single();
      if (error || !data) throw new Error('message_send_failed');
      const message = parseMessage(data);
      if (!message) throw new Error('message_contract_failed');
      return message;
    },
    subscribe(onMessage) {
      const channel = client
        .channel(`conversation:${model.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${model.id}`,
          },
          (payload) => {
            const message = parseMessage(payload.new as MessageRow);
            if (message) onMessage(message);
          },
        )
        .subscribe();

      return () => {
        void client.removeChannel(channel);
      };
    },
  };
}

export async function connectRealtimeConversation(
  conversationId: string,
): Promise<RealtimeConversationResult> {
  if (!uuidSchema.safeParse(conversationId).success) {
    return { ok: false, reason: 'invalid_id', message: '실시간 대화방 ID가 올바르지 않아요.' };
  }

  const client = createBrowserSupabaseClient();
  if (!client) {
    return { ok: false, reason: 'unconfigured', message: 'Supabase 연결 정보가 없어요.' };
  }

  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) {
    return {
      ok: false,
      reason: userError ? 'request_failed' : 'unauthenticated',
      message: userError ? '채팅 서버에 연결하지 못했어요.' : '실시간 채팅은 로그인이 필요해요.',
    };
  }

  const { data: conversation, error: conversationError } = await client
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .maybeSingle();
  if (conversationError) {
    return { ok: false, reason: 'request_failed', message: '대화방을 불러오지 못했어요.' };
  }
  if (!conversation) {
    return { ok: false, reason: 'not_found', message: '대화방이 없거나 접근할 수 없어요.' };
  }

  const [{ data: rows, error: messageError }, listingResult] = await Promise.all([
    client
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    conversation.listing_id
      ? client
          .from('listings')
          .select('id,title,price')
          .eq('id', conversation.listing_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (messageError) {
    return { ok: false, reason: 'request_failed', message: '메시지를 불러오지 못했어요.' };
  }

  const messages = (rows ?? []).flatMap((row) => {
    const message = parseMessage(row);
    return message ? [message] : [];
  });
  const listing = listingResult.data
    ? {
        id: listingResult.data.id,
        title: listingResult.data.title,
        price: Number(listingResult.data.price),
      }
    : null;

  const session = buildSession(client, {
    id: conversation.id,
    currentUserId: userData.user.id,
    otherUserName: '거래 상대',
    listing,
    messages,
  });
  return { ok: true, session };
}

export interface RealtimeConversationSummary {
  id: string;
  listingId: string | null;
  listingTitle: string;
  listingPrice: number | null;
  otherUserName: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
}

export async function listRealtimeConversations(): Promise<
  { ok: true; conversations: RealtimeConversationSummary[] } | { ok: false; message: string }
> {
  const client = createBrowserSupabaseClient();
  if (!client) return { ok: false, message: 'Supabase 연결 정보가 없어요.' };

  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, message: '실시간 채팅 목록은 로그인이 필요해요.' };
  }

  const { data: conversations, error } = await client
    .from('conversations')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(50);
  if (error) return { ok: false, message: '채팅 목록을 불러오지 못했어요.' };
  if (!conversations || conversations.length === 0) return { ok: true, conversations: [] };

  const { data: unreadRows } = await client.rpc('get_my_conversation_unread_counts', {});
  const unreadByConversation = new Map(
    (unreadRows ?? []).map((row) => [row.conversation_id, Number(row.unread_count)]),
  );

  const summaries = await Promise.all(
    conversations.map(async (conversation) => {
      const [messageResult, listingResult] = await Promise.all([
        client
          .from('messages')
          .select('body,created_at')
          .eq('conversation_id', conversation.id)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        conversation.listing_id
          ? client
              .from('listings')
              .select('id,title,price')
              .eq('id', conversation.listing_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      const lastMessage = messageResult.data;
      const listing = listingResult.data;

      return {
        id: conversation.id,
        listingId: listing?.id ?? conversation.listing_id,
        listingTitle: listing?.title ?? '종료된 거래',
        listingPrice: listing ? Number(listing.price) : null,
        otherUserName: '거래 상대',
        lastMessage: lastMessage?.body ?? '대화를 시작해 보세요.',
        lastMessageTime: lastMessage ? displayConversationTime(lastMessage.created_at) : '',
        unreadCount: unreadByConversation.get(conversation.id) ?? 0,
      };
    }),
  );
  return { ok: true, conversations: summaries };
}

function displayConversationTime(timestamp: string): string {
  const value = new Date(timestamp);
  if (!Number.isFinite(value.getTime())) return '';
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(value);
}

export async function startListingConversation(
  listingId: string,
  sellerId: string,
): Promise<
  | { ok: true; conversationId: string }
  | { ok: false; reason: 'unauthenticated' | 'own_listing' | 'request_failed'; message: string }
> {
  const client = createBrowserSupabaseClient();
  if (!client) {
    return { ok: false, reason: 'request_failed', message: '채팅 서버 연결 정보가 없어요.' };
  }

  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, reason: 'unauthenticated', message: '채팅을 시작하려면 로그인해 주세요.' };
  }
  if (userData.user.id === sellerId) {
    return { ok: false, reason: 'own_listing', message: '내 판매글에는 채팅을 시작할 수 없어요.' };
  }

  const existing = await client
    .from('conversations')
    .select('id')
    .eq('listing_id', listingId)
    .eq('buyer_id', userData.user.id)
    .eq('seller_id', sellerId)
    .maybeSingle();
  if (existing.data) return { ok: true, conversationId: existing.data.id };

  const created = await client
    .from('conversations')
    .insert({
      listing_id: listingId,
      buyer_id: userData.user.id,
      seller_id: sellerId,
    })
    .select('id')
    .single();
  if (created.data) return { ok: true, conversationId: created.data.id };

  const raced = await client
    .from('conversations')
    .select('id')
    .eq('listing_id', listingId)
    .eq('buyer_id', userData.user.id)
    .eq('seller_id', sellerId)
    .maybeSingle();
  return raced.data
    ? { ok: true, conversationId: raced.data.id }
    : { ok: false, reason: 'request_failed', message: '대화방을 만들지 못했어요.' };
}
