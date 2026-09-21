'use client';

import { LoaderCircle, MessageSquare } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import React, { useEffect, useState } from 'react';

import { MobileShell } from '@/components/layout/MobileShell';
import { listRealtimeConversations, type RealtimeConversationSummary } from '@/lib/chat/realtime';
import { SUMMER_CHAT_ROOMS } from '@/lib/data/summer-mock-data';

export default function ChatsPage() {
  const [liveChats, setLiveChats] = useState<RealtimeConversationSummary[] | null>(null);
  const [isLiveSource, setIsLiveSource] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void listRealtimeConversations().then((result) => {
      if (!active) return;
      if (result.ok) {
        setLiveChats(result.conversations);
        setIsLiveSource(true);
      }
      setIsLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const chats = isLiveSource
    ? (liveChats ?? []).map((chat) => ({
        id: chat.id,
        name: chat.otherUserName,
        avatar: null,
        listingImage: null,
        listingTitle: chat.listingTitle,
        lastMessage: chat.lastMessage,
        lastMessageTime: chat.lastMessageTime,
        unreadCount: chat.unreadCount,
      }))
    : SUMMER_CHAT_ROOMS.map((chat) => ({
        id: chat.id,
        name: chat.otherUser.name,
        avatar: chat.otherUser.avatar,
        listingImage: chat.listingImage,
        listingTitle: chat.listingTitle,
        lastMessage: chat.lastMessage,
        lastMessageTime: chat.lastMessageTime,
        unreadCount: chat.unreadCount,
      }));

  return (
    <MobileShell title="채팅 목록">
      {!isLiveSource && !isLoading ? (
        <div className="demo-mode-banner">
          <span>DEMO</span> 로그인하면 실제 거래 채팅으로 전환돼요.
        </div>
      ) : null}

      {isLoading ? (
        <div className="empty-state">
          <LoaderCircle className="spin" size={28} />
          <p>채팅 목록을 확인하고 있어요.</p>
        </div>
      ) : chats.length === 0 ? (
        <div className="empty-state">
          <MessageSquare size={42} />
          <h1>아직 진행 중인 채팅이 없어요</h1>
          <p>마음에 드는 장비 상세에서 판매자에게 문의해 보세요.</p>
          <Link className="btn-primary" href="/market">
            장비 둘러보기
          </Link>
        </div>
      ) : (
        <div className="chat-list">
          {chats.map((chat) => (
            <Link className="chat-list-item" href={`/chat/${chat.id}`} key={chat.id}>
              <div className="chat-avatar">
                {chat.avatar ? (
                  <Image alt={chat.name} height={50} src={chat.avatar} unoptimized width={50} />
                ) : (
                  <span>{chat.name.slice(0, 1)}</span>
                )}
                {chat.unreadCount > 0 ? <b>{Math.min(chat.unreadCount, 99)}</b> : null}
              </div>

              <div className="chat-list-copy">
                <div>
                  <strong>{chat.name}</strong>
                  <time>{chat.lastMessageTime}</time>
                </div>
                <p className={chat.unreadCount > 0 ? 'unread' : ''}>{chat.lastMessage}</p>
                <small>{chat.listingTitle}</small>
              </div>

              <div className="chat-listing-thumb">
                {chat.listingImage ? (
                  <Image
                    alt={chat.listingTitle}
                    height={46}
                    src={chat.listingImage}
                    unoptimized
                    width={46}
                  />
                ) : (
                  <span>SG</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </MobileShell>
  );
}
