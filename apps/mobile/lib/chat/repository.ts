import { supabase } from '../supabase/client';
import { createDemoChatTransport } from './demo-transport';
import {
  createClientMessageId,
  failure,
  mergeMessages,
  success,
  type ChatMessage,
  type ChatPage,
  type ChatRepositoryError,
  type ChatResult,
  type ChatSummary,
  type ConversationCursor,
  type MessageCursor,
  type UnreadSummary,
} from './model';
import { createSupabaseChatTransport } from './supabase-transport';
import type {
  ChatRealtimeEvent,
  ChatSubscription,
  ChatSubscriptionHandlers,
  ChatTransport,
  ConversationPageOptions,
  MessagePageOptions,
} from './transport';

export type {
  ChatMessage,
  ChatPage,
  ChatRepositoryError,
  ChatRepositoryErrorCode,
  ChatResult,
  ChatSummary,
  ConversationCursor,
  MessageCursor,
  MessageDelivery,
  UnreadSummary,
} from './model';
export type {
  ChatRealtimeEvent,
  ChatRealtimeStatus,
  ChatSubscription,
  ChatSubscriptionHandlers,
  ConversationPageOptions,
  MessagePageOptions,
} from './transport';

export interface ChatSendOperation {
  optimistic: ChatMessage;
  completion: Promise<ChatResult<ChatMessage>>;
  retry(): Promise<ChatResult<ChatSendOperation>>;
}

export type ChatSendObserver = (message: ChatMessage) => void;

export interface ChatRepository {
  findOrCreateConversation(
    listingId: string,
    participantId: string,
  ): Promise<ChatResult<ChatSummary>>;
  listConversations(
    options?: ConversationPageOptions,
  ): Promise<ChatResult<ChatPage<ChatSummary, ConversationCursor>>>;
  getConversation(id: string): Promise<ChatResult<ChatSummary>>;
  listMessages(
    conversationId: string,
    options?: MessagePageOptions,
  ): Promise<ChatResult<ChatPage<ChatMessage, MessageCursor>>>;
  beginSend(
    conversationId: string,
    body: string,
    observer?: ChatSendObserver,
  ): Promise<ChatResult<ChatSendOperation>>;
  retryMessage(
    failedMessage: ChatMessage,
    observer?: ChatSendObserver,
  ): Promise<ChatResult<ChatSendOperation>>;
  markConversationRead(
    conversationId: string,
  ): Promise<ChatResult<{ updatedCount: number; unread: UnreadSummary }>>;
  getUnreadSummary(): Promise<ChatResult<UnreadSummary>>;
  subscribeToMessages(
    conversationId: string,
    after: MessageCursor | undefined,
    handlers: ChatSubscriptionHandlers,
  ): Promise<ChatResult<ChatSubscription>>;
}

function sameMessage(left: ChatMessage, right: ChatMessage): boolean {
  return (
    left.id === right.id &&
    left.body === right.body &&
    left.readAt === right.readAt &&
    left.deletedAt === right.deletedAt &&
    left.delivery === right.delivery
  );
}

export function createChatRepository(transport: ChatTransport): ChatRepository {
  async function beginSendWithId(
    conversationId: string,
    body: string,
    messageId: string,
    observer?: ChatSendObserver,
  ): Promise<ChatResult<ChatSendOperation>> {
    const normalizedBody = body.trim();
    if (!normalizedBody || normalizedBody.length > 10_000) {
      return failure({
        code: 'validation',
        message: normalizedBody
          ? '메시지는 10,000자까지 보낼 수 있어요.'
          : '메시지를 입력해 주세요.',
      });
    }

    const auth = await transport.getCurrentUserId();
    if (auth.error) return auth;
    const optimistic: ChatMessage = {
      id: messageId,
      conversationId,
      senderId: auth.data,
      body: normalizedBody,
      readAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      timeLabel: '방금 전',
      isMine: true,
      delivery: 'sending',
    };
    observer?.(optimistic);

    const completion = transport
      .insertMessage({
        id: messageId,
        conversationId,
        senderId: auth.data,
        body: normalizedBody,
      })
      .then((result): ChatResult<ChatMessage> => {
        if (result.error) {
          const failed = { ...optimistic, delivery: 'failed' as const, error: result.error };
          observer?.(failed);
          return failure(result.error);
        }
        observer?.(result.data);
        return result;
      });

    const operation: ChatSendOperation = {
      optimistic,
      completion,
      retry: () => beginSendWithId(conversationId, normalizedBody, messageId, observer),
    };
    return success(operation);
  }

  async function beginSend(
    conversationId: string,
    body: string,
    observer?: ChatSendObserver,
  ): Promise<ChatResult<ChatSendOperation>> {
    return beginSendWithId(conversationId, body, createClientMessageId(), observer);
  }

  async function retryMessage(
    failedMessage: ChatMessage,
    observer?: ChatSendObserver,
  ): Promise<ChatResult<ChatSendOperation>> {
    if (
      failedMessage.delivery !== 'failed' ||
      !failedMessage.isMine ||
      !failedMessage.conversationId
    ) {
      return failure({ code: 'permission', message: '실패한 내 메시지만 다시 보낼 수 있어요.' });
    }
    return beginSendWithId(
      failedMessage.conversationId,
      failedMessage.body,
      failedMessage.id,
      observer,
    );
  }

  async function subscribeToMessages(
    conversationId: string,
    after: MessageCursor | undefined,
    handlers: ChatSubscriptionHandlers,
  ): Promise<ChatResult<ChatSubscription>> {
    const messagesById = new Map<string, ChatMessage>();
    const removedIds = new Set<string>();
    const result = await transport.subscribeToMessages(conversationId, after, {
      ...handlers,
      onEvent(event: ChatRealtimeEvent): void {
        if (event.type === 'remove') {
          const freshIds = event.messageIds.filter((id) => !removedIds.has(id));
          for (const id of freshIds) {
            removedIds.add(id);
            messagesById.delete(id);
          }
          if (freshIds.length) handlers.onEvent({ type: 'remove', messageIds: freshIds });
          return;
        }

        const freshMessages: ChatMessage[] = [];
        for (const message of event.messages) {
          const existing = messagesById.get(message.id);
          if (!existing || !sameMessage(existing, message)) {
            messagesById.set(message.id, message);
            removedIds.delete(message.id);
            freshMessages.push(message);
          }
        }
        if (freshMessages.length) {
          handlers.onEvent({ type: 'upsert', messages: mergeMessages([], freshMessages) });
        }
      },
    });
    return result;
  }

  return {
    findOrCreateConversation: transport.findOrCreateConversation,
    listConversations: transport.listConversations,
    getConversation: transport.getConversation,
    listMessages: transport.listMessages,
    beginSend,
    retryMessage,
    markConversationRead: transport.markConversationRead,
    getUnreadSummary: transport.getUnreadSummary,
    subscribeToMessages,
  };
}

const explicitDemoTransport =
  typeof __DEV__ !== 'undefined' &&
  __DEV__ === true &&
  process.env.EXPO_PUBLIC_CHAT_TRANSPORT === 'demo';

export const chatRepository = createChatRepository(
  explicitDemoTransport ? createDemoChatTransport() : createSupabaseChatTransport(supabase),
);

/** Compatibility for T34 screens while they migrate to paginated repository methods. */
export async function listChats(): Promise<ChatSummary[]> {
  const result = await chatRepository.listConversations();
  return result.data?.items ?? [];
}

/** Compatibility for T34 screens while they migrate to paginated repository methods. */
export async function getChat(id: string): Promise<ChatSummary | null> {
  const conversation = await chatRepository.getConversation(id);
  if (conversation.error) return null;
  const messages = await chatRepository.listMessages(id, { pageSize: 50 });
  if (messages.error) return conversation.data;
  return { ...conversation.data, messages: messages.data.items };
}

/** Compatibility for T34 screens while they migrate to optimistic operations. */
export async function sendChatMessage(
  conversationId: string,
  body: string,
): Promise<{ data: ChatMessage | null; error: string | null }> {
  const started = await chatRepository.beginSend(conversationId, body);
  if (started.error) return { data: null, error: started.error.message };
  const confirmed = await started.data.completion;
  return confirmed.error
    ? { data: null, error: confirmed.error.message }
    : { data: confirmed.data, error: null };
}
