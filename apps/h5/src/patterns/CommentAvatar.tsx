import { UserAvatar } from '../shared/UserAvatar';

export function CommentAvatar({ avatarUrl }: { avatarUrl: string | null }) {
  return <UserAvatar avatarUrl={avatarUrl} className="detail-comment-avatar" imageClassName="detail-comment-avatar-image" fallbackDataAttribute="data-comment-avatar-fallback" />;
}
