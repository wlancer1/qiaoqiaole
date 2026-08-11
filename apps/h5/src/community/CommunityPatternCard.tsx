import { Heart, MessageCircle } from 'lucide-react';
import type { PatternListCard } from '../shared/h5Types';
import { UserAvatar } from '../shared/UserAvatar';

type CommunityPatternCardProps = {
  pattern: PatternListCard;
  className?: string;
  dataCardIndex?: number;
  onOpen: (pattern: PatternListCard) => void;
  onOpenAuthor?: (pattern: PatternListCard) => void;
};

function formatPatternCount(value: string) {
  const normalized = value.trim().toLowerCase().replace(/,/g, '');
  const suffixMultiplier = normalized.endsWith('k') ? 1000 : normalized.endsWith('m') ? 1000000 : 1;
  const numericPart = suffixMultiplier === 1 ? normalized : normalized.slice(0, -1);
  const numericValue = Number(numericPart) * suffixMultiplier;
  return Number.isFinite(numericValue) && numericValue >= 100 ? '99+' : value;
}

export function CommunityPatternCard({ pattern, className = '', dataCardIndex, onOpen, onOpenAuthor }: CommunityPatternCardProps) {
  return (
    <button
      className={className ? `pattern-card ${className}` : 'pattern-card'}
      {...(dataCardIndex === undefined ? {} : { 'data-card-index': dataCardIndex })}
      type="button"
      onClick={() => onOpen(pattern)}
    >
      <div className={`pattern-art ${pattern.tone}`} aria-hidden="true">
        {pattern.image ? <img className="pattern-card-image" src={pattern.image} alt="" /> : <div className="pattern-card-empty">暂无预览图</div>}
      </div>
      <div className="pattern-card-body">
        <h2>{pattern.title}</h2>
        {pattern.tags?.length ? <div className="pattern-card-tags" aria-label="作品标签">
          {pattern.tags.slice(0, 2).map((tag) => <span key={tag}>#{tag}</span>)}
          {pattern.tags.length > 2 ? <span>+{pattern.tags.length - 2}</span> : null}
        </div> : null}
        <div className="pattern-card-info-row">
          <div className="pattern-author-row">
            <UserAvatar
              className="pattern-avatar"
              avatarUrl={pattern.authorAvatar}
              role={onOpenAuthor ? 'link' : undefined}
              tabIndex={onOpenAuthor ? 0 : undefined}
              aria-label={onOpenAuthor ? `查看${pattern.author}的作者主页` : undefined}
              onClick={onOpenAuthor ? (event) => {
                event.stopPropagation();
                onOpenAuthor(pattern);
              } : undefined}
              onKeyDown={onOpenAuthor ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  onOpenAuthor(pattern);
                }
              } : undefined}
            />
            <strong>{pattern.author}</strong>
          </div>
          <div className="pattern-card-meta">
            <span><Heart className={pattern.likedByMe ? 'pattern-like-icon is-liked' : 'pattern-like-icon'} aria-hidden="true" /> {formatPatternCount(pattern.likes)}</span>
            <span><MessageCircle aria-hidden="true" /> {formatPatternCount(pattern.comments)}</span>
          </div>
        </div>
      </div>
    </button>
  );
}
