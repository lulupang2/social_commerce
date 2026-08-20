'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MobileShell } from '@/components/layout/MobileShell';
import { Camera, Send, Waves, Trophy } from 'lucide-react';

export default function CommunityCreatePage() {
  const router = useRouter();
  const [sport, setSport] = useState<'surf' | 'tennis'>('surf');
  const [category, setCategory] = useState<'tip' | 'review' | 'meetup' | 'discussion'>('tip');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    alert('게시글이 등록되었습니다!');
    router.push('/community');
  };

  return (
    <MobileShell title="라운지 글쓰기" showBack hideNav>
      <form onSubmit={handleSubmit} style={{ padding: '16px 16px 80px' }}>
        {/* Sport Selection */}
        <div className="form-group">
          <label className="form-label">스포츠 라운지 선택</label>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={() => setSport('surf')}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: 'var(--radius-sm)',
                border: sport === 'surf' ? '2px solid var(--primary)' : '1px solid var(--border)',
                background: sport === 'surf' ? 'var(--primary-light)' : 'var(--surface)',
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: 'pointer',
              }}
            >
              🏄‍♂️ 서핑 (Surf)
            </button>
            <button
              type="button"
              onClick={() => setSport('tennis')}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: 'var(--radius-sm)',
                border: sport === 'tennis' ? '2px solid var(--primary)' : '1px solid var(--border)',
                background: sport === 'tennis' ? 'var(--primary-light)' : 'var(--surface)',
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: 'pointer',
              }}
            >
              🎾 테니스 (Tennis)
            </button>
          </div>
        </div>

        {/* Category */}
        <div className="form-group">
          <label className="form-label">주제 카테고리</label>
          <select
            className="form-select"
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as 'tip' | 'review' | 'meetup' | 'discussion')
            }
          >
            <option value="tip">스포츠 꿀팁 / 노하우</option>
            <option value="review">장비 사용기 / 시타기</option>
            <option value="meetup">세션 / 카풀 / 모임 모집</option>
            <option value="discussion">자유 수다 / Q&A</option>
          </select>
        </div>

        {/* Title */}
        <div className="form-group">
          <label className="form-label">제목</label>
          <input
            type="text"
            className="form-input"
            placeholder="제목을 입력해주세요"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        {/* Content */}
        <div className="form-group">
          <label className="form-label">내용</label>
          <textarea
            className="form-textarea"
            rows={8}
            placeholder="하계 스포츠인들과 나누고 싶은 이야기, 장비 후기, 모임 소식을 자유롭게 공유해보세요."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
          />
        </div>

        {/* Photo Upload Placeholder */}
        <div className="form-group">
          <div
            style={{
              border: '2px dashed var(--border-strong)',
              borderRadius: 'var(--radius-sm)',
              padding: '16px',
              textAlign: 'center',
              cursor: 'pointer',
            }}
          >
            <Camera size={22} color="var(--text-muted)" style={{ marginBottom: 4 }} />
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              사진 첨부하기 (선택)
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="sticky-bottom-action">
          <button type="submit" className="btn-primary">
            <Send size={18} />
            <span>게시글 등록하기</span>
          </button>
        </div>
      </form>
    </MobileShell>
  );
}
