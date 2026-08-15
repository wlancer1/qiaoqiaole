import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { insertCommentReply, removeCommentTree, sortCommunityPosts, toPatternListCard, type CommunityComment, type CommunityCommentsResponse, type CommunityNotification, type CommunityPost } from './communityData';
import type { AuthorProfile, FollowingUser, PatternListCard } from '../shared/h5Types';

export type CommunityRequestApi = <T>(path: string, options?: RequestInit, token?: string | null) => Promise<T>;

export type CommunityDomainOptions = {
  activeTab: string;
  screen: string;
  routeAuthorId: string;
  authToken: string;
  requestApi: CommunityRequestApi;
  setStatus: (message: string) => void;
  requireLogin: (resume: (token: string) => void) => void;
  navigate: (to: string) => void;
  setActivePattern: Dispatch<SetStateAction<PatternListCard | null>>;
  loadFollowingCount: (token: string) => Promise<void>;
};

export type CommunityDomainResult = {
  communityPosts: CommunityPost[];
  setCommunityPosts: Dispatch<SetStateAction<CommunityPost[]>>;
  authorProfile: AuthorProfile | null;
  setAuthorProfile: Dispatch<SetStateAction<AuthorProfile | null>>;
  authorProfilePosts: PatternListCard[];
  setAuthorProfilePosts: Dispatch<SetStateAction<PatternListCard[]>>;
  authorProfileError: string;
  setAuthorProfileError: Dispatch<SetStateAction<string>>;
  isAuthorProfileLoading: boolean;
  isAuthorProfileLoadingMore: boolean;
  authorProfileHasMore: boolean;
  setAuthorProfileHasMore: Dispatch<SetStateAction<boolean>>;
  followingUsers: FollowingUser[];
  setFollowingUsers: Dispatch<SetStateAction<FollowingUser[]>>;
  followersUsers: FollowingUser[];
  setFollowersUsers: Dispatch<SetStateAction<FollowingUser[]>>;
  isFollowingLoading: boolean;
  isFollowersLoading: boolean;
  followingError: string;
  followersError: string;
  communityComments: CommunityCommentsResponse['comments'];
  setCommunityComments: Dispatch<SetStateAction<CommunityCommentsResponse['comments']>>;
  notifications: CommunityNotification[];
  setNotifications: Dispatch<SetStateAction<CommunityNotification[]>>;
  isCommunityCommentsLoading: boolean;
  commentSubmitting: boolean;
  commentReplyPendingId: string;
  commentDeletePendingId: string;
  communityCards: PatternListCard[];
  homeTemplateCards: PatternListCard[];
  communityAvailableTags: string[];
  communityHasMore: boolean;
  isCommunityLoading: boolean;
  isCommunityLoadingMore: boolean;
  communitySort: 'hot' | 'latest';
  communityQuery: string;
  debouncedCommunityQuery: string;
  communitySelectedTags: string[];
  setCommunitySort: (sort: 'hot' | 'latest') => void;
  setCommunityQuery: (query: string) => void;
  setCommunitySelectedTags: (tags: string[]) => void;
  loadCommunityPosts: (
    sort?: 'hot' | 'latest',
    token?: string,
    options?: { preserveOnError?: boolean; append?: boolean },
  ) => Promise<void>;
  loadMoreCommunityPosts: () => Promise<void>;
  loadAuthorProfile: (authorId: string, token?: string, page?: number, append?: boolean) => Promise<void>;
  loadMoreAuthorProfile: (authorId: string) => void;
  loadFollowingUsers: (token?: string) => Promise<void>;
  loadFollowersUsers: (token?: string) => Promise<void>;
  resetAuthorProfile: () => void;
  loadCommunityComments: (projectId: string) => Promise<void>;
  loadNotifications: (token?: string, options?: { preserveOnError?: boolean }) => Promise<void>;
  openNotification: (notification: CommunityNotification) => Promise<void>;
  likeCommunityPost: (projectId: string, token?: string) => Promise<void>;
  toggleCommunityFollow: (authorId: string, currentlyFollowing: boolean, token?: string) => Promise<void>;
  addCommunityComment: (projectId: string, content: string, parentId?: string, token?: string) => Promise<void>;
  deleteCommunityComment: (projectId: string, commentId: string, token?: string) => Promise<void>;
};

const COMMUNITY_PAGE_SIZE = 50;

export function useCommunityDomain({ activeTab, screen, routeAuthorId, authToken, requestApi, setStatus, requireLogin, navigate, setActivePattern, loadFollowingCount }: CommunityDomainOptions): CommunityDomainResult {
  const [communityPosts, setCommunityPosts] = useState<CommunityPost[]>([]);
  const [communityAvailableTags, setCommunityAvailableTags] = useState<string[]>([]);
  const [isCommunityLoading, setIsCommunityLoading] = useState(false);
  const [isCommunityLoadingMore, setIsCommunityLoadingMore] = useState(false);
  const [communityHasMore, setCommunityHasMore] = useState(false);
  const [communitySort, setCommunitySort] = useState<'hot' | 'latest'>('hot');
  const [communityQuery, setCommunityQuery] = useState('');
  const [debouncedCommunityQuery, setDebouncedCommunityQuery] = useState('');
  const [communitySelectedTags, setCommunitySelectedTags] = useState<string[]>([]);
  const [authorProfile, setAuthorProfile] = useState<AuthorProfile | null>(null);
  const [authorProfilePosts, setAuthorProfilePosts] = useState<PatternListCard[]>([]);
  const [authorProfileError, setAuthorProfileError] = useState('');
  const [isAuthorProfileLoading, setIsAuthorProfileLoading] = useState(false);
  const [isAuthorProfileLoadingMore, setIsAuthorProfileLoadingMore] = useState(false);
  const [authorProfileHasMore, setAuthorProfileHasMore] = useState(false);
  const [followingUsers, setFollowingUsers] = useState<FollowingUser[]>([]);
  const [followersUsers, setFollowersUsers] = useState<FollowingUser[]>([]);
  const [isFollowingLoading, setIsFollowingLoading] = useState(false);
  const [isFollowersLoading, setIsFollowersLoading] = useState(false);
  const [followingError, setFollowingError] = useState('');
  const [followersError, setFollowersError] = useState('');
  const [communityComments, setCommunityComments] = useState<CommunityCommentsResponse['comments']>([]);
  const [notifications, setNotifications] = useState<CommunityNotification[]>([]);
  const [isCommunityCommentsLoading, setIsCommunityCommentsLoading] = useState(false);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentReplyPendingId, setCommentReplyPendingId] = useState('');
  const [commentDeletePendingId, setCommentDeletePendingId] = useState('');
  const communityPostsRequestSeqRef = useRef(0);
  const communityPageRef = useRef(1);
  const authorProfilePageRef = useRef(1);
  const authorProfileRequestSeqRef = useRef(0);
  const communityCommentsRequestSeqRef = useRef(0);
  const notificationsRequestSeqRef = useRef(0);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => setDebouncedCommunityQuery(communityQuery), 300);
    return () => globalThis.clearTimeout(timer);
  }, [communityQuery]);

  const loadCommunityPosts = async (
    sort = communitySort,
    token = authToken,
    { preserveOnError = false, append = false } = {},
  ) => {
    const requestSeq = communityPostsRequestSeqRef.current + 1;
    communityPostsRequestSeqRef.current = requestSeq;
    if (append) setIsCommunityLoadingMore(true);
    else {
      setIsCommunityLoading(true);
      communityPageRef.current = 1;
      setCommunityHasMore(false);
    }

    try {
      const page = append ? communityPageRef.current + 1 : 1;
      const params = new URLSearchParams({ sort, page: String(page), pageSize: String(COMMUNITY_PAGE_SIZE) });
      if (activeTab === 'discover' && debouncedCommunityQuery.trim()) params.set('q', debouncedCommunityQuery.trim());
      if (activeTab === 'discover' && communitySelectedTags.length) params.set('tags', communitySelectedTags.join(','));
      const payload = await requestApi<{ posts: CommunityPost[]; tagCounts?: Array<{ tag: string; count: number }> }>(
        `/community/posts?${params.toString()}`,
        { headers: token ? { authorization: `Bearer ${token}` } : {} },
        token,
      );
      if (communityPostsRequestSeqRef.current !== requestSeq) return;
      setCommunityAvailableTags((payload.tagCounts || []).filter(({ count }) => count > 0).map(({ tag }) => tag));
      const posts = Array.isArray(payload.posts) ? payload.posts : [];
      setCommunityPosts((current) => {
        const next = append ? [...current, ...posts] : posts;
        return sort === 'hot' ? sortCommunityPosts(next) : next;
      });
      communityPageRef.current = page;
      setCommunityHasMore(posts.length === COMMUNITY_PAGE_SIZE);
    } catch (error) {
      if (communityPostsRequestSeqRef.current !== requestSeq) return;
      if (!append && !preserveOnError) setCommunityPosts([]);
      setStatus(error instanceof Error ? error.message : append ? '更多社区稿件读取失败' : '社区稿件读取失败');
    } finally {
      if (communityPostsRequestSeqRef.current === requestSeq) {
        if (append) setIsCommunityLoadingMore(false);
        else setIsCommunityLoading(false);
      }
    }
  };

  const loadMoreCommunityPosts = async () => {
    if (isCommunityLoadingMore || !communityHasMore) return;
    await loadCommunityPosts(communitySort, authToken, { append: true });
  };

  const loadFollowingUsers = async (token = authToken) => {
    if (!token) return;
    setIsFollowingLoading(true);
    setFollowingError('');
    try {
      const payload = await requestApi<{ users: FollowingUser[] }>('/community/following', { headers: { authorization: `Bearer ${token}` } }, token);
      setFollowingUsers(Array.isArray(payload.users) ? payload.users : []);
    } catch (error) {
      setFollowingUsers([]);
      setFollowingError(error instanceof Error ? error.message : '关注列表读取失败');
    } finally {
      setIsFollowingLoading(false);
    }
  };

  const loadFollowersUsers = async (token = authToken) => {
    if (!token) return;
    setIsFollowersLoading(true);
    setFollowersError('');
    try {
      const payload = await requestApi<{ users: FollowingUser[] }>('/community/followers', { headers: { authorization: `Bearer ${token}` } }, token);
      setFollowersUsers(Array.isArray(payload.users) ? payload.users : []);
    } catch (error) {
      setFollowersUsers([]);
      setFollowersError(error instanceof Error ? error.message : '粉丝列表读取失败');
    } finally {
      setIsFollowersLoading(false);
    }
  };

  const loadAuthorProfile = async (authorId: string, token = authToken, page = 1, append = false) => {
    const requestSeq = authorProfileRequestSeqRef.current + 1;
    authorProfileRequestSeqRef.current = requestSeq;
    if (append) setIsAuthorProfileLoadingMore(true);
    else {
      setIsAuthorProfileLoading(true);
      setAuthorProfileError('');
      authorProfilePageRef.current = 1;
      setAuthorProfileHasMore(false);
    }
    try {
      const payload = await requestApi<{ profile: AuthorProfile; posts: CommunityPost[] }>(
        `/community/users/${encodeURIComponent(authorId)}/profile?page=${page}&pageSize=50`,
        { headers: token ? { authorization: `Bearer ${token}` } : {} },
        token || null,
      );
      if (authorProfileRequestSeqRef.current !== requestSeq) return;
      setAuthorProfile(payload.profile);
      const posts = (Array.isArray(payload.posts) ? payload.posts : []).map(toPatternListCard);
      setAuthorProfilePosts((current) => append ? [...current, ...posts] : posts);
      authorProfilePageRef.current = page;
      setAuthorProfileHasMore(posts.length === 50);
    } catch (error) {
      if (authorProfileRequestSeqRef.current !== requestSeq) return;
      if (!append) {
        setAuthorProfile(null);
        setAuthorProfilePosts([]);
        setAuthorProfileError(error instanceof Error ? error.message : '作者主页读取失败');
      } else {
        setStatus(error instanceof Error ? error.message : '更多作品读取失败');
      }
    } finally {
      if (authorProfileRequestSeqRef.current === requestSeq) {
        if (append) setIsAuthorProfileLoadingMore(false);
        else setIsAuthorProfileLoading(false);
      }
    }
  };

  const loadMoreAuthorProfile = (authorId: string) => {
    if (isAuthorProfileLoadingMore || !authorProfileHasMore) return;
    void loadAuthorProfile(authorId, authToken, authorProfilePageRef.current + 1, true);
  };

  const resetAuthorProfile = () => {
    authorProfileRequestSeqRef.current += 1;
    setAuthorProfile(null);
    setAuthorProfilePosts([]);
    setAuthorProfileError('');
    setAuthorProfileHasMore(false);
  };

  const loadCommunityComments = async (projectId: string) => {
    const requestSeq = communityCommentsRequestSeqRef.current + 1;
    communityCommentsRequestSeqRef.current = requestSeq;
    setCommunityComments([]);
    setIsCommunityCommentsLoading(true);
    try {
      const payload = await requestApi<CommunityCommentsResponse>(`/community/posts/${projectId}/comments`);
      if (communityCommentsRequestSeqRef.current === requestSeq) setCommunityComments(payload.comments);
    } catch (error) {
      if (communityCommentsRequestSeqRef.current !== requestSeq) return;
      setCommunityComments([]);
      setStatus(error instanceof Error ? error.message : '评论读取失败');
    } finally {
      if (communityCommentsRequestSeqRef.current === requestSeq) setIsCommunityCommentsLoading(false);
    }
  };

  const loadNotifications = async (token = authToken, { preserveOnError = false } = {}) => {
    if (!token) {
      if (!preserveOnError) setNotifications([]);
      return;
    }
    const requestSeq = notificationsRequestSeqRef.current + 1;
    notificationsRequestSeqRef.current = requestSeq;
    try {
      const payload = await requestApi<{ notifications: CommunityNotification[] }>('/notifications', { headers: { authorization: `Bearer ${token}` } }, token);
      if (notificationsRequestSeqRef.current === requestSeq) setNotifications(payload.notifications || []);
    } catch (error) {
      if (notificationsRequestSeqRef.current === requestSeq) setStatus(error instanceof Error ? error.message : '消息读取失败');
    }
  };

  const openNotification = async (notification: CommunityNotification) => {
    let opened = !notification.projectId;
    if (notification.projectId) {
      try {
        const payload = await requestApi<{ post: CommunityPost }>(`/community/posts/${notification.projectId}`);
        setActivePattern(toPatternListCard(payload.post));
        navigate(`/community/posts/${encodeURIComponent(notification.projectId)}`);
        opened = true;
      } catch (error) {
        setStatus(error instanceof Error ? error.message : '作品读取失败');
      }
    }
    if (opened && !notification.isRead) {
      try {
        await requestApi(`/notifications/${notification.id}/read`, { method: 'PATCH' });
        setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, isRead: true, readAt: new Date().toISOString() } : item));
      } catch (error) {
        setStatus(error instanceof Error ? error.message : '消息状态更新失败');
      }
    }
  };

  const likeCommunityPost = async (projectId: string, token = authToken) => {
    if (!token) {
      requireLogin((nextToken) => void likeCommunityPost(projectId, nextToken));
      return;
    }
    try {
      const payload = await requestApi<{ likesCount: number }>(`/community/posts/${projectId}/like`, { method: 'POST', headers: { authorization: `Bearer ${token}` } }, token);
      setCommunityPosts((posts) => posts.map((post) => post.id === projectId ? { ...post, likesCount: payload.likesCount, likedByMe: true } : post));
      setActivePattern((pattern) => pattern?.id === projectId ? { ...pattern, likes: String(payload.likesCount), likesCount: payload.likesCount, likedByMe: true } : pattern);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '点赞失败');
    }
  };

  const toggleCommunityFollow = async (authorId: string, currentlyFollowing: boolean, token = authToken) => {
    if (!token) {
      requireLogin((nextToken) => void toggleCommunityFollow(authorId, currentlyFollowing, nextToken));
      return;
    }
    try {
      const payload = await requestApi<{ following: boolean; followingCount?: number; followersCount?: number }>(`/community/users/${authorId}/follow`, { method: currentlyFollowing ? 'DELETE' : 'POST', headers: { authorization: `Bearer ${token}` } }, token);
      setCommunityPosts((posts) => posts.map((post) => post.authorId === authorId ? { ...post, isFollowing: payload.following } : post));
      setAuthorProfilePosts((posts) => posts.map((post) => post.authorId === authorId ? { ...post, isFollowing: payload.following } : post));
      setActivePattern((pattern) => pattern?.authorId === authorId ? { ...pattern, isFollowing: payload.following } : pattern);
      setAuthorProfile((profile) => profile?.id === authorId ? { ...profile, isFollowing: payload.following, followersCount: typeof payload.followersCount === 'number' ? payload.followersCount : profile.followersCount + (payload.following ? 1 : -1) } : profile);
      void loadFollowingCount(token);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '关注操作失败');
    }
  };

  const addCommunityComment = async (projectId: string, content: string, parentId?: string, token = authToken) => {
    if (!token) {
      requireLogin((nextToken) => void addCommunityComment(projectId, content, parentId, nextToken));
      return;
    }
    if (parentId) setCommentReplyPendingId(parentId); else setCommentSubmitting(true);
    try {
      const payload = await requestApi<{ comment: CommunityComment }>(`/community/posts/${projectId}/comments`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ content, ...(parentId ? { parentId } : {}) }) }, token);
      setCommunityComments((comments) => parentId ? insertCommentReply(comments, payload.comment) : [{ ...payload.comment, replies: payload.comment.replies || [] }, ...comments]);
      setCommunityPosts((posts) => posts.map((post) => post.id === projectId ? { ...post, commentsCount: post.commentsCount + 1 } : post));
      setActivePattern((pattern) => pattern?.id === projectId ? { ...pattern, comments: String(pattern.commentsCount + 1), commentsCount: pattern.commentsCount + 1 } : pattern);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '评论发布失败');
    } finally {
      if (parentId) setCommentReplyPendingId(''); else setCommentSubmitting(false);
    }
  };

  const deleteCommunityComment = async (projectId: string, commentId: string, token = authToken) => {
    if (!token) {
      requireLogin((nextToken) => void deleteCommunityComment(projectId, commentId, nextToken));
      return;
    }
    setCommentDeletePendingId(commentId);
    try {
      const payload = await requestApi<{ deletedCount: number }>(`/community/posts/${projectId}/comments/${commentId}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } }, token);
      setCommunityComments((comments) => removeCommentTree(comments, commentId));
      setCommunityPosts((posts) => posts.map((post) => post.id === projectId ? { ...post, commentsCount: Math.max(0, post.commentsCount - payload.deletedCount) } : post));
      setActivePattern((pattern) => pattern?.id === projectId ? { ...pattern, comments: String(Math.max(0, pattern.commentsCount - payload.deletedCount)), commentsCount: Math.max(0, pattern.commentsCount - payload.deletedCount) } : pattern);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '评论删除失败');
    } finally {
      setCommentDeletePendingId('');
    }
  };

  useEffect(() => {
    if (screen === 'author-profile' && routeAuthorId && authorProfile?.id !== routeAuthorId) {
      void loadAuthorProfile(decodeURIComponent(routeAuthorId));
    }
  }, [authorProfile?.id, routeAuthorId, screen]);

  useEffect(() => {
    if (screen === 'following' && authToken) void loadFollowingUsers(authToken);
    if (screen === 'followers' && authToken) void loadFollowersUsers(authToken);
  }, [screen, authToken]);

  const communityCards = useMemo(() => communityPosts.map(toPatternListCard), [communityPosts]);
  const homeTemplateCards = useMemo(() => communityCards.slice(0, 3), [communityCards]);

  return {
    communityPosts,
    setCommunityPosts,
    authorProfile,
    setAuthorProfile,
    authorProfilePosts,
    setAuthorProfilePosts,
    authorProfileError,
    setAuthorProfileError,
    isAuthorProfileLoading,
    isAuthorProfileLoadingMore,
    authorProfileHasMore,
    setAuthorProfileHasMore,
    followingUsers,
    setFollowingUsers,
    followersUsers,
    setFollowersUsers,
    isFollowingLoading,
    isFollowersLoading,
    followingError,
    followersError,
    communityComments,
    setCommunityComments,
    notifications,
    setNotifications,
    isCommunityCommentsLoading,
    commentSubmitting,
    commentReplyPendingId,
    commentDeletePendingId,
    communityCards,
    homeTemplateCards,
    communityAvailableTags,
    communityHasMore,
    isCommunityLoading,
    isCommunityLoadingMore,
    communitySort,
    communityQuery,
    debouncedCommunityQuery,
    communitySelectedTags,
    setCommunitySort,
    setCommunityQuery,
    setCommunitySelectedTags,
    loadCommunityPosts,
    loadMoreCommunityPosts,
    loadAuthorProfile,
    loadMoreAuthorProfile,
    loadFollowingUsers,
    loadFollowersUsers,
    resetAuthorProfile,
    loadCommunityComments,
    loadNotifications,
    openNotification,
    likeCommunityPost,
    toggleCommunityFollow,
    addCommunityComment,
    deleteCommunityComment,
  };
}
