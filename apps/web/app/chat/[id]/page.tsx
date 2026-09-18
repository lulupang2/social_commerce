'use client';

import type { ChatMessage } from '@icegear/domain';
import { ChevronRight, LoaderCircle, Send, Shield } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import React, { use, useEffect, useRef, useState } from 'react';

import { MobileShell } from '@/components/layout/MobileShell';
import { connectRealtimeConversation, type RealtimeConversationSession } from '@/lib/chat/realtime';
import { SUMMER_CHAT_ROOMS } from '@/lib/data/summer-mock-data';
import { showNativeLocalNotification, triggerNativeHaptic } from '@/lib/native-bridge';

interface DisplayMessage {
  id: string;
  sender: 'me' | 'other';
  text: string;
  time: string;
}

function displayTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('ko-KR', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function toDisplayMessage(message: ChatMessage, currentUserId: string): DisplayMessage {
  return {
    id: message.id,
    sender: message.senderId === currentUserId ? 'me' : 'other',
    text: message.body,
    time: displayTime(message.createdAt),
  };
}

export default function ChatRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const demoChat = SUMMER_CHAT_ROOMS.find((chat) => chat.id === id) ?? null;
  const [session, setSession] = useState<RealtimeConversationSession | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>(
    demoChat?.messages.map((message) => ({ ...message, text: message.text })) ?? [],
  );
  const [inputText, setInputText] = useState('');
  const [isConnecting, setIsConnecting] = useState(!demoChat);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (demoChat) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;

    void connectRealtimeConversation(id).then((result) => {
      if (!active) return;
      setIsConnecting(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }

      setSession(result.session);
      setMessages(
        result.session.model.messages.map((message) =>
          toDisplayMessage(message, result.session.model.currentUserId),
        ),
      );
      void result.session.markRead();
      unsubscribe = result.session.subscribe((message) => {
        if (!active) return;
        const displayMessage = toDisplayMessage(message, result.session.model.currentUserId);
        setMessages((current) =>
          current.some((item) => item.id === displayMessage.id)
            ? current
            : [...current, displayMessage],
        );
        if (displayMessage.sender === 'other') {
          triggerNativeHaptic('selection');
          if (document.hidden) {
            showNativeLocalNotification('새 거래 메시지', displayMessage.text, `/chat/${id}`);
          }
          void result.session.markRead();
        }
      });
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [demoChat, id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = inputText.trim();
    if (!body || isSending) return;
    setError('');
    setIsSending(true);

    try {
      if (demoChat) {
        setMessages((current) => [
          ...current,
          {
            id: `local-message-${Date.now()}`,
            sender: 'me',
            text: body,
            time: '방금',
          },
        ]);
      } else if (session) {
        const message = await session.send(body);
        const displayMessage = toDisplayMessage(message, session.model.currentUserId);
        setMessages((current) =>
          current.some((item) => item.id === displayMessage.id)
            ? current
            : [...current, displayMessage],
        );
      } else {
        setError('채팅 연결이 완료된 뒤 다시 보내주세요.');
        return;
      }
      setInputText('');
      triggerNativeHaptic('success');
    } catch {
      setError('메시지를 보내지 못했어요. 연결을 확인해 주세요.');
      triggerNativeHaptic('error');
    } finally {
      setIsSending(false);
    }
  };

  const otherUserName = demoChat?.otherUser.name ?? session?.model.otherUserName ?? '거래 채팅';
  const listing = demoChat
    ? {
        id: demoChat.listingId,
        title: demoChat.listingTitle,
        price: demoChat.listingPrice,
        image: demoChat.listingImage,
      }
    : session?.model.listing
      ? { ...session.model.listing, image: null }
      : null;

  if (isConnecting) {
    return (
      <MobileShell title="채팅 연결 중" showBack hideNav>
        <div className="empty-state">
          <LoaderCircle className="spin" size={28} />
          <p>실시간 대화를 불러오고 있어요.</p>
        </div>
      </MobileShell>
    );
  }

  if (!demoChat && !session) {
    return (
      <MobileShell title="채팅을 열 수 없어요" showBack hideNav>
        <div className="empty-state">
          <p>{error || '대화방이 없거나 접근할 수 없어요.'}</p>
          <Link className="btn-primary" href="/chats">
            채팅 목록으로 돌아가기
          </Link>
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell title={otherUserName} showBack hideNav>
      <div className="chat-room">
        {listing ? (
          <Link className="chat-listing-bar" href={`/market/${listing.id}`}>
            {listing.image ? (
              <Image alt={listing.title} height={44} src={listing.image} unoptimized width={44} />
            ) : (
              <div className="chat-listing-placeholder">SG</div>
            )}
            <div>
              <strong>{listing.title}</strong>
              <span>{listing.price.toLocaleString()}원</span>
            </div>
            <ChevronRight size={16} />
          </Link>
        ) : null}

        <div className="chat-safety">
          <Shield size={14} />
          <span>앱 밖 결제 유도와 선입금 요청을 주의하세요.</span>
        </div>

        <div aria-live="polite" className="chat-message-list">
          {messages.map((message) => (
            <div className={`chat-message ${message.sender}`} key={message.id}>
              <div className={message.sender === 'me' ? 'chat-bubble-me' : 'chat-bubble-other'}>
                {message.text}
              </div>
              <time>{message.time}</time>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {error ? (
          <p className="chat-error" role="alert">
            {error}
          </p>
        ) : null}
        <form className="chat-composer" onSubmit={(event) => void sendMessage(event)}>
          <label className="visually-hidden" htmlFor="chat-message">
            메시지
          </label>
          <input
            className="form-input"
            id="chat-message"
            maxLength={10000}
            onChange={(event) => setInputText(event.target.value)}
            placeholder="메시지를 입력하세요"
            value={inputText}
          />
          <button
            aria-label="메시지 보내기"
            className="btn-primary"
            disabled={isSending || !inputText.trim()}
            type="submit"
          >
            {isSending ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}
          </button>
        </form>
      </div>
    </MobileShell>
  );
}
