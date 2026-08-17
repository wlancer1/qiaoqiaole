import { useEffect, useRef, useState } from 'react';
import type { CommunityPost } from '../../community/communityData';
import type { CommunityLikeResult, CommunityRequestApi } from './useCommunityDomain';

export function useCommunityPostDetail({ postId, requestApi, setStatus }: {
  postId: string;
  requestApi: CommunityRequestApi;
  setStatus: (message: string) => void;
}) {
  const [post, setPost] = useState<CommunityPost | null>(null);
  const [loading, setLoading] = useState(Boolean(postId));
  const requestSequence = useRef(0);
  const requestApiRef = useRef(requestApi);
  const setStatusRef = useRef(setStatus);
  requestApiRef.current = requestApi;
  setStatusRef.current = setStatus;

  useEffect(() => {
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    if (!postId) {
      setPost(null);
      setLoading(false);
      return;
    }
    setPost(null);
    setLoading(true);
    void requestApiRef.current<{ post: CommunityPost }>(`/community/posts/${encodeURIComponent(postId)}`)
      .then((payload) => {
        if (requestSequence.current === sequence) setPost(payload.post);
      })
      .catch((error) => {
        if (requestSequence.current === sequence) setStatusRef.current(error instanceof Error ? error.message : '作品读取失败');
      })
      .finally(() => {
        if (requestSequence.current === sequence) setLoading(false);
      });
    return () => { requestSequence.current += 1; };
  }, [postId]);

  const setLikeState = (projectId: string, result: CommunityLikeResult) => {
    setPost((current) => current?.id === projectId ? { ...current, likesCount: result.likesCount, likedByMe: result.liked } : current);
  };

  return { post, loading, setLikeState };
}
