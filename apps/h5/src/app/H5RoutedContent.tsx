import { Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { DelayedRouteLoadingFallback, RouteLoadErrorBoundary } from '../loading/H5LoadingStates';
import { resolveAuthRoute } from '../features/auth/authRouteGuard';
import type { AppScreen } from '../shared/h5Types';
import { H5_ROUTE_PATHS } from './h5Routes';
import { PrivacyPolicyPage, UserAgreementPage } from '../pages/legal/LegalPages';

export type H5RoutePages = Partial<Record<AppScreen, ReactNode>>;

export function H5RouteSwitch({ pages }: { pages: H5RoutePages }) {
  return <Routes>
    <Route path={H5_ROUTE_PATHS.home} element={pages.home} />
    <Route path={H5_ROUTE_PATHS.discover} element={pages.home} />
    <Route path={H5_ROUTE_PATHS.messages} element={pages.home} />
    <Route path={H5_ROUTE_PATHS.profile} element={pages.home} />
    <Route path={H5_ROUTE_PATHS.following} element={pages.following} />
    <Route path={H5_ROUTE_PATHS.followers} element={pages.followers} />
    <Route path={H5_ROUTE_PATHS.communityPost} element={pages['pattern-detail']} />
    <Route path={H5_ROUTE_PATHS.authorProfile} element={pages['author-profile']} />
    <Route path={H5_ROUTE_PATHS.projects} element={pages['my-works']} />
    <Route path={H5_ROUTE_PATHS.projectEdit} element={pages.canvas} />
    <Route path={H5_ROUTE_PATHS.projectBeading} element={pages.beading} />
    <Route path={H5_ROUTE_PATHS.warehouses} element={pages.warehouse} />
    <Route path={H5_ROUTE_PATHS.warehouseDetail} element={pages['warehouse-detail']} />
    <Route path={H5_ROUTE_PATHS.split} element={pages.split} />
    <Route path={H5_ROUTE_PATHS.splitCrop} element={pages['split-crop']} />
    <Route path={H5_ROUTE_PATHS.splitPreview} element={pages['split-preview']} />
    <Route path={H5_ROUTE_PATHS.canvas} element={pages.canvas} />
    <Route path={H5_ROUTE_PATHS.beading} element={pages.beading} />
    <Route path={H5_ROUTE_PATHS.userAgreement} element={<UserAgreementPage />} />
    <Route path={H5_ROUTE_PATHS.privacyPolicy} element={<PrivacyPolicyPage />} />
    <Route path="*" element={<Navigate to={H5_ROUTE_PATHS.home} replace />} />
  </Routes>;
}

export function H5RoutedContent({ pages, onReload, authStatus }: {
  pages: H5RoutePages;
  onReload?: () => void;
  authStatus?: 'restoring' | 'authenticated' | 'anonymous';
}) {
  const location = useLocation();
  const resetKey = `${location.pathname}${location.search}${location.hash}`;
  const isProtectedPath = /^\/(?:projects|warehouses|following|followers)(?:\/|$)/.test(location.pathname);
  const authDecision = isProtectedPath && authStatus ? resolveAuthRoute({ status: authStatus }) : 'allow';

  if (authDecision === 'wait') return <DelayedRouteLoadingFallback />;
  if (authDecision === 'login') return <Navigate to="/" replace />;

  return <RouteLoadErrorBoundary resetKey={resetKey} onReload={onReload}>
    <Suspense fallback={<DelayedRouteLoadingFallback />}>
      <H5RouteSwitch pages={pages} />
    </Suspense>
  </RouteLoadErrorBoundary>;
}
