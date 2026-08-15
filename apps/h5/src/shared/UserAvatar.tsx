import { UserRound } from 'lucide-react';
import type { ComponentProps } from 'react';
import { ImageWithSkeleton } from './ImageWithSkeleton';

type UserAvatarProps = Omit<ComponentProps<'span'>, 'children'> & {
  avatarUrl?: string | null;
  fallbackDataAttribute?: string;
  imageClassName?: string;
};

/** Shared avatar rendering: trim URLs, show real images, and use one fallback everywhere. */
export function UserAvatar({ avatarUrl, className = '', fallbackDataAttribute, imageClassName, ...spanProps }: UserAvatarProps) {
  const normalizedUrl = avatarUrl?.trim() ?? '';
  const fallbackProps = fallbackDataAttribute ? { [fallbackDataAttribute]: 'true' } : {};
  const isInteractive = Boolean(spanProps.role || spanProps.tabIndex !== undefined || spanProps.onClick || spanProps.onKeyDown || spanProps['aria-label']);

  return (
    <span {...spanProps} className={className} {...(isInteractive ? {} : { 'aria-hidden': true })}>
      <ImageWithSkeleton
        src={normalizedUrl}
        alt=""
        as="span"
        className="user-avatar-image"
        imageClassName={imageClassName}
        fallback={<UserRound {...fallbackProps} />}
      />
    </span>
  );
}
