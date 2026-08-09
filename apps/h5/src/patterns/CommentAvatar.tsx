import { UserRound } from 'lucide-react';
import { useState } from 'react';

export function CommentAvatar({ avatarUrl }: { avatarUrl: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const normalizedUrl = avatarUrl?.trim() ?? '';
  const showImage = Boolean(normalizedUrl) && failedUrl !== normalizedUrl;

  return (
    <span className="detail-comment-avatar">
      {showImage ? (
        <img
          className="detail-comment-avatar-image"
          src={normalizedUrl}
          alt=""
          onError={() => setFailedUrl(normalizedUrl)}
        />
      ) : (
        <UserRound data-comment-avatar-fallback="true" aria-hidden="true" />
      )}
    </span>
  );
}
