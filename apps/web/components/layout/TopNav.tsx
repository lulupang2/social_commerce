'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { ArrowLeft, MessageCircle, Waves } from 'lucide-react';

interface TopNavProps {
  title?: string;
  showBack?: boolean;
}

export function TopNav({ title, showBack }: TopNavProps) {
  const router = useRouter();
  const pathname = usePathname();

  const isRoot = pathname === '/';
  const shouldShowBack = showBack ?? !isRoot;

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
        ) : (
          <Link href="/" className="top-nav-logo">
            <Waves size={24} color="var(--primary)" />
            <span>SummerGear</span>
          </Link>
        )}

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
            alignItems: 'center',
          }}
          aria-label="채팅 목록"
        >
          <MessageCircle size={22} color="var(--text-main)" />
        </Link>
      </div>
    </header>
  );
}
