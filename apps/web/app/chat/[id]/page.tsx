'use client';

import React, { useState, use, useRef, useEffect } from 'react';
import Link from 'next/link';
import { MobileShell } from '@/components/layout/MobileShell';
import { SUMMER_CHAT_ROOMS, type MockChatMessage } from '@/lib/data/summer-mock-data';
import { Send, Image as ImageIcon, ChevronRight, Shield } from 'lucide-react';

export default function ChatRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const chat = SUMMER_CHAT_ROOMS.find((c) => c.id === resolvedParams.id) || SUMMER_CHAT_ROOMS[0];

  const [messages, setMessages] = useState<MockChatMessage[]>(chat.messages);
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const newMsg: MockChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'me',
      text: inputText.trim(),
      time: '방금',
    };

    setMessages((prev) => [...prev, newMsg]);
    setInputText('');
  };

  return (
    <MobileShell title={chat.otherUser.name} showBack hideNav>
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)' }}>
        {/* Product Header Bar */}
        <Link
          href={`/market/${chat.listingId}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
            textDecoration: 'none',
          }}
        >
          <img
            src={chat.listingImage}
            alt={chat.listingTitle}
            style={{ width: 42, height: 42, borderRadius: 6, objectFit: 'cover' }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: '0.84rem',
                fontWeight: 700,
                color: 'var(--text-main)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {chat.listingTitle}
            </div>
            <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--primary)' }}>
              {chat.listingPrice.toLocaleString()}원
            </div>
          </div>
          <ChevronRight size={16} color="var(--text-subtle)" />
        </Link>

        {/* Safety Warning */}
        <div
          style={{
            background: 'var(--primary-light)',
            padding: '8px 14px',
            fontSize: '0.74rem',
            color: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontWeight: 600,
          }}
        >
          <Shield size={14} />
          <span>안전한 거래를 위해 직거래 또는 안전결제를 이용해주세요.</span>
        </div>

        {/* Messages Scroll Area */}
        <div
          style={{
            flex: 1,
            padding: '16px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {messages.map((m) => {
            const isMe = m.sender === 'me';
            return (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isMe ? 'flex-end' : 'flex-start',
                }}
              >
                <div className={isMe ? 'chat-bubble-me' : 'chat-bubble-other'}>{m.text}</div>
                <span
                  style={{
                    fontSize: '0.7rem',
                    color: 'var(--text-subtle)',
                    marginTop: 3,
                    padding: '0 4px',
                  }}
                >
                  {m.time}
                </span>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Composer Form */}
        <form
          onSubmit={handleSend}
          style={{
            padding: '10px 14px calc(10px + env(safe-area-inset-bottom, 0px))',
            background: 'var(--surface)',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <button
            type="button"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 6,
              color: 'var(--text-muted)',
            }}
            aria-label="사진 전송"
          >
            <ImageIcon size={22} />
          </button>
          <input
            type="text"
            className="form-input"
            placeholder="메시지를 입력하세요..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            style={{ borderRadius: 'var(--radius-full)', padding: '10px 16px' }}
          />
          <button
            type="submit"
            className="btn-primary"
            style={{ width: 42, height: 42, padding: 0, borderRadius: '50%', flexShrink: 0 }}
            aria-label="전송"
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </MobileShell>
  );
}
