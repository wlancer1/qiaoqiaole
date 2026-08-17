import { useEffect, useRef, useState, type ReactNode } from 'react';

const IMAGE_LOAD_TIMEOUT_MS = 10_000;
const MAX_IMAGE_RETRIES = 2;

type ImageWithSkeletonProps = {
  src?: string | null;
  alt: string;
  fallback: ReactNode;
  className?: string;
  imageClassName?: string;
  loading?: 'eager' | 'lazy';
  loadTimeoutMs?: number;
  maxRetries?: number;
  as?: 'div' | 'span';
};

export function ImageWithSkeleton({ src, alt, fallback, className = '', imageClassName = '', loading = 'lazy', loadTimeoutMs = 0, maxRetries = MAX_IMAGE_RETRIES, as = 'div' }: ImageWithSkeletonProps) {
  const normalizedSrc = src?.trim() ?? '';
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>(() => normalizedSrc ? 'loading' : 'failed');
  const [retryCount, setRetryCount] = useState(0);
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    setState(normalizedSrc ? 'loading' : 'failed');
    setRetryCount(0);
  }, [normalizedSrc]);

  useEffect(() => {
    const image = imageRef.current;
    if (!image || !image.complete || typeof image.naturalWidth !== 'number') return;
    setState(image.naturalWidth > 0 ? 'loaded' : 'failed');
  }, [normalizedSrc]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const retryAfterResume = () => {
      if (!normalizedSrc || state !== 'failed' || maxRetries <= 0) return;
      setState('loading');
      setRetryCount(1);
    };
    window.addEventListener('online', retryAfterResume);
    window.addEventListener('pageshow', retryAfterResume);
    return () => {
      window.removeEventListener('online', retryAfterResume);
      window.removeEventListener('pageshow', retryAfterResume);
    };
  }, [maxRetries, normalizedSrc, state]);

  useEffect(() => {
    if (!normalizedSrc || state !== 'loading' || loadTimeoutMs <= 0) return undefined;
    const timeout = setTimeout(() => {
      if (retryCount < maxRetries) {
        setRetryCount((current) => current + 1);
        return;
      }
      setState('failed');
    }, loadTimeoutMs || IMAGE_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [loadTimeoutMs, maxRetries, normalizedSrc, retryCount, state]);

  const Wrapper = as;
  const wrapperClassName = `image-with-skeleton${state === 'loading' ? ' is-loading' : ''}${state === 'failed' ? ' is-failed' : ''}${className ? ` ${className}` : ''}`;
  const retrySrc = retryCount > 0 ? (() => {
    const hashIndex = normalizedSrc.indexOf('#');
    const base = hashIndex >= 0 ? normalizedSrc.slice(0, hashIndex) : normalizedSrc;
    const hash = hashIndex >= 0 ? normalizedSrc.slice(hashIndex) : '';
    return `${base}${base.includes('?') ? '&' : '?'}imageRetry=${retryCount}${hash}`;
  })() : normalizedSrc;

  if (!normalizedSrc || state === 'failed') {
    return <Wrapper className={wrapperClassName}>{fallback}</Wrapper>;
  }

  return (
    <Wrapper className={wrapperClassName}>
      {state === 'loading' ? <div className="image-with-skeleton-placeholder" data-image-skeleton="true" aria-hidden="true" /> : null}
      <img
        ref={imageRef}
        className={`${imageClassName || 'image-with-skeleton-image'}${state === 'loaded' ? ' is-loaded' : ''}`}
        src={retrySrc}
        alt={alt}
        loading={loading}
        decoding="async"
        onLoad={() => setState('loaded')}
        onError={() => {
          if (retryCount < maxRetries) {
            setState('loading');
            setRetryCount((current) => current + 1);
            return;
          }
          setState('failed');
        }}
      />
    </Wrapper>
  );
}
