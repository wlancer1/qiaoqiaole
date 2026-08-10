import { UserRound } from 'lucide-react';
import { useState } from 'react';
import type { ComponentProps } from 'react';

type UserAvatarProps = Omit<ComponentProps<'span'>, 'children'> & {
  avatarUrl?: string | null;
  fallbackDataAttribute?: string;
  imageClassName?: string;
};

/** Shared avatar rendering: trim URLs, show real images, and use one fallback everywhere. */
export function UserAvatar({ avatarUrl, className = '', fallbackDataAttribute, imageClassName, ...spanProps }: UserAvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const normalizedUrl = avatarUrl?.trim() ?? '';
  const showImage = Boolean(normalizedUrl) && failedUrl !== normalizedUrl;
  const fallbackProps = fallbackDataAttribute ? { [fallbackDataAttribute]: 'true' } : {};
  const isInteractive = Boolean(spanProps.role || spanProps.tabIndex !== undefined || spanProps.onClick || spanProps.onKeyDown || spanProps['aria-label']);

  return (
    <span {...spanProps} className={className} {...(isInteractive ? {} : { 'aria-hidden': true })}>
      {showImage ? <img className={imageClassName} src={normalizedUrl} alt="" onError={() => setFailedUrl(normalizedUrl)} /> : <UserRound {...fallbackProps} />}
    </span>
  );
}
