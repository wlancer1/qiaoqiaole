import { useEffect, useRef, useState, type ReactNode } from 'react';

type ImageWithSkeletonProps = {
  src?: string | null;
  alt: string;
  fallback: ReactNode;
  className?: string;
  imageClassName?: string;
  loading?: 'eager' | 'lazy';
  as?: 'div' | 'span';
};

export function ImageWithSkeleton({ src, alt, fallback, className = '', imageClassName = '', loading = 'lazy', as = 'div' }: ImageWithSkeletonProps) {
  const normalizedSrc = src?.trim() ?? '';
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>(() => normalizedSrc ? 'loading' : 'failed');
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    setState(normalizedSrc ? 'loading' : 'failed');
  }, [normalizedSrc]);

  useEffect(() => {
    const image = imageRef.current;
    if (!image || !image.complete || typeof image.naturalWidth !== 'number') return;
    setState(image.naturalWidth > 0 ? 'loaded' : 'failed');
  }, [normalizedSrc]);

  const Wrapper = as;
  const wrapperClassName = `image-with-skeleton${state === 'loading' ? ' is-loading' : ''}${state === 'failed' ? ' is-failed' : ''}${className ? ` ${className}` : ''}`;

  if (!normalizedSrc || state === 'failed') {
    return <Wrapper className={wrapperClassName}>{fallback}</Wrapper>;
  }

  return (
    <Wrapper className={wrapperClassName}>
      {state === 'loading' ? <div className="image-with-skeleton-placeholder" data-image-skeleton="true" aria-hidden="true" /> : null}
      <img
        ref={imageRef}
        className={`${imageClassName || 'image-with-skeleton-image'}${state === 'loaded' ? ' is-loaded' : ''}`}
        src={normalizedSrc}
        alt={alt}
        loading={loading}
        decoding="async"
        onLoad={() => setState('loaded')}
        onError={() => setState('failed')}
      />
    </Wrapper>
  );
}
