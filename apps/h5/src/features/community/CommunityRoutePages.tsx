import { AuthorProfilePage, FollowersPage, FollowingPage, PatternDetailPage } from '../../patterns/H5PatternPages';
import { PageSkeleton } from '../../loading/H5LoadingStates';
import { toPatternListCard, type CommunityPost } from '../../community/communityData';
import { communityRouteBackTarget } from './communityRoute';
import type { CommunityDomainResult } from './useCommunityDomain';

type Navigate = (to: string) => void;

export function CommunityRoutePages({ screen, detailPost, detailLoading, domain, currentUserId, isLoggedIn, onLogin, onShare, onCopy, copyingProjectId, navigate, locationSearch, locationPath }: {
  screen: string;
  detailPost: CommunityPost | null;
  detailLoading: boolean;
  domain: CommunityDomainResult;
  currentUserId: string;
  isLoggedIn: boolean;
  onLogin: () => void;
  onShare: (postId: string) => void;
  onCopy: (postId: string) => void;
  copyingProjectId: string;
  navigate: Navigate;
  locationSearch: string;
  locationPath: string;
}) {
  if (screen === 'following' || screen === 'followers') {
    const following = screen === 'following';
    const users = following ? domain.followingUsers : domain.followersUsers;
    const loading = following ? domain.isFollowingLoading : domain.isFollowersLoading;
    const error = following ? domain.followingError : domain.followersError;
    const retry = following ? domain.loadFollowingUsers : domain.loadFollowersUsers;
    if (loading && users.length === 0) return <PageSkeleton kind="profile-list" label={following ? '正在加载关注列表' : '正在加载粉丝列表'} />;
    const openUser = (user: { id: string }) => navigate(`/community/users/${encodeURIComponent(user.id)}?from=${encodeURIComponent(locationPath + locationSearch)}`);
    const props = { users, loading, error, onBack: () => navigate('/profile'), onRetry: () => void retry(), onOpenUser: openUser };
    return following ? <FollowingPage {...props} /> : <FollowersPage {...props} />;
  }
  if (screen === 'author-profile') {
    const authorId = domain.authorProfile?.id || '';
    if (domain.isAuthorProfileLoading && !domain.authorProfile && domain.authorProfilePosts.length === 0) return <PageSkeleton kind="pattern-list" label="正在加载作者主页" />;
    return <AuthorProfilePage
      patterns={domain.authorProfilePosts}
      authorPattern={domain.authorProfilePosts[0]}
      authorProfile={domain.authorProfile ?? undefined}
      loading={domain.isAuthorProfileLoading}
      loadingMore={domain.isAuthorProfileLoadingMore}
      hasMore={domain.authorProfileHasMore}
      onLoadMore={() => authorId && domain.loadMoreAuthorProfile(authorId)}
      error={domain.authorProfileError}
      onRetry={() => authorId && void domain.loadAuthorProfile(authorId)}
      currentUserId={currentUserId}
      onBack={() => navigate(communityRouteBackTarget(locationSearch, '/discover'))}
      onOpen={(pattern) => navigate(`/community/posts/${encodeURIComponent(pattern.id)}?from=${encodeURIComponent(`${locationPath}${locationSearch}`)}`)}
      onFollow={() => authorId && void domain.toggleCommunityFollow(authorId, Boolean(domain.authorProfile?.isFollowing))}
    />;
  }
  if (screen !== 'pattern-detail') return null;
  if (!detailPost) return <PageSkeleton kind="pattern-detail" label={detailLoading ? '正在加载作品' : '作品不存在'} />;
  const pattern = toPatternListCard(detailPost);
  return <PatternDetailPage
    pattern={pattern}
    currentUserId={currentUserId}
    isLoggedIn={isLoggedIn}
    comments={domain.communityComments}
    isLoadingComments={domain.isCommunityCommentsLoading}
    onLoadComments={() => void domain.loadCommunityComments(pattern.id)}
    onOpenAuthor={() => {
      if (pattern.authorId) navigate(`/community/users/${encodeURIComponent(pattern.authorId)}?from=${encodeURIComponent(`${locationPath}${locationSearch}`)}`);
    }}
    onLike={() => void domain.likeCommunityPost(pattern.id)}
    onFollow={() => pattern.authorId && void domain.toggleCommunityFollow(pattern.authorId, Boolean(pattern.isFollowing))}
    onShare={() => onShare(pattern.id)}
    onCopyToRepository={() => onCopy(pattern.id)}
    copyingToRepository={copyingProjectId === pattern.id}
    onComment={(content) => void domain.addCommunityComment(pattern.id, content)}
    onReply={(commentId, content) => void domain.addCommunityComment(pattern.id, content, commentId)}
    onDeleteComment={(commentId) => void domain.deleteCommunityComment(pattern.id, commentId)}
    commentSubmitting={domain.commentSubmitting}
    commentReplyPendingId={domain.commentReplyPendingId}
    commentDeletePendingId={domain.commentDeletePendingId}
    onLogin={onLogin}
    onBack={() => navigate(communityRouteBackTarget(locationSearch, '/discover'))}
  />;
}
