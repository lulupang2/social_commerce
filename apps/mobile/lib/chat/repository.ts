import { supabase } from '../supabase/client';
import { formatTime } from '../format';

export type ChatMessage = {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  timeLabel: string;
  isMine: boolean;
};

export type ChatSummary = {
  id: string;
  participantName: string;
  participantInitial: string;
  listingTitle: string;
  preview: string;
  unreadCount: number;
  updatedAt: string;
  timeLabel: string;
  messages: ChatMessage[];
  isDemo?: boolean;
};

const DEMO_CHATS: ChatSummary[] = [
  {
    id: 'demo-chat-1',
    participantName: '강원 장비함',
    participantInitial: '강',
    listingTitle: 'Rossignol Experience 88 Ti 172cm',
    preview: '네, 주말에 직거래 가능합니다!',
    unreadCount: 2,
    updatedAt: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
    timeLabel: '18분 전',
    isDemo: true,
    messages: [
      {
        id: 'demo-message-1',
        senderId: 'me',
        body: '스키 상태를 조금 더 알 수 있을까요?',
        createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
        timeLabel: '45분 전',
        isMine: true,
      },
      {
        id: 'demo-message-2',
        senderId: 'demo-seller',
        body: '엣지 정비했고 베이스 큰 손상은 없습니다.',
        createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        timeLabel: '30분 전',
        isMine: false,
      },
      {
        id: 'demo-message-3',
        senderId: 'demo-seller',
        body: '네, 주말에 직거래 가능합니다!',
        createdAt: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
        timeLabel: '18분 전',
        isMine: false,
      },
    ],
  },
  {
    id: 'demo-chat-2',
    participantName: '링크버디',
    participantInitial: '링',
    listingTitle: 'CCM Jetspeed FT6 Pro Ice Skates 270',
    preview: '270 사이즈 맞으면 예약 도와드릴게요.',
    unreadCount: 0,
    updatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    timeLabel: '3시간 전',
    isDemo: true,
    messages: [
      {
        id: 'demo-message-4',
        senderId: 'demo-seller',
        body: '270 사이즈 맞으면 예약 도와드릴게요.',
        createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        timeLabel: '3시간 전',
        isMine: false,
      },
    ],
  },
  {
    id: 'demo-chat-3',
    participantName: '스노우 클럽',
    participantInitial: '스',
    listingTitle: 'Smith Squad MAG Ski Goggles',
    preview: '상품 잘 받았습니다. 감사합니다!',
    unreadCount: 0,
    updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    timeLabel: '2일 전',
    isDemo: true,
    messages: [
      {
        id: 'demo-message-5',
        senderId: 'me',
        body: '상품 잘 받았습니다. 감사합니다!',
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        timeLabel: '2일 전',
        isMine: true,
      },
    ],
  },
];

export function demoChats(): ChatSummary[] {
  return DEMO_CHATS.map((chat) => ({
    ...chat,
    messages: chat.messages.map((message) => ({ ...message })),
  }));
}

export async function listChats(): Promise<ChatSummary[]> {
  if (!supabase) return demoChats();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return demoChats();

  const { data, error } = await supabase
    .from('conversations')
    .select('id,listing_id,buyer_id,seller_id,status,created_at,updated_at,listings(title)')
    .or(`buyer_id.eq.${authData.user.id},seller_id.eq.${authData.user.id}`)
    .neq('status', 'blocked')
    .order('updated_at', { ascending: false });
  if (error || !data?.length) return demoChats();

  const summaries = await Promise.all(
    data.map(async (row) => {
      const messages = await loadMessages(row.id, authData.user.id);
      const latest = messages[messages.length - 1];
      const listing = Array.isArray(row.listings) ? row.listings[0] : row.listings;
      return {
        id: row.id,
        participantName: row.seller_id === authData.user.id ? '구매자' : '판매자',
        participantInitial: row.seller_id === authData.user.id ? '구' : '판',
        listingTitle: listing?.title ?? '상품 문의',
        preview: latest?.body ?? '대화를 시작해보세요.',
        unreadCount: 0,
        updatedAt: row.updated_at,
        timeLabel: formatTime(row.updated_at),
        messages,
      } satisfies ChatSummary;
    }),
  );
  return summaries;
}

export async function getChat(id: string): Promise<ChatSummary | null> {
  const demo = DEMO_CHATS.find((chat) => chat.id === id);
  if (demo || !supabase)
    return demo ? { ...demo, messages: demo.messages.map((message) => ({ ...message })) } : null;

  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return null;
  const { data, error } = await supabase
    .from('conversations')
    .select('id,listing_id,buyer_id,seller_id,status,created_at,updated_at,listings(title)')
    .eq('id', id)
    .maybeSingle();
  if (
    error ||
    !data ||
    (data.buyer_id !== authData.user.id && data.seller_id !== authData.user.id)
  ) {
    return null;
  }
  const messages = await loadMessages(id, authData.user.id);
  const listing = Array.isArray(data.listings) ? data.listings[0] : data.listings;
  return {
    id: data.id,
    participantName: data.seller_id === authData.user.id ? '구매자' : '판매자',
    participantInitial: data.seller_id === authData.user.id ? '구' : '판',
    listingTitle: listing?.title ?? '상품 문의',
    preview: messages[messages.length - 1]?.body ?? '대화를 시작해보세요.',
    unreadCount: 0,
    updatedAt: data.updated_at,
    timeLabel: formatTime(data.updated_at),
    messages,
  };
}

async function loadMessages(conversationId: string, userId: string): Promise<ChatMessage[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('messages')
    .select('id,sender_id,body,created_at')
    .eq('conversation_id', conversationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
    timeLabel: formatTime(row.created_at),
    isMine: row.sender_id === userId,
  }));
}

export async function sendChatMessage(
  conversationId: string,
  body: string,
): Promise<{ data: ChatMessage | null; error: string | null }> {
  if (!supabase) return { data: null, error: '로그인 후 메시지를 보낼 수 있어요.' };
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user)
    return { data: null, error: '로그인 후 메시지를 보낼 수 있어요.' };
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: authData.user.id, body: body.trim() })
    .select('id,sender_id,body,created_at')
    .single();
  if (error || !data) return { data: null, error: '메시지를 보내지 못했어요.' };
  return {
    data: {
      id: data.id,
      senderId: data.sender_id,
      body: data.body,
      createdAt: data.created_at,
      timeLabel: '방금 전',
      isMine: true,
    },
    error: null,
  };
}
