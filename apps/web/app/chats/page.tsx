'use client';

import { LoaderCircle, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MobileShell } from '@/components/layout/MobileShell';
import { listRealtimeConversations, type RealtimeConversationSummary } from '@/lib/chat/realtime';

export default function ChatsPage() {
  const [chats, setChats] = useState<RealtimeConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    let active = true;
    let working = false;
    const reload = async () => {
      if (!active || working || document.hidden) return;
      working = true;
      const result = await listRealtimeConversations();
      working = false;
      if (!active) return;
      if (result.ok) { setChats(result.conversations); setError(''); }
      else setError(result.message);
      setLoading(false);
    };
    void reload();
    const timer = window.setInterval(() => { void reload(); }, 5000);
    const visible = () => { if (!document.hidden) void reload(); };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('focus', visible);
    return () => {
      active = false; window.clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('focus', visible);
    };
  }, [generation]);
  return <MobileShell title="채팅 목록">
    {loading ? <div className="empty-state"><LoaderCircle className="spin" size={28} /><p>채팅 목록을 확인하고 있어요.</p></div> : null}
    {error ? <div className="empty-state" role="alert"><p>{error}</p><button className="btn-outline" type="button" onClick={() => { setLoading(true); setGeneration((n) => n + 1); }}>다시 시도</button></div> : null}
    {!loading && !error && chats.length === 0 ? <div className="empty-state"><MessageSquare size={42} /><h1>아직 진행 중인 채팅이 없어요</h1><p>장비 상세에서 판매자에게 문의해 보세요.</p><Link className="btn-primary" href="/market">장비 둘러보기</Link></div> : null}
    {!error ? <div className="chat-list">{chats.map((chat) => <Link className="chat-list-item" href={`/chat/${chat.id}`} key={chat.id}>
      <div className="chat-avatar"><span>{chat.otherUserName.slice(0, 1)}</span>{chat.unreadCount > 0 ? <b>{Math.min(chat.unreadCount, 99)}</b> : null}</div>
      <div className="chat-list-copy"><div><strong>{chat.otherUserName}</strong><time>{chat.lastMessageTime}</time></div><p className={chat.unreadCount > 0 ? 'unread' : ''}>{chat.lastMessage}</p><small>{chat.listingTitle}</small></div>
      <div className="chat-listing-thumb"><span>SG</span></div>
    </Link>)}</div> : null}
  </MobileShell>;
}
