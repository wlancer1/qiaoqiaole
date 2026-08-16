import { type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageSkeleton } from '../../loading/H5LoadingStates';
import { routeStateForPath } from '../../app/h5Routes';
import { useAppSelector } from '../../store/hooks';
import { selectAuthUserId, selectIsAuthenticated } from '../../store/auth/authSlice';
import { CommunityRoutePages } from './CommunityRoutePages';
import { useCommunityFeature } from './CommunityFeatureProvider';

type CommunityFeatureContentProps = {
  fallback: ReactNode;
};

/**
 * Owns the community route branches and the values inserted into the legacy
 * home shell while that shell is being decomposed. H5App supplies only
 * non-community services and its normal fallback page.
 */
export function CommunityFeatureContent({
  fallback,
}: CommunityFeatureContentProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { screen } = routeStateForPath(location.pathname);
  const currentUserId = useAppSelector(selectAuthUserId);
  const isLoggedIn = useAppSelector(selectIsAuthenticated);
  const { domain, detail, actions } = useCommunityFeature();

  if (screen === 'pattern-detail' || screen === 'author-profile' || screen === 'following' || screen === 'followers') {
    return <CommunityRoutePages
      screen={screen}
      detailPost={detail.post}
      detailLoading={detail.loading}
      domain={domain}
      currentUserId={currentUserId}
      isLoggedIn={isLoggedIn}
      onLogin={actions.requestLogin}
      onShare={actions.sharePost}
      onCopy={actions.copyPost}
      copyingProjectId={actions.copyingPostId}
      navigate={navigate}
      locationSearch={location.search}
      locationPath={location.pathname}
    />;
  }

  if (location.pathname.startsWith('/discover') && domain.isCommunityLoading && domain.communityPosts.length === 0) {
    return <PageSkeleton kind="pattern-list" label="正在加载发现作品" />;
  }

  return <>{fallback}</>;
}
