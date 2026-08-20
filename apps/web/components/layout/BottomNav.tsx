'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ShoppingBag, PlusCircle, MessageSquare, User } from 'lucide-react';

export function BottomNav() {
  const pathname = usePathname();

  const isHome = pathname === '/';
  const isMarket = pathname.startsWith('/market') && pathname !== '/market/create';
  const isSell = pathname === '/sell' || pathname === '/market/create';
  const isCommunity = pathname.startsWith('/community');
  const isChats = pathname.startsWith('/chats') || pathname.startsWith('/chat/');
  const isProfile = pathname.startsWith('/profile') || pathname.startsWith('/auth');

  return (
    <nav className="bottom-nav">
      <Link href="/" className={`nav-item ${isHome ? 'active' : ''}`}>
        <Home size={22} />
        <span>홈</span>
      </Link>
      <Link href="/market" className={`nav-item ${isMarket ? 'active' : ''}`}>
        <ShoppingBag size={22} />
        <span>마켓</span>
      </Link>
      <Link href="/sell" className="nav-item-sell">
        <div className="nav-item-sell-btn">
          <PlusCircle size={26} />
        </div>
        <span
          style={{ fontSize: '0.72rem', fontWeight: 600, marginTop: 2, color: 'var(--text-muted)' }}
        >
          판매
        </span>
      </Link>
      <Link href="/community" className={`nav-item ${isCommunity ? 'active' : ''}`}>
        <MessageSquare size={22} />
        <span>커뮤니티</span>
      </Link>
      <Link href="/profile" className={`nav-item ${isProfile ? 'active' : ''}`}>
        <User size={22} />
        <span>MY</span>
      </Link>
    </nav>
  );
}
