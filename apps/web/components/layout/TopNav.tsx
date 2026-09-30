'use client';

import { ArrowLeft, MessageCircle, Waves } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { listRealtimeConversations } from '@/lib/chat/realtime';
import { AUTH_SESSION_EVENT } from '@/lib/go-auth/client';

interface TopNavProps {
  title?: string;
  showBack?: boolean;
  storefront?: boolean;
}

const TOP_LEVEL_PATHS: Record<string, true> = {
  '/': true,
  '/market': true,
  '/community': true,
  '/chats': true,
  '/profile': true,
};

export function TopNav({ title, showBack, storefront = false }: TopNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [unread, setUnread] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void listRealtimeConversations({ background: true }).then((result) => {
        if (active) {
          setUnread(
            result.ok
              ? result.conversations.reduce((total, item) => total + item.unreadCount, 0)
              : null,
          );
        }
      });
    };
    refresh();
    const interval = window.setInterval(refresh, 10000);
    window.addEventListener(AUTH_SESSION_EVENT, refresh);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener(AUTH_SESSION_EVENT, refresh);
    };
  }, [pathname]);

  const shouldShowBack = showBack ?? TOP_LEVEL_PATHS[pathname] !== true;

  return (
    <header className={'top-nav' + (storefront ? ' storefront-top-nav' : '')}>
      <div className="top-nav-leading">
        {shouldShowBack ? (
          <button
            aria-label="뒤로가기"
            className="top-nav-back"
            onClick={() => router.back()}
            type="button"
          >
            <ArrowLeft aria-hidden="true" size={22} />
          </button>
        ) : (
          <Link className="top-nav-logo" href="/">
            <Waves aria-hidden="true" size={24} />
            <span>SummerGear</span>
          </Link>
        )}

        {title ? <span className="top-nav-title">{title}</span> : null}
      </div>

      {storefront ? (
        <nav aria-label="주요 메뉴" className="storefront-desktop-nav">
          <Link aria-current={pathname.startsWith('/market') ? 'page' : undefined} href="/market">
            마켓
          </Link>
          <Link aria-current={pathname.startsWith('/sell') ? 'page' : undefined} href="/sell">
            판매하기
          </Link>
          <Link
            aria-current={pathname.startsWith('/community') ? 'page' : undefined}
            href="/community"
          >
            커뮤니티
          </Link>
          <Link aria-current={pathname.startsWith('/profile') ? 'page' : undefined} href="/profile">
            MY
          </Link>
        </nav>
      ) : null}

      <div className="top-nav-actions">
        <Link aria-label="채팅 목록" className="top-nav-chat" href="/chats">
          <MessageCircle aria-hidden="true" size={22} />
          {unread !== null && unread > 0 ? (
            <span
              aria-label={'읽지 않은 채팅 ' + unread + '개'}
              className="chat-nav-unread"
            >
              {Math.min(unread, 99)}
            </span>
          ) : null}
        </Link>
      </div>
    </header>
  );
}
