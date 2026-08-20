'use client';

import React from 'react';
import Link from 'next/link';
import { MobileShell } from '@/components/layout/MobileShell';
import { SUMMER_CHAT_ROOMS } from '@/lib/data/summer-mock-data';
import { MessageSquare, ChevronRight } from 'lucide-react';

export default function ChatsPage() {
  return (
    <MobileShell title="채팅 목록">
      {SUMMER_CHAT_ROOMS.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 16px', color: 'var(--text-muted)' }}>
          <MessageSquare size={40} style={{ marginBottom: 12, opacity: 0.5 }} />
          <p style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 6 }}>
            진행 중인 채팅이 없습니다
          </p>
          <p style={{ fontSize: '0.85rem' }}>마음에 드는 장비 상세에서 판매자에게 문의해보세요.</p>
        </div>
      ) : (
        <div>
          {SUMMER_CHAT_ROOMS.map((chat) => (
            <Link
              href={`/chat/${chat.id}`}
              key={chat.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 16px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--surface)',
                textDecoration: 'none',
              }}
            >
              {/* User Avatar */}
              <div style={{ position: 'relative' }}>
                <img
                  src={chat.otherUser.avatar}
                  alt={chat.otherUser.name}
                  style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }}
                />
                {chat.unreadCount > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: -2,
                      right: -2,
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: 'var(--primary)',
                      color: '#fff',
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '2px solid #fff',
                    }}
                  >
                    {chat.unreadCount}
                  </div>
                )}
              </div>

              {/* Chat Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-main)' }}>
                    {chat.otherUser.name}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
                    {chat.lastMessageTime}
                  </span>
                </div>

                <div
                  style={{
                    fontSize: '0.85rem',
                    color: chat.unreadCount > 0 ? 'var(--text-main)' : 'var(--text-muted)',
                    fontWeight: chat.unreadCount > 0 ? 700 : 400,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    marginBottom: 4,
                  }}
                >
                  {chat.lastMessage}
                </div>

                <div
                  style={{
                    fontSize: '0.74rem',
                    color: 'var(--text-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span>{chat.listingTitle}</span>
                </div>
              </div>

              {/* Listing Thumbnail */}
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 6,
                  overflow: 'hidden',
                  flexShrink: 0,
                  border: '1px solid var(--border)',
                }}
              >
                <img
                  src={chat.listingImage}
                  alt="listing"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
            </Link>
          ))}
        </div>
      )}
    </MobileShell>
  );
}
