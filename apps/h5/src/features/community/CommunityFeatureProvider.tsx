import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppSelector } from '../../store/hooks';
import { selectAuthToken } from '../../store/auth/authSlice';
import { useScopedStatus } from '../../store/ui/useScopedStatus';
import { routeStateForPath } from '../../app/h5Routes';
import { useCommunityDomain, type CommunityDomainResult, type CommunityRequestApi } from './useCommunityDomain';
import { useCommunityDiscoveryRoute } from './useCommunityDiscoveryRoute';
import { useCommunityPostDetail } from './useCommunityPostDetail';

type CommunityFeatureContextValue = {
  domain: CommunityDomainResult;
  discovery: ReturnType<typeof useCommunityDiscoveryRoute>;
  detail: ReturnType<typeof useCommunityPostDetail>;
  actions: {
    requestLogin: () => void;
    sharePost: (postId: string) => void;
    copyPost: (postId: string) => void;
    copyingPostId: string;
  };
};

const CommunityFeatureContext = createContext<CommunityFeatureContextValue | null>(null);

export type CommunityFeatureCommands = {
  refreshDiscovery: (token?: string, preserveOnError?: boolean) => Promise<void>;
  refreshNotifications: (token?: string, preserveOnError?: boolean) => Promise<void>;
  clearForLogout: () => void;
};

export function CommunityFeatureProvider({ children, requestApi, requireLogin, loadFollowingCount, onCommands }: {
  children: ReactNode;
  requestApi: CommunityRequestApi;
  requireLogin: (resume: (token: string) => void) => void;
  loadFollowingCount: (token: string) => Promise<void>;
  onCommands?: (commands: CommunityFeatureCommands) => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const token = useAppSelector(selectAuthToken);
  const setStatus = useScopedStatus();
  const { screen, activeTab } = routeStateForPath(location.pathname);
  const authorId = location.pathname.match(/^\/community\/users\/([^/]+)/)?.[1] || '';
  const postId = location.pathname.match(/^\/community\/posts\/([^/]+)/)?.[1] || '';
  const domain = useCommunityDomain({
    activeTab,
    screen,
    routeAuthorId: authorId,
    routeScope: `${location.key}:${location.pathname}${location.search}`,
    authToken: token,
    requestApi,
    setStatus,
    requireLogin,
    navigate,
    loadFollowingCount,
  });
  const discovery = useCommunityDiscoveryRoute();
  const detail = useCommunityPostDetail({ postId: screen === 'pattern-detail' ? postId : '', requestApi, setStatus });
  const [copyingPostId, setCopyingPostId] = useState('');
  const sessionRef = useRef({ token, generation: 0 });
  if (sessionRef.current.token !== token) sessionRef.current = { token, generation: sessionRef.current.generation + 1 };
  const routeScope = `${location.key}:${location.pathname}${location.search}`;
  const copyOperationScopeRef = useRef({ token, routeScope, generation: 0 });
  if (copyOperationScopeRef.current.token !== token || copyOperationScopeRef.current.routeScope !== routeScope) {
    copyOperationScopeRef.current = { token, routeScope, generation: copyOperationScopeRef.current.generation + 1 };
  }
  const sharePost = useCallback((projectId: string) => {
    const share = () => {
      const shareUrl = `${window.location.origin}/community/posts/${encodeURIComponent(projectId)}`;
      const shareApi = navigator as Navigator & { share?: (data: { title: string; url: string }) => Promise<void>; clipboard?: { writeText: (value: string) => Promise<void> } };
      void (async () => {
        try {
          if (shareApi.share) await shareApi.share({ title: '拼豆图纸', url: shareUrl });
          else if (shareApi.clipboard) await shareApi.clipboard.writeText(shareUrl);
          else setStatus('当前浏览器不支持分享，请复制页面地址。');
        } catch (error) {
          if (!(error instanceof DOMException && error.name === 'AbortError')) setStatus(error instanceof Error ? error.message : '分享失败，请稍后重试。');
        }
      })();
    };
    if (!token) requireLogin(() => share()); else share();
  }, [requireLogin, setStatus, token]);
  const copyPost = useCallback((projectId: string) => {
    const copy = async (copyToken: string) => {
      if (copyingPostId) return;
      const generation = sessionRef.current.generation;
      const operation = { ...copyOperationScopeRef.current };
      const isOperationCurrent = () => (
        copyOperationScopeRef.current.generation === operation.generation
        && copyOperationScopeRef.current.token === operation.token
        && copyOperationScopeRef.current.routeScope === operation.routeScope
      );
      setCopyingPostId(projectId);
      try {
        await requestApi(`/projects/${encodeURIComponent(projectId)}/copy`, { method: 'POST', headers: { authorization: `Bearer ${copyToken}` } }, copyToken);
        if (sessionRef.current.generation !== generation || sessionRef.current.token !== copyToken || !isOperationCurrent() || operation.token !== copyToken) return;
        setStatus('已复制到仓库，可在我的作品中查看。');
        navigate('/projects');
      } catch (error) {
        if (sessionRef.current.generation === generation && sessionRef.current.token === copyToken && isOperationCurrent() && operation.token === copyToken) setStatus(error instanceof Error ? error.message : '复制到仓库失败，请稍后重试。');
      } finally {
        if (sessionRef.current.generation === generation && isOperationCurrent()) setCopyingPostId('');
      }
    };
    if (!token) requireLogin((nextToken) => { void copy(nextToken); }); else void copy(token);
  }, [copyingPostId, navigate, requireLogin, requestApi, setStatus, token]);
  useEffect(() => {
    if (activeTab !== 'discover') return;
    if (domain.communitySort !== discovery.value.sort) {
      domain.setCommunitySort(discovery.value.sort);
      return;
    }
    if (domain.communityQuery !== discovery.value.query) {
      domain.setCommunityQuery(discovery.value.query);
      return;
    }
    if (domain.communitySelectedTags.join(',') !== discovery.value.tags.join(',')) {
      domain.setCommunitySelectedTags(discovery.value.tags);
      return;
    }
    void domain.loadCommunityPosts(domain.communitySort, token, { page: discovery.value.page });
  // Keep the URL contract in the feature. The command functions are recreated
  // by the legacy domain hook, so they deliberately are not dependencies here.
  }, [activeTab, token, domain.communityQuery, domain.communitySelectedTags, domain.communitySort, domain.debouncedCommunityQuery, discovery.value]);
  useEffect(() => {
    onCommands?.({
      refreshDiscovery: async (nextToken = token, preserveOnError = false) => {
        await domain.loadCommunityPosts('hot', nextToken, { preserveOnError });
      },
      refreshNotifications: async (nextToken = token, preserveOnError = false) => {
        await domain.loadNotifications(nextToken, { preserveOnError });
      },
      clearForLogout: domain.clearForLogout,
    });
  }, [domain.clearForLogout, domain.loadCommunityPosts, domain.loadNotifications, onCommands, token]);
  useEffect(() => {
    if (token) return;
    setCopyingPostId('');
  }, [token]);
  return <CommunityFeatureContext.Provider value={{ domain, discovery, detail, actions: { requestLogin: () => requireLogin(() => undefined), sharePost, copyPost, copyingPostId } }}>{children}</CommunityFeatureContext.Provider>;
}

export function useCommunityFeature() {
  const value = useContext(CommunityFeatureContext);
  if (!value) throw new Error('CommunityFeatureProvider is required');
  return value;
}

export function useOptionalCommunityFeature() {
  return useContext(CommunityFeatureContext);
}
