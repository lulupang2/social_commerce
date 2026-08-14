import { formatTime } from '../format';

export type ChatRepositoryErrorCode =
  'auth' | 'not_found' | 'permission' | 'network' | 'realtime' | 'validation';

export interface ChatRepositoryError {
  code: ChatRepositoryErrorCode;
  message: string;
  cause?: unknown;
}

export type ChatResult<T> = { data: T; error: null } | { data: null; error: ChatRepositoryError };

export type MessageDelivery = 'sending' | 'confirmed' | 'failed';

export interface ChatMessage {
  id: string;
  conversationId?: string;
  senderId: string;
  body: string;
  readAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  timeLabel: string;
  isMine: boolean;
  delivery?: MessageDelivery;
  error?: ChatRepositoryError;
}

export interface ChatSummary {
  id: string;
  listingId: string | null;
  participantId: string;
  participantName: string;
  participantInitial: string;
  listingTitle: string;
  preview: string;
  unreadCount: number;
  updatedAt: string;
  timeLabel: string;
  messages: ChatMessage[];
  isDemo?: boolean;
}

export interface ConversationCursor {
  updatedAt: string;
  id: string;
}

export interface MessageCursor {
  createdAt: string;
  id: string;
}

export interface ChatPage<T, TCursor> {
  items: T[];
  nextCursor: TCursor | null;
}

export interface UnreadSummary {
  total: number;
  byConversation: Readonly<Record<string, number>>;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  read_at?: string | null;
  deleted_at?: string | null;
  created_at: string;
}

export function success<T>(data: T): ChatResult<T> {
  return { data, error: null };
}

export function failure<T>(error: ChatRepositoryError): ChatResult<T> {
  return { data: null, error };
}

export function messageCursor(message: Pick<ChatMessage, 'createdAt' | 'id'>): MessageCursor {
  return { createdAt: message.createdAt, id: message.id };
}

export function compareMessagePosition(
  left: Pick<ChatMessage, 'createdAt' | 'id'>,
  right: Pick<ChatMessage, 'createdAt' | 'id'>,
): number {
  const timeOrder = left.createdAt.localeCompare(right.createdAt);
  return timeOrder || left.id.localeCompare(right.id);
}

export function isAfterMessageCursor(
  message: Pick<ChatMessage, 'createdAt' | 'id'>,
  cursor: MessageCursor,
): boolean {
  return compareMessagePosition(message, cursor) > 0;
}

export function isBeforeMessageCursor(
  message: Pick<ChatMessage, 'createdAt' | 'id'>,
  cursor: MessageCursor,
): boolean {
  return compareMessagePosition(message, cursor) < 0;
}

/** Server rows replace optimistic rows with the same client-generated UUID. */
export function mergeMessages(
  current: readonly ChatMessage[],
  incoming: readonly ChatMessage[],
): ChatMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    const existing = byId.get(message.id);
    if (!existing || message.delivery === 'confirmed' || existing.delivery !== 'confirmed') {
      byId.set(message.id, message);
    }
  }

  return [...byId.values()]
    .filter((message) => message.deletedAt === null)
    .sort(compareMessagePosition);
}

export function mapMessageRow(row: MessageRow, userId: string): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    readAt: row.read_at ?? null,
    deletedAt: row.deleted_at ?? null,
    createdAt: row.created_at,
    timeLabel: formatTime(row.created_at),
    isMine: row.sender_id === userId,
    delivery: 'confirmed',
  };
}

export function participantInitial(name: string): string {
  return Array.from(name.trim())[0] ?? '?';
}

export function createClientMessageId(random: () => number = Math.random): string {
  const hex = Array.from({ length: 32 }, () => Math.floor(random() * 16).toString(16));
  hex[12] = '4';
  hex[16] = ((Number.parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex
    .slice(12, 16)
    .join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
}
