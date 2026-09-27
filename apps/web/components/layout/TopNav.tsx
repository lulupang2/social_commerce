'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { ArrowLeft, MessageCircle, Waves } from 'lucide-react';
import { listRealtimeConversations } from '@/lib/chat/realtime';
import { AUTH_SESSION_EVENT } from '@/lib/go-auth/client';

interface TopNavProps {
  title?: string;
  showBack?: boolean;
}

const TOP_LEVEL_PATHS: Record<string, true> = {
  '/': true,
  '/market': true,
  '/community': true,
  '/chats': true,
  '/profile': true,
};

export function TopNav({ title, showBack }: TopNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [unread, setUnread] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void listRealtimeConversations().then((result) => {
        if (active) setUnread(result.ok ? result.conversations.reduce((total, item) => total + item.unreadCount, 0) : null);
      });
    };
    refresh();
    const interval = window.setInterval(refresh, 10000);
    window.addEventListener(AUTH_SESSION_EVENT, refresh);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener(AUTH_SESSION_EVENT, refresh); };
  }, [pathname]);

  const shouldShowBack = showBack ?? TOP_LEVEL_PATHS[pathname] !== true;

  return (
    <header className="top-nav">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {shouldShowBack ? (
          <button
            onClick={() => router.back()}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: 4,
            }}
            aria-label="뒤로가기"
          >
            <ArrowLeft size={22} color="var(--text-main)" />
          </button>
        ) : !title ? (
          <Link href="/" className="top-nav-logo">
            <Waves size={24} color="var(--primary)" />
            <span>SummerGear</span>
          </Link>
        ) : null}

        {title && <span className="top-nav-title">{title}</span>}
      </div>

      <div className="top-nav-actions">
        <Link
          href="/chats"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 6,
            display: 'flex',
            position: 'relative',
            alignItems: 'center',
          }}
          aria-label="채팅 목록"
        >
          <MessageCircle size={22} color="var(--text-main)" />
          {unread !== null && unread > 0 ? <span aria-label={`읽지 않은 채팅 ${unread}개`} className="chat-nav-unread">{Math.min(unread, 99)}</span> : null}
        </Link>
      </div>
    </header>
  );
}
