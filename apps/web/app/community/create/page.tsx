'use client';

import type { CommunityPostType } from '@icegear/domain';
import { CheckCircle2, LoaderCircle, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { useState } from 'react';

import { MobileShell } from '@/components/layout/MobileShell';
import { saveLocalPost } from '@/lib/data/local-store';
import { SUMMER_COMMUNITY_POSTS, type MockCommunityPost } from '@/lib/data/summer-mock-data';
import { triggerNativeHaptic } from '@/lib/native-bridge';
import { createCommunityPost } from '@/lib/supabase/mutations';

type Sport = 'surf' | 'tennis';
type EditorCategory = 'tip' | 'review' | 'meetup' | 'discussion';

const POST_TYPE_BY_CATEGORY: Record<EditorCategory, CommunityPostType> = {
  tip: 'guide',
  review: 'review',
  meetup: 'meetup',
  discussion: 'discussion',
};

const CATEGORY_LABELS: Record<EditorCategory, string> = {
  tip: '스포츠 꿀팁 / 노하우',
  review: '장비 사용기 / 시타기',
  meetup: '세션 / 카풀 / 모임 모집',
  discussion: '자유 수다 / Q&A',
};

export default function CommunityCreatePage() {
  const router = useRouter();
  const [sport, setSport] = useState<Sport>('surf');
  const [category, setCategory] = useState<EditorCategory>('tip');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [completion, setCompletion] = useState<'supabase' | 'local' | null>(null);

  const saveDemoPost = () => {
    const fallback =
      SUMMER_COMMUNITY_POSTS.find((post) => post.sport === sport) ?? SUMMER_COMMUNITY_POSTS[0];
    const post: MockCommunityPost = {
      id: `local-post-${Date.now()}`,
      sport,
      sportLabel: sport === 'surf' ? '서핑' : '테니스',
      category,
      categoryLabel: CATEGORY_LABELS[category],
      title: title.trim(),
      content: content.trim(),
      author: {
        name: '나 (기기 데모)',
        avatar: fallback.author.avatar,
        level: sport === 'surf' ? '서핑 크루' : '테니스 크루',
      },
      likes: 0,
      comments: 0,
      createdAt: '방금 전',
    };
    return saveLocalPost(post);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (title.trim().length < 4) {
      setError('제목을 4자 이상 입력해 주세요.');
      triggerNativeHaptic('error');
      return;
    }
    if (content.trim().length < 10) {
      setError('다른 크루가 이해할 수 있도록 내용을 10자 이상 입력해 주세요.');
      triggerNativeHaptic('error');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createCommunityPost({
        sport,
        type: POST_TYPE_BY_CATEGORY[category],
        title: title.trim(),
        body: content.trim(),
      });
      if (result.ok) {
        setCompletion('supabase');
        triggerNativeHaptic('success');
        return;
      }
      if (result.reason === 'unconfigured' || result.reason === 'unavailable') {
        if (!saveDemoPost()) {
          setError('브라우저 저장 공간이 부족해 데모 게시글을 저장하지 못했어요.');
          triggerNativeHaptic('error');
          return;
        }
        setCompletion('local');
        triggerNativeHaptic('success');
        return;
      }
      if (result.reason === 'unauthenticated') {
        setError('실제 커뮤니티 글 등록은 로그인이 필요해요. 로그인 후 다시 시도해 주세요.');
      } else {
        setError(result.message);
      }
      triggerNativeHaptic('error');
    } catch {
      setError('게시글을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
      triggerNativeHaptic('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (completion) {
    return (
      <MobileShell title="게시글 등록 완료" hideNav>
        <div className="completion-state">
          <div className="completion-icon">
            <CheckCircle2 size={44} />
          </div>
          <p className="completion-kicker">
            {completion === 'supabase' ? '검토 대기 중' : '기기 데모 저장 완료'}
          </p>
          <h1>이야기를 저장했어요</h1>
          <p>
            {completion === 'supabase'
              ? '운영자 검토가 끝나면 라운지에 공개돼요.'
              : '이 브라우저의 커뮤니티에서 바로 확인할 수 있어요.'}
          </p>
          <button className="btn-primary" onClick={() => router.push('/community')} type="button">
            커뮤니티로 이동
          </button>
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell title="라운지 글쓰기" showBack hideNav>
      <form onSubmit={(event) => void handleSubmit(event)}>
        <div className="sell-form-content">
          <div className="form-group">
            <span className="form-label">스포츠 라운지</span>
            <div className="segmented-control" role="group" aria-label="스포츠 라운지">
              <button
                aria-pressed={sport === 'surf'}
                className={sport === 'surf' ? 'active' : ''}
                onClick={() => setSport('surf')}
                type="button"
              >
                🏄‍♂️ 서핑
              </button>
              <button
                aria-pressed={sport === 'tennis'}
                className={sport === 'tennis' ? 'active' : ''}
                onClick={() => setSport('tennis')}
                type="button"
              >
                🎾 테니스
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="post-category">
              주제
            </label>
            <select
              className="form-select"
              id="post-category"
              onChange={(event) => setCategory(event.target.value as EditorCategory)}
              value={category}
            >
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="post-title">
              제목
            </label>
            <input
              className="form-input"
              id="post-title"
              maxLength={160}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="무엇을 나누고 싶나요?"
              value={title}
            />
            <div className="field-counter">{title.length}/160</div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="post-content">
              내용
            </label>
            <textarea
              className="form-textarea"
              id="post-content"
              maxLength={10000}
              onChange={(event) => setContent(event.target.value)}
              placeholder="장비 후기, 세션 정보, 모임 시간처럼 크루에게 필요한 내용을 구체적으로 적어주세요."
              rows={9}
              value={content}
            />
            <div className="field-counter">{content.length.toLocaleString()}/10,000</div>
          </div>

          {error ? (
            <p className="form-error form-submit-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="sticky-bottom-action">
          <button className="btn-primary" disabled={isSubmitting} type="submit">
            {isSubmitting ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}
            <span>{isSubmitting ? '저장 중' : '게시글 검토 요청'}</span>
          </button>
        </div>
      </form>
    </MobileShell>
  );
}
