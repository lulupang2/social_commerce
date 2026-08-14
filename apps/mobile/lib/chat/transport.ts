import type {
  ChatMessage,
  ChatPage,
  ChatRepositoryError,
  ChatResult,
  ChatSummary,
  ConversationCursor,
  MessageCursor,
  UnreadSummary,
} from './model';

export interface ConversationPageOptions {
  cursor?: ConversationCursor;
  pageSize?: number;
}

export interface MessagePageOptions {
  cursor?: MessageCursor;
  pageSize?: number;
}

export interface InsertMessageInput {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
}

export type ChatRealtimeStatus = 'connected' | 'reconnecting' | 'closed';

export type ChatRealtimeEvent =
  { type: 'upsert'; messages: ChatMessage[] } | { type: 'remove'; messageIds: string[] };

export interface ChatSubscriptionHandlers {
  onEvent(event: ChatRealtimeEvent): void;
  onStatus?(status: ChatRealtimeStatus): void;
  onError?(error: ChatRepositoryError): void;
}

export interface ChatSubscription {
  unsubscribe(): Promise<void>;
}

export interface ChatTransport {
  getCurrentUserId(): Promise<ChatResult<string>>;
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
  insertMessage(input: InsertMessageInput): Promise<ChatResult<ChatMessage>>;
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
