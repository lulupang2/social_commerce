'use client';

import { useEffect, useState } from 'react';
import { listPosts, type CommunityPost } from '@/lib/community/client';

export function useCommunityPosts(): { posts: CommunityPost[]; loading: boolean; error: string; retry: () => void } {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    let active = true;
    void listPosts().then((result) => {
      if (!active) return;
      if (result.ok) { setPosts(result.data.items); setError(''); }
      else setError(result.message);
      setLoading(false);
    });
    return () => { active = false; };
  }, [generation]);
  return { posts, loading, error, retry: () => { setLoading(true); setGeneration((n) => n + 1); } };
}
