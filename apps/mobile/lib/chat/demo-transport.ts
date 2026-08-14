import {
  compareMessagePosition,
  failure,
  isAfterMessageCursor,
  isBeforeMessageCursor,
  messageCursor,
  participantInitial,
  success,
  type ChatMessage,
  type ChatPage,
  type ChatSummary,
  type ConversationCursor,
  type MessageCursor,
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

const DEMO_USER_ID = 'demo-current-user';
const DEMO_SELLER_ID = 'demo-seller';
const DEMO_BUYER_ID = 'demo-buyer';

function confirmedMessage(
  id: string,
  conversationId: string,
  senderId: string,
  body: string,
  createdAt: string,
  readAt: string | null = null,
): ChatMessage {
  return {
    id,
    conversationId,
    senderId,
    body,
    readAt,
    deletedAt: null,
    createdAt,
    timeLabel: '데모',
    isMine: senderId === DEMO_USER_ID,
    delivery: 'confirmed',
  };
}

function initialState(): { conversations: ChatSummary[]; messages: ChatMessage[] } {
  const now = Date.now();
  const firstId = 'demo-chat-1';
  const secondId = 'demo-chat-2';
  const messages = [
    confirmedMessage(
      'demo-message-1',
      firstId,
      DEMO_USER_ID,
      '안녕하세요, 이번 주말 직거래 가능할까요?',
      new Date(now - 24 * 60 * 1000).toISOString(),
      new Date(now - 22 * 60 * 1000).toISOString(),
    ),
    confirmedMessage(
      'demo-message-2',
      firstId,
      DEMO_SELLER_ID,
      '네, 주말에 직거래 가능합니다!',
      new Date(now - 18 * 60 * 1000).toISOString(),
    ),
    confirmedMessage(
      'demo-message-3',
      secondId,
      DEMO_SELLER_ID,
      '270 사이즈 맞으면 예약 도와드릴게요.',
      new Date(now - 3 * 60 * 60 * 1000).toISOString(),
      new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    ),
  ];
  const conversations: ChatSummary[] = [
    {
      id: firstId,
      listingId: 'demo-listing-1',
      participantId: DEMO_SELLER_ID,
      participantName: '강원 장비함',
      participantInitial: '강',
      listingTitle: '살로몬 스키 165cm',
      preview: messages[1]?.body ?? '',
      unreadCount: 1,
      updatedAt: messages[1]?.createdAt ?? new Date(now).toISOString(),
      timeLabel: '18분 전',
      messages: messages.filter((message) => message.conversationId === firstId),
      isDemo: true,
    },
    {
      id: secondId,
      listingId: 'demo-listing-2',
      participantId: DEMO_SELLER_ID,
      participantName: '보드타는 민수',
      participantInitial: '보',
      listingTitle: '버튼 스노보드 부츠 270',
      preview: messages[2]?.body ?? '',
      unreadCount: 0,
      updatedAt: messages[2]?.createdAt ?? new Date(now).toISOString(),
      timeLabel: '3시간 전',
      messages: messages.filter((message) => message.conversationId === secondId),
      isDemo: true,
    },
  ];
  return { conversations, messages };
}

export function createDemoChatTransport(): ChatTransport {
  const state = initialState();
  const handlersByConversation = new Map<string, Set<ChatSubscriptionHandlers>>();

  function unread(): UnreadSummary {
    const byConversation: Record<string, number> = {};
    let total = 0;
    for (const conversation of state.conversations) {
      const count = state.messages.filter(
        (message) =>
          message.conversationId === conversation.id &&
          !message.isMine &&
          message.readAt === null &&
          message.deletedAt === null,
      ).length;
      byConversation[conversation.id] = count;
      total += count;
    }
    return { total, byConversation };
  }

  function hydrate(conversation: ChatSummary): ChatSummary {
    const messages = state.messages
      .filter((message) => message.conversationId === conversation.id && message.deletedAt === null)
      .sort(compareMessagePosition);
    const unreadCount = unread().byConversation[conversation.id] ?? 0;
    return { ...conversation, messages, unreadCount };
  }

  function emit(conversationId: string, messages: ChatMessage[]): void {
    for (const handlers of handlersByConversation.get(conversationId) ?? []) {
      handlers.onEvent({ type: 'upsert', messages });
    }
  }

  async function getCurrentUserId() {
    return success(DEMO_USER_ID);
  }

  async function findOrCreateConversation(listingId: string, participantId: string) {
    if (!listingId || !participantId || participantId === DEMO_USER_ID) {
      return failure<ChatSummary>({ code: 'permission', message: '본인과 채팅을 만들 수 없어요.' });
    }
    const existing = state.conversations.find(
      (conversation) =>
        conversation.listingId === listingId && conversation.participantId === participantId,
    );
    if (existing) return success(hydrate(existing));

    const now = new Date().toISOString();
    const conversation: ChatSummary = {
      id: `demo-chat-${state.conversations.length + 1}`,
      listingId,
      participantId,
      participantName: participantId === DEMO_BUYER_ID ? '데모 구매자' : '데모 판매자',
      participantInitial: participantInitial(
        participantId === DEMO_BUYER_ID ? '데모 구매자' : '데모 판매자',
      ),
      listingTitle: '데모 상품 문의',
      preview: '대화를 시작해보세요.',
      unreadCount: 0,
      updatedAt: now,
      timeLabel: '방금 전',
      messages: [],
      isDemo: true,
    };
    state.conversations.push(conversation);
    return success(hydrate(conversation));
  }

  async function listConversations(options: ConversationPageOptions = {}) {
    const limit = Math.min(50, Math.max(1, Math.trunc(options.pageSize ?? 20)));
    let sorted = state.conversations
      .map(hydrate)
      .sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id),
      );
    if (options.cursor) {
      const cursor = options.cursor;
      sorted = sorted.filter(
        (conversation) =>
          conversation.updatedAt < cursor.updatedAt ||
          (conversation.updatedAt === cursor.updatedAt && conversation.id < cursor.id),
      );
    }
    const hasMore = sorted.length > limit;
    const items = sorted.slice(0, limit);
    const boundary = items[items.length - 1];
    const nextCursor: ConversationCursor | null =
      hasMore && boundary ? { updatedAt: boundary.updatedAt, id: boundary.id } : null;
    return success({ items, nextCursor });
  }

  async function getConversation(id: string) {
    const conversation = state.conversations.find((candidate) => candidate.id === id);
    return conversation
      ? success(hydrate(conversation))
      : failure<ChatSummary>({ code: 'not_found', message: '채팅을 찾을 수 없어요.' });
  }

  async function listMessages(conversationId: string, options: MessagePageOptions = {}) {
    const conversation = state.conversations.find((candidate) => candidate.id === conversationId);
    if (!conversation) {
      return failure<ChatPage<ChatMessage, MessageCursor>>({
        code: 'not_found',
        message: '채팅을 찾을 수 없어요.',
      });
    }
    const limit = Math.min(50, Math.max(1, Math.trunc(options.pageSize ?? 20)));
    let sorted = state.messages
      .filter(
        (message) =>
          message.conversationId === conversationId &&
          message.deletedAt === null &&
          (!options.cursor || isBeforeMessageCursor(message, options.cursor)),
      )
      .sort((left, right) => compareMessagePosition(right, left));
    const hasMore = sorted.length > limit;
    sorted = sorted.slice(0, limit);
    const items = sorted.reverse();
    const oldest = items[0];
    return success({ items, nextCursor: hasMore && oldest ? messageCursor(oldest) : null });
  }

  async function insertMessage(input: InsertMessageInput) {
    const existing = state.messages.find((message) => message.id === input.id);
    if (existing) {
      if (
        existing.conversationId !== input.conversationId ||
        existing.senderId !== input.senderId ||
        existing.body !== input.body
      ) {
        return failure<ChatMessage>({
          code: 'permission',
          message: '메시지 재시도 식별자가 충돌했어요.',
        });
      }
      return success(existing);
    }
    const conversation = state.conversations.find(
      (candidate) => candidate.id === input.conversationId,
    );
    if (!conversation) {
      return failure<ChatMessage>({ code: 'not_found', message: '채팅을 찾을 수 없어요.' });
    }
    if (input.senderId !== DEMO_USER_ID) {
      return failure<ChatMessage>({
        code: 'permission',
        message: '다른 사용자로 메시지를 보낼 수 없어요.',
      });
    }

    const createdAt = new Date().toISOString();
    const message = confirmedMessage(
      input.id,
      input.conversationId,
      input.senderId,
      input.body,
      createdAt,
    );
    state.messages.push(message);
    conversation.preview = input.body;
    conversation.updatedAt = createdAt;
    conversation.timeLabel = '방금 전';
    emit(input.conversationId, [message]);
    return success(message);
  }

  async function getUnreadSummary() {
    return success(unread());
  }

  async function markConversationRead(conversationId: string) {
    const conversation = state.conversations.find((candidate) => candidate.id === conversationId);
    if (!conversation) {
      return failure<{ updatedCount: number; unread: UnreadSummary }>({
        code: 'not_found',
        message: '채팅을 찾을 수 없어요.',
      });
    }
    const readAt = new Date().toISOString();
    let updatedCount = 0;
    const updated: ChatMessage[] = [];
    state.messages = state.messages.map((message) => {
      if (
        message.conversationId !== conversationId ||
        message.isMine ||
        message.readAt !== null ||
        message.deletedAt !== null
      ) {
        return message;
      }
      updatedCount += 1;
      const next = { ...message, readAt };
      updated.push(next);
      return next;
    });
    if (updated.length) emit(conversationId, updated);
    return success({ updatedCount, unread: unread() });
  }

  async function subscribeToMessages(
    conversationId: string,
    after: MessageCursor | undefined,
    handlers: ChatSubscriptionHandlers,
  ) {
    const conversation = state.conversations.find((candidate) => candidate.id === conversationId);
    if (!conversation) {
      return failure<ChatSubscription>({ code: 'not_found', message: '채팅을 찾을 수 없어요.' });
    }
    let subscriptions = handlersByConversation.get(conversationId);
    if (!subscriptions) {
      subscriptions = new Set();
      handlersByConversation.set(conversationId, subscriptions);
    }
    subscriptions.add(handlers);
    handlers.onStatus?.('connected');
    const caughtUp = state.messages
      .filter(
        (message) =>
          message.conversationId === conversationId &&
          message.deletedAt === null &&
          (!after || isAfterMessageCursor(message, after)),
      )
      .sort(compareMessagePosition);
    if (caughtUp.length) handlers.onEvent({ type: 'upsert', messages: caughtUp });

    let closed = false;
    return success({
      async unsubscribe(): Promise<void> {
        if (closed) return;
        closed = true;
        subscriptions?.delete(handlers);
        if (subscriptions?.size === 0) handlersByConversation.delete(conversationId);
        handlers.onStatus?.('closed');
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
