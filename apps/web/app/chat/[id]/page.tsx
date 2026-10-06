'use client';

import { useLocale } from 'next-intl';
import { formatWon } from '@/lib/display-format';
import { useTranslate } from '@/lib/i18n/use-translate';

import type { ChatMessage } from '@icegear/domain';
import { ChevronRight, LoaderCircle, Send, Shield } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import React, { use, useEffect, useRef, useState } from 'react';

import { StatePanel } from '@/components/ui/StatePanel';
import { MobileShell } from '@/components/layout/MobileShell';
import { connectRealtimeConversation, type RealtimeConversationResult, type RealtimeConversationSession } from '@/lib/chat/realtime';
import { SUMMER_CHAT_ROOMS } from '@/lib/data/summer-mock-data';
import { showNativeLocalNotification, triggerNativeHaptic } from '@/lib/native-bridge';

interface DisplayMessage {
  id: string;
  sender: 'me' | 'other';
  text: string;
  time: string;
}

function displayTime(timestamp: string, locale: string): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'ko-KR', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function toDisplayMessage(message: ChatMessage, currentUserId: string, locale: string): DisplayMessage {
  return {
    id: message.id,
    sender: message.senderId === currentUserId ? 'me' : 'other',
    text: message.body,
    time: displayTime(message.createdAt, locale),
  };
}

export default function ChatRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const translate = useTranslate();
  const locale = useLocale();
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
  const [connectionFailure, setConnectionFailure] = useState<Extract<RealtimeConversationResult, { ok: false }>['reason'] | null>(null);
  const [connectionGeneration, setConnectionGeneration] = useState(0);
  const [hasOlder, setHasOlder] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [visibleGeneration, setVisibleGeneration] = useState(0);
  const acknowledged = useRef<string | null>(null);
  const lastRendered = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onVisible = () => { if (!document.hidden) setVisibleGeneration((value) => value + 1); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  useEffect(() => {
    if (demoChat) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;

    void connectRealtimeConversation(id).then((result) => {
      if (!active) return;
      setIsConnecting(false);
      if (!result.ok) {
        setError(result.message);
        setConnectionFailure(result.reason);
        return;
      }

      setError('');
      setConnectionFailure(null);
      setSession(result.session);
      setHasOlder(result.session.model.hasMore);
      acknowledged.current = null;
      setMessages(
        result.session.model.messages.map((message) =>
          toDisplayMessage(message, result.session.model.currentUserId, locale),
        ),
      );
      // Read receipts are sent only after a visible render, below.
      unsubscribe = result.session.subscribe((message) => {
        if (!active) return;
        const displayMessage = toDisplayMessage(message, result.session.model.currentUserId, locale);
        setMessages((current) =>
          current.some((item) => item.id === displayMessage.id)
            ? current
            : [...current, displayMessage],
        );
        if (displayMessage.sender === 'other') {
          triggerNativeHaptic('selection');
          if (document.hidden) {
            showNativeLocalNotification(translate('새 거래 메시지'), displayMessage.text, `/chat/${id}`);
          }
        }
      }, (message) => { if (active) setError(message); }, () => {
        if (!active) return;
        setMessages([]);
        setSession(null);
        setConnectionFailure(null);
        setError(translate('로그인 계정이 변경됐어요. 채팅 목록에서 다시 열어 주세요.'));
      });
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [demoChat, id, connectionGeneration, locale, translate]);

  useEffect(() => {
    const latest = messages.at(-1)?.id ?? null;
    if (latest && latest !== lastRendered.current) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    lastRendered.current = latest;
  }, [messages]);

  useEffect(() => {
    if (!session || document.hidden) return;
    const latestInbound = [...messages].reverse().find((message) => message.sender === 'other');
    if (!latestInbound || acknowledged.current === latestInbound.id) return;
    acknowledged.current = latestInbound.id;
    void session.markRead(latestInbound.id).catch(() => {
      if (acknowledged.current === latestInbound.id) acknowledged.current = null;
      setError(translate('읽음 상태를 저장하지 못했어요.'));
    });
  }, [session, messages, visibleGeneration, translate]);

  const loadOlder = async () => {
    if (!session || isLoadingOlder) return;
    setIsLoadingOlder(true);
    try {
      const page = await session.loadOlder();
      setMessages((current) => [
        ...page.messages.map((message) => toDisplayMessage(message, session.model.currentUserId, locale)),
        ...current,
      ]);
      setHasOlder(page.hasMore);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : translate('이전 메시지를 불러오지 못했어요.'));
    } finally { setIsLoadingOlder(false); }
  };

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
            time: translate('방금'),
          },
        ]);
      } else if (session) {
        const message = await session.send(body);
        const displayMessage = toDisplayMessage(message, session.model.currentUserId, locale);
        setMessages((current) =>
          current.some((item) => item.id === displayMessage.id)
            ? current
            : [...current, displayMessage],
        );
      } else {
        setError(translate('채팅 연결이 완료된 뒤 다시 보내주세요.'));
        return;
      }
      setInputText('');
      triggerNativeHaptic('success');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : translate('메시지를 보내지 못했어요. 연결을 확인해 주세요.'));
      triggerNativeHaptic('error');
    } finally {
      setIsSending(false);
    }
  };

  const otherUserName = demoChat?.otherUser.name ?? session?.model.otherUserName ?? translate('거래 채팅');
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
      <MobileShell title={translate('채팅 연결 중')} showBack hideNav>
        <StatePanel role="status" icon={<LoaderCircle className="spin" size={28} />} description={translate('대화를 불러오고 있어요.')} />
      </MobileShell>
    );
  }

  if (!demoChat && !session) {
    return (
      <MobileShell title={translate('채팅을 열 수 없어요')} showBack hideNav>
        <StatePanel role="alert" description={translate(error) || translate('대화방이 없거나 접근할 수 없어요.')} actions={<>
          {connectionFailure === 'unauthenticated' ? <Link className="btn-primary" href="/auth">{translate('로그인하기')}</Link> :
            connectionFailure === 'request_failed' ? <button type="button" className="btn-outline" onClick={() => { setIsConnecting(true); setConnectionGeneration((value) => value + 1); }}>{translate('다시 시도')}</button> : null}
          <Link className="btn-primary" href="/chats">
            {translate('채팅 목록으로 돌아가기')}
          </Link>
        </>} />
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
              <span>{formatWon(listing.price, locale)}</span>
            </div>
            <ChevronRight size={16} />
          </Link>
        ) : null}

        <div className="chat-safety">
          <Shield size={14} />
          <span>{translate('앱 밖 결제 유도와 선입금 요청을 주의하세요.')}</span>
        </div>

        <div aria-live="polite" className="chat-message-list">
          {hasOlder ? <button type="button" className="btn-outline" disabled={isLoadingOlder} onClick={() => void loadOlder()}>
            {isLoadingOlder ? translate('이전 메시지를 불러오는 중…') : translate('이전 메시지 보기')}
          </button> : null}
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
            {translate(error)}
          </p>
        ) : null}
        <form className="chat-composer" onSubmit={(event) => void sendMessage(event)}>
          <label className="visually-hidden" htmlFor="chat-message">
            {translate('메시지')}
          </label>
          <input
            className="form-input"
            id="chat-message"
            maxLength={5000}
            onChange={(event) => setInputText(event.target.value)}
            placeholder={translate('메시지를 입력하세요')}
            value={inputText}
          />
          <button
            aria-label={translate('메시지 보내기')}
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
