import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { insertCommentReply, removeCommentTree, sortCommunityPosts, toPatternListCard, type CommunityComment, type CommunityCommentsResponse, type CommunityNotification, type CommunityPost } from '../../community/communityData';
import type { AuthorProfile, FollowingUser, PatternListCard } from '../../shared/h5Types';

export type CommunityRequestApi = <T>(path: string, options?: RequestInit, token?: string | null) => Promise<T>;

export type CommunityDomainOptions = {
  activeTab: string;
  screen: string;
  routeAuthorId: string;
  /** A Router-owned identity for discarding async work after navigation. */
  routeScope?: string;
  authToken: string;
  requestApi: CommunityRequestApi;
  setStatus: (message: string) => void;
  requireLogin: (resume: (token: string) => void) => void;
  navigate: (to: string) => void;
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
    options?: { preserveOnError?: boolean; append?: boolean; page?: number },
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
  clearForLogout: () => void;
};

const COMMUNITY_PAGE_SIZE = 50;

export function useCommunityDomain({ activeTab, screen, routeAuthorId, routeScope = `${activeTab}:${screen}:${routeAuthorId}`, authToken, requestApi, setStatus, requireLogin, navigate, loadFollowingCount }: CommunityDomainOptions): CommunityDomainResult {
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
  const followingRequestSeqRef = useRef(0);
  const followersRequestSeqRef = useRef(0);
  const socialMutationSeqRef = useRef(0);
  const commentMutationSeqRef = useRef(0);
  const notificationOperationSeqRef = useRef(0);
  const operationScopeRef = useRef({ authToken, routeScope, generation: 0 });
  if (operationScopeRef.current.authToken !== authToken || operationScopeRef.current.routeScope !== routeScope) {
    operationScopeRef.current = { authToken, routeScope, generation: operationScopeRef.current.generation + 1 };
  }

  const captureOperationScope = () => ({ ...operationScopeRef.current });
  const isOperationCurrent = (operation: { authToken: string; routeScope: string; generation: number }) => (
    operationScopeRef.current.generation === operation.generation
    && operationScopeRef.current.authToken === operation.authToken
    && operationScopeRef.current.routeScope === operation.routeScope
  );

  useEffect(() => {
    const timer = globalThis.setTimeout(() => setDebouncedCommunityQuery(communityQuery), 300);
    return () => globalThis.clearTimeout(timer);
  }, [communityQuery]);

  const loadCommunityPosts = async (
    sort = communitySort,
    token = authToken,
    { preserveOnError = false, append = false, page: requestedPage = 1 } = {},
  ) => {
    const requestSeq = communityPostsRequestSeqRef.current + 1;
    communityPostsRequestSeqRef.current = requestSeq;
    const operation = captureOperationScope();
    if (append) setIsCommunityLoadingMore(true);
    else {
      setIsCommunityLoading(true);
      communityPageRef.current = Math.max(1, Math.floor(requestedPage) || 1);
      setCommunityHasMore(false);
    }

    try {
      const page = append ? communityPageRef.current + 1 : communityPageRef.current;
      const params = new URLSearchParams({ sort, page: String(page), pageSize: String(COMMUNITY_PAGE_SIZE) });
      if (activeTab === 'discover' && debouncedCommunityQuery.trim()) params.set('q', debouncedCommunityQuery.trim());
      if (activeTab === 'discover' && communitySelectedTags.length) params.set('tags', communitySelectedTags.join(','));
      const payload = await requestApi<{ posts: CommunityPost[]; tagCounts?: Array<{ tag: string; count: number }> }>(
        `/community/posts?${params.toString()}`,
        { headers: token ? { authorization: `Bearer ${token}` } : {} },
        token,
      );
      if (communityPostsRequestSeqRef.current !== requestSeq || !isOperationCurrent(operation) || operation.authToken !== token) return;
      setCommunityAvailableTags((payload.tagCounts || []).filter(({ count }) => count > 0).map(({ tag }) => tag));
      const posts = Array.isArray(payload.posts) ? payload.posts : [];
      setCommunityPosts((current) => {
        const next = append ? [...current, ...posts] : posts;
        return sort === 'hot' ? sortCommunityPosts(next) : next;
      });
      communityPageRef.current = page;
      setCommunityHasMore(posts.length === COMMUNITY_PAGE_SIZE);
    } catch (error) {
      if (communityPostsRequestSeqRef.current !== requestSeq || !isOperationCurrent(operation) || operation.authToken !== token) return;
      if (!append && !preserveOnError) setCommunityPosts([]);
      setStatus(error instanceof Error ? error.message : append ? '更多社区稿件读取失败' : '社区稿件读取失败');
    } finally {
      if (communityPostsRequestSeqRef.current === requestSeq && isOperationCurrent(operation) && operation.authToken === token) {
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
    const requestSeq = followingRequestSeqRef.current + 1;
    followingRequestSeqRef.current = requestSeq;
    const operation = captureOperationScope();
    setIsFollowingLoading(true);
    setFollowingError('');
    try {
      const payload = await requestApi<{ users: FollowingUser[] }>('/community/following', { headers: { authorization: `Bearer ${token}` } }, token);
      if (followingRequestSeqRef.current === requestSeq && isOperationCurrent(operation) && operation.authToken === token) setFollowingUsers(Array.isArray(payload.users) ? payload.users : []);
    } catch (error) {
      if (followingRequestSeqRef.current !== requestSeq || !isOperationCurrent(operation) || operation.authToken !== token) return;
      setFollowingUsers([]);
      setFollowingError(error instanceof Error ? error.message : '关注列表读取失败');
    } finally {
      if (followingRequestSeqRef.current === requestSeq && isOperationCurrent(operation) && operation.authToken === token) setIsFollowingLoading(false);
    }
  };

  const loadFollowersUsers = async (token = authToken) => {
    if (!token) return;
    const requestSeq = followersRequestSeqRef.current + 1;
    followersRequestSeqRef.current = requestSeq;
    const operation = captureOperationScope();
    setIsFollowersLoading(true);
    setFollowersError('');
    try {
      const payload = await requestApi<{ users: FollowingUser[] }>('/community/followers', { headers: { authorization: `Bearer ${token}` } }, token);
      if (followersRequestSeqRef.current === requestSeq && isOperationCurrent(operation) && operation.authToken === token) setFollowersUsers(Array.isArray(payload.users) ? payload.users : []);
    } catch (error) {
      if (followersRequestSeqRef.current !== requestSeq || !isOperationCurrent(operation) || operation.authToken !== token) return;
      setFollowersUsers([]);
      setFollowersError(error instanceof Error ? error.message : '粉丝列表读取失败');
    } finally {
      if (followersRequestSeqRef.current === requestSeq && isOperationCurrent(operation) && operation.authToken === token) setIsFollowersLoading(false);
    }
  };

  const loadAuthorProfile = async (authorId: string, token = authToken, page = 1, append = false) => {
    const requestSeq = authorProfileRequestSeqRef.current + 1;
    authorProfileRequestSeqRef.current = requestSeq;
    const operation = captureOperationScope();
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
      if (authorProfileRequestSeqRef.current !== requestSeq || !isOperationCurrent(operation) || operation.authToken !== token) return;
      setAuthorProfile(payload.profile);
      const posts = (Array.isArray(payload.posts) ? payload.posts : []).map(toPatternListCard);
      setAuthorProfilePosts((current) => append ? [...current, ...posts] : posts);
      authorProfilePageRef.current = page;
      setAuthorProfileHasMore(posts.length === 50);
    } catch (error) {
      if (authorProfileRequestSeqRef.current !== requestSeq || !isOperationCurrent(operation) || operation.authToken !== token) return;
      if (!append) {
        setAuthorProfile(null);
        setAuthorProfilePosts([]);
        setAuthorProfileError(error instanceof Error ? error.message : '作者主页读取失败');
      } else {
        setStatus(error instanceof Error ? error.message : '更多作品读取失败');
      }
    } finally {
      if (authorProfileRequestSeqRef.current === requestSeq && isOperationCurrent(operation) && operation.authToken === token) {
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

  const clearForLogout = () => {
    operationScopeRef.current = { ...operationScopeRef.current, generation: operationScopeRef.current.generation + 1 };
    communityPostsRequestSeqRef.current += 1;
    authorProfileRequestSeqRef.current += 1;
    communityCommentsRequestSeqRef.current += 1;
    notificationsRequestSeqRef.current += 1;
    followingRequestSeqRef.current += 1;
    followersRequestSeqRef.current += 1;
    socialMutationSeqRef.current += 1;
    commentMutationSeqRef.current += 1;
    notificationOperationSeqRef.current += 1;
    setCommunityPosts([]);
    setCommunityAvailableTags([]);
    setCommunityHasMore(false);
    setCommunityComments([]);
    setNotifications([]);
    setFollowingUsers([]);
    setFollowersUsers([]);
    setFollowingError('');
    setFollowersError('');
    setIsFollowingLoading(false);
    setIsFollowersLoading(false);
    setIsCommunityLoading(false);
    setIsCommunityLoadingMore(false);
    setIsCommunityCommentsLoading(false);
    setCommentSubmitting(false);
    setCommentReplyPendingId('');
    setCommentDeletePendingId('');
    resetAuthorProfile();
  };

  const loadCommunityComments = async (projectId: string) => {
    const requestSeq = communityCommentsRequestSeqRef.current + 1;
    communityCommentsRequestSeqRef.current = requestSeq;
    const operation = captureOperationScope();
    setCommunityComments([]);
    setIsCommunityCommentsLoading(true);
    try {
      const payload = await requestApi<CommunityCommentsResponse>(`/community/posts/${projectId}/comments`);
      if (communityCommentsRequestSeqRef.current === requestSeq && isOperationCurrent(operation)) setCommunityComments(payload.comments);
    } catch (error) {
      if (communityCommentsRequestSeqRef.current !== requestSeq || !isOperationCurrent(operation)) return;
      setCommunityComments([]);
      setStatus(error instanceof Error ? error.message : '评论读取失败');
    } finally {
      if (communityCommentsRequestSeqRef.current === requestSeq && isOperationCurrent(operation)) setIsCommunityCommentsLoading(false);
    }
  };

  const loadNotifications = async (token = authToken, { preserveOnError = false } = {}) => {
    if (!token) {
      if (!preserveOnError) setNotifications([]);
      return;
    }
    const requestSeq = notificationsRequestSeqRef.current + 1;
    notificationsRequestSeqRef.current = requestSeq;
    const operation = captureOperationScope();
    try {
      const payload = await requestApi<{ notifications: CommunityNotification[] }>('/notifications', { headers: { authorization: `Bearer ${token}` } }, token);
      if (notificationsRequestSeqRef.current === requestSeq && isOperationCurrent(operation) && operation.authToken === token) setNotifications(payload.notifications || []);
    } catch (error) {
      if (notificationsRequestSeqRef.current === requestSeq && isOperationCurrent(operation) && operation.authToken === token) setStatus(error instanceof Error ? error.message : '消息读取失败');
    }
  };

  const openNotification = async (notification: CommunityNotification) => {
    const operationSeq = notificationOperationSeqRef.current + 1;
    notificationOperationSeqRef.current = operationSeq;
    const operation = captureOperationScope();
    let opened = !notification.projectId;
    if (notification.projectId) {
      try {
        await requestApi<{ post: CommunityPost }>(`/community/posts/${notification.projectId}`);
        if (notificationOperationSeqRef.current !== operationSeq || !isOperationCurrent(operation)) return;
        navigate(`/community/posts/${encodeURIComponent(notification.projectId)}`);
        opened = true;
      } catch (error) {
        if (notificationOperationSeqRef.current === operationSeq && isOperationCurrent(operation)) setStatus(error instanceof Error ? error.message : '作品读取失败');
      }
    }
    if (opened && !notification.isRead && notificationOperationSeqRef.current === operationSeq && isOperationCurrent(operation)) {
      try {
        await requestApi(`/notifications/${notification.id}/read`, { method: 'PATCH' });
        if (notificationOperationSeqRef.current === operationSeq && isOperationCurrent(operation)) setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, isRead: true, readAt: new Date().toISOString() } : item));
      } catch (error) {
        if (notificationOperationSeqRef.current === operationSeq && isOperationCurrent(operation)) setStatus(error instanceof Error ? error.message : '消息状态更新失败');
      }
    }
  };

  const likeCommunityPost = async (projectId: string, token = authToken) => {
    if (!token) {
      requireLogin((nextToken) => void likeCommunityPost(projectId, nextToken));
      return;
    }
    const operationSeq = socialMutationSeqRef.current + 1; socialMutationSeqRef.current = operationSeq;
    const operation = captureOperationScope();
    try {
      const payload = await requestApi<{ likesCount: number }>(`/community/posts/${projectId}/like`, { method: 'POST', headers: { authorization: `Bearer ${token}` } }, token);
      if (socialMutationSeqRef.current === operationSeq && isOperationCurrent(operation) && operation.authToken === token) setCommunityPosts((posts) => posts.map((post) => post.id === projectId ? { ...post, likesCount: payload.likesCount, likedByMe: true } : post));
    } catch (error) {
      if (socialMutationSeqRef.current === operationSeq && isOperationCurrent(operation) && operation.authToken === token) setStatus(error instanceof Error ? error.message : '点赞失败');
    }
  };

  const toggleCommunityFollow = async (authorId: string, currentlyFollowing: boolean, token = authToken) => {
    if (!token) {
      requireLogin((nextToken) => void toggleCommunityFollow(authorId, currentlyFollowing, nextToken));
      return;
    }
    const operationSeq = socialMutationSeqRef.current + 1; socialMutationSeqRef.current = operationSeq;
    const operation = captureOperationScope();
    try {
      const payload = await requestApi<{ following: boolean; followingCount?: number; followersCount?: number }>(`/community/users/${authorId}/follow`, { method: currentlyFollowing ? 'DELETE' : 'POST', headers: { authorization: `Bearer ${token}` } }, token);
      if (socialMutationSeqRef.current !== operationSeq || !isOperationCurrent(operation) || operation.authToken !== token) return;
      setCommunityPosts((posts) => posts.map((post) => post.authorId === authorId ? { ...post, isFollowing: payload.following } : post));
      setAuthorProfilePosts((posts) => posts.map((post) => post.authorId === authorId ? { ...post, isFollowing: payload.following } : post));
      setAuthorProfile((profile) => profile?.id === authorId ? { ...profile, isFollowing: payload.following, followersCount: typeof payload.followersCount === 'number' ? payload.followersCount : profile.followersCount + (payload.following ? 1 : -1) } : profile);
      void loadFollowingCount(token);
    } catch (error) {
      if (socialMutationSeqRef.current === operationSeq && isOperationCurrent(operation) && operation.authToken === token) setStatus(error instanceof Error ? error.message : '关注操作失败');
    }
  };

  const addCommunityComment = async (projectId: string, content: string, parentId?: string, token = authToken) => {
    if (!token) {
      requireLogin((nextToken) => void addCommunityComment(projectId, content, parentId, nextToken));
      return;
    }
    const operationSeq = commentMutationSeqRef.current + 1;
    commentMutationSeqRef.current = operationSeq;
    const operation = captureOperationScope();
    if (parentId) setCommentReplyPendingId(parentId); else setCommentSubmitting(true);
    try {
      const payload = await requestApi<{ comment: CommunityComment }>(`/community/posts/${projectId}/comments`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ content, ...(parentId ? { parentId } : {}) }) }, token);
      if (commentMutationSeqRef.current !== operationSeq || !isOperationCurrent(operation) || operation.authToken !== token) return;
      setCommunityComments((comments) => parentId ? insertCommentReply(comments, payload.comment) : [{ ...payload.comment, replies: payload.comment.replies || [] }, ...comments]);
      setCommunityPosts((posts) => posts.map((post) => post.id === projectId ? { ...post, commentsCount: post.commentsCount + 1 } : post));
    } catch (error) {
      if (commentMutationSeqRef.current === operationSeq && isOperationCurrent(operation) && operation.authToken === token) setStatus(error instanceof Error ? error.message : '评论发布失败');
    } finally {
      if (commentMutationSeqRef.current === operationSeq && isOperationCurrent(operation) && operation.authToken === token) {
        if (parentId) setCommentReplyPendingId(''); else setCommentSubmitting(false);
      }
    }
  };

  const deleteCommunityComment = async (projectId: string, commentId: string, token = authToken) => {
    if (!token) {
      requireLogin((nextToken) => void deleteCommunityComment(projectId, commentId, nextToken));
      return;
    }
    const operationSeq = commentMutationSeqRef.current + 1;
    commentMutationSeqRef.current = operationSeq;
    const operation = captureOperationScope();
    setCommentDeletePendingId(commentId);
    try {
      const payload = await requestApi<{ deletedCount: number }>(`/community/posts/${projectId}/comments/${commentId}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } }, token);
      if (commentMutationSeqRef.current !== operationSeq || !isOperationCurrent(operation) || operation.authToken !== token) return;
      setCommunityComments((comments) => removeCommentTree(comments, commentId));
      setCommunityPosts((posts) => posts.map((post) => post.id === projectId ? { ...post, commentsCount: Math.max(0, post.commentsCount - payload.deletedCount) } : post));
    } catch (error) {
      if (commentMutationSeqRef.current === operationSeq && isOperationCurrent(operation) && operation.authToken === token) setStatus(error instanceof Error ? error.message : '评论删除失败');
    } finally {
      if (commentMutationSeqRef.current === operationSeq && isOperationCurrent(operation) && operation.authToken === token) setCommentDeletePendingId('');
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
    clearForLogout,
  };
}
