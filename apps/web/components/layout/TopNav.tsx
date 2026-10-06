'use client';

import { useTranslate } from '@/lib/i18n/use-translate';
import { LanguageSwitcher } from './LanguageSwitcher';

import { ArrowLeft, MessageCircle, Waves } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { listRealtimeConversations } from '@/lib/chat/realtime';
import { AUTH_SESSION_EVENT } from '@/lib/go-auth/client';
import { defaultBackPath, loginCancelPath, previousPage } from '@/lib/go-auth/navigation';

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
  const translate = useTranslate();
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
  const goBack = () => {
    if (pathname === '/auth') {
      const params = new URLSearchParams(window.location.search);
      router.replace(loginCancelPath(params.get('next'), params.get('back')));
    } else if (previousPage() && window.history.length > 1) {
      router.back();
    } else {
      router.replace(defaultBackPath(pathname));
    }
  };

  return (
    <header className={'top-nav' + (storefront ? ' storefront-top-nav' : '')}>
      <div className="top-nav-leading">
        {shouldShowBack ? (
          <button
            aria-label={translate("뒤로가기")}
            className="top-nav-back"
            onClick={goBack}
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

        {title ? <span className="top-nav-title">{translate(title)}</span> : null}
      </div>

      {storefront ? (
        <nav aria-label={translate("주요 메뉴")} className="storefront-desktop-nav">
          <Link aria-current={pathname.startsWith('/market') ? 'page' : undefined} href="/market">
            {translate("마켓")}</Link>
          <Link aria-current={pathname.startsWith('/sell') ? 'page' : undefined} href="/sell">
            {translate("판매하기")}</Link>
          <Link
            aria-current={pathname.startsWith('/community') ? 'page' : undefined}
            href="/community"
          >
            {translate("커뮤니티")}</Link>
          <Link aria-current={pathname.startsWith('/profile') ? 'page' : undefined} href="/profile">
            MY
          </Link>
        </nav>
      ) : null}

      <div className="top-nav-actions">
        <LanguageSwitcher />
        <Link aria-label={translate("채팅 목록")} className="top-nav-chat" href="/chats">
          <MessageCircle aria-hidden="true" size={22} />
          {unread !== null && unread > 0 ? (
            <span
              aria-label={translate("읽지 않은 채팅 ") + unread + translate("개")}
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
