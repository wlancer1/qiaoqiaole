import type { ReactNode } from 'react';
import { useDelayedLoading } from './useDelayedLoading';

export type PageSkeletonKind = 'home' | 'pattern-list' | 'pattern-detail' | 'profile-list' | 'warehouse' | 'editor';

export function RouteLoadingFallback({ label = '正在准备页面', description = '拼出精彩，只差一点点' }: { label?: string; description?: string }) {
  return <main className="route-loading-fallback" role="status" aria-live="polite" aria-busy="true" aria-label={label}>
    <div className="route-loading-content">
      <div className="route-loading-pixels" aria-hidden="true">
        {Array.from({ length: 9 }, (_, index) => <i className="route-loading-pixel" key={index} />)}
      </div>
      <strong>{label}</strong>
      <span>{description}</span>
    </div>
  </main>;
}

export function DelayedRouteLoadingFallback() {
  const visible = useDelayedLoading(true);
  return visible ? <RouteLoadingFallback /> : <main className="route-loading-delay" aria-hidden="true" />;
}

function SkeletonCards({ count = 4 }: { count?: number }) {
  return <div className="page-skeleton-grid">
    {Array.from({ length: count }, (_, index) => <i className="page-skeleton-card page-skeleton-shimmer" key={index} />)}
  </div>;
}

export function PageSkeleton({ kind, label }: { kind: PageSkeletonKind; label: string }) {
  return <main className={`page-skeleton page-skeleton--${kind}`} role="status" aria-live="polite" aria-busy="true" aria-label={label}>
    <span className="page-skeleton-label">{label}</span>
    <div className="page-skeleton-shapes" aria-hidden="true">
      <header className="page-skeleton-header"><i /><i /></header>
      {kind === 'pattern-detail' || kind === 'editor' ? <i className="page-skeleton-hero page-skeleton-shimmer" /> : null}
      {kind === 'profile-list' ? <div className="page-skeleton-list">{Array.from({ length: 6 }, (_, index) => <i className="page-skeleton-row page-skeleton-shimmer" key={index} />)}</div> : null}
      {kind === 'warehouse' ? <><i className="page-skeleton-summary page-skeleton-shimmer" /><SkeletonCards count={12} /></> : null}
      {kind === 'home' || kind === 'pattern-list' ? <><i className="page-skeleton-banner page-skeleton-shimmer" /><SkeletonCards /></> : null}
      {kind === 'pattern-detail' ? <><i className="page-skeleton-line page-skeleton-shimmer" /><i className="page-skeleton-line is-short page-skeleton-shimmer" /></> : null}
      {kind === 'editor' ? <div className="page-skeleton-toolbar"><i /><i /><i /><i /></div> : null}
    </div>
  </main>;
}

export function PageLoadBoundary({ loading, error = '', skeleton, loadingLabel, onRetry, children }: {
  loading: boolean;
  error?: string;
  skeleton: PageSkeletonKind;
  loadingLabel: string;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  if (loading) return <PageSkeleton kind={skeleton} label={loadingLabel} />;
  if (error) return <main className="page-load-error" role="alert">
    <strong>{error}</strong>
    {onRetry ? <button type="button" onClick={onRetry}>重新加载</button> : null}
  </main>;
  return <div className="page-content-enter">{children}</div>;
}
