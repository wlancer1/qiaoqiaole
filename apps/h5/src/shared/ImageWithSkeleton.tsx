import { useEffect, useRef, useState, type ReactNode, type RefCallback } from 'react';

const IMAGE_LOAD_TIMEOUT_MS = 10_000;
const MAX_IMAGE_RETRIES = 2;

type ImageWithSkeletonProps = {
  src?: string | null;
  alt: string;
  fallback: ReactNode;
  className?: string;
  imageClassName?: string;
  loading?: 'eager' | 'lazy';
  fetchPriority?: 'high' | 'low' | 'auto';
  deferUntilVisible?: boolean;
  loadTimeoutMs?: number;
  maxRetries?: number;
  as?: 'div' | 'span';
};

type ImageActivation = 'active' | 'waiting' | 'native-lazy';

function getInitialActivation(deferUntilVisible: boolean): ImageActivation {
  if (!deferUntilVisible) return 'active';
  return typeof IntersectionObserver === 'undefined' ? 'native-lazy' : 'waiting';
}

type SourceImageWithSkeletonProps = Omit<ImageWithSkeletonProps, 'src'> & {
  normalizedSrc: string;
};

export function ImageWithSkeleton({ src, ...props }: ImageWithSkeletonProps) {
  const normalizedSrc = src?.trim() ?? '';
  return <SourceImageWithSkeleton key={normalizedSrc} normalizedSrc={normalizedSrc} {...props} />;
}

function SourceImageWithSkeleton({ normalizedSrc, alt, fallback, className = '', imageClassName = '', loading = 'lazy', fetchPriority, deferUntilVisible = false, loadTimeoutMs = 0, maxRetries = MAX_IMAGE_RETRIES, as = 'div' }: SourceImageWithSkeletonProps) {
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>(() => normalizedSrc ? 'loading' : 'failed');
  const [retryCount, setRetryCount] = useState(0);
  const [activation, setActivation] = useState<ImageActivation>(() => getInitialActivation(deferUntilVisible));
  const imageRef = useRef<HTMLImageElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | HTMLSpanElement | null>(null);
  const terminalFailureRef = useRef(false);
  const setWrapperRef: RefCallback<HTMLDivElement | HTMLSpanElement> = (node) => {
    wrapperRef.current = node;
  };

  useEffect(() => {
    if (!normalizedSrc || activation !== 'waiting') return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setActivation('native-lazy');
      return undefined;
    }
    const wrapper = wrapperRef.current;
    if (!wrapper) return undefined;
    let disconnected = false;
    const observer = new IntersectionObserver((entries) => {
      if (disconnected) return;
      if (!entries.some((entry) => entry.isIntersecting)) return;
      disconnected = true;
      observer.disconnect();
      setActivation('active');
    }, { rootMargin: '0px 0px 240px 0px' });
    observer.observe(wrapper);
    return () => {
      if (disconnected) return;
      disconnected = true;
      observer.disconnect();
    };
  }, [activation, normalizedSrc]);

  useEffect(() => {
    const image = imageRef.current;
    if (!image || !image.complete || typeof image.naturalWidth !== 'number') return;
    if (image.naturalWidth > 0) {
      if (!terminalFailureRef.current) setState('loaded');
      return;
    }
    terminalFailureRef.current = true;
    setState('failed');
  }, [activation, normalizedSrc]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const retryAfterResume = () => {
      if (!normalizedSrc || state !== 'failed' || maxRetries <= 0) return;
      terminalFailureRef.current = false;
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
    if (!normalizedSrc || state !== 'loading' || activation !== 'active' || loadTimeoutMs <= 0) return undefined;
    const timeout = setTimeout(() => {
      if (terminalFailureRef.current) return;
      if (retryCount < maxRetries) {
        setRetryCount((current) => current + 1);
        return;
      }
      terminalFailureRef.current = true;
      setState('failed');
    }, loadTimeoutMs || IMAGE_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [activation, loadTimeoutMs, maxRetries, normalizedSrc, retryCount, state]);

  const Wrapper = as;
  const wrapperClassName = `image-with-skeleton${state === 'loading' ? ' is-loading' : ''}${state === 'failed' ? ' is-failed' : ''}${className ? ` ${className}` : ''}`;
  const retrySrc = retryCount > 0 ? (() => {
    const hashIndex = normalizedSrc.indexOf('#');
    const base = hashIndex >= 0 ? normalizedSrc.slice(0, hashIndex) : normalizedSrc;
    const hash = hashIndex >= 0 ? normalizedSrc.slice(hashIndex) : '';
    return `${base}${base.includes('?') ? '&' : '?'}imageRetry=${retryCount}${hash}`;
  })() : normalizedSrc;

  if (!normalizedSrc || state === 'failed') {
    return <Wrapper ref={setWrapperRef} className={wrapperClassName}>{fallback}</Wrapper>;
  }

  return (
    <Wrapper ref={setWrapperRef} className={wrapperClassName}>
      {state === 'loading' ? <div className="image-with-skeleton-placeholder" data-image-skeleton="true" aria-hidden="true" /> : null}
      {activation !== 'waiting' ? (
        <img
          ref={imageRef}
          className={`${imageClassName || 'image-with-skeleton-image'}${state === 'loaded' ? ' is-loaded' : ''}`}
          src={retrySrc}
          alt={alt}
          loading={loading}
          fetchPriority={fetchPriority}
          decoding="async"
          onLoad={() => {
            if (terminalFailureRef.current) return;
            setState('loaded');
          }}
          onError={() => {
            if (terminalFailureRef.current) return;
            if (retryCount < maxRetries) {
              setState('loading');
              setRetryCount((current) => current + 1);
              return;
            }
            terminalFailureRef.current = true;
            setState('failed');
          }}
        />
      ) : null}
    </Wrapper>
  );
}
