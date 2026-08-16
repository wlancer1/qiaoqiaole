import { Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { DelayedRouteLoadingFallback, RouteLoadErrorBoundary } from '../loading/H5LoadingStates';
import { resolveAuthRoute } from '../features/auth/authRouteGuard';
import type { AppScreen } from '../shared/h5Types';
import { H5_ROUTE_PATHS } from './h5Routes';

export type H5RoutePageRenderer = (screen: AppScreen) => ReactNode;

function MatchedRoutePage({ screen, renderPage }: { screen: AppScreen; renderPage: H5RoutePageRenderer }) {
  return <>{renderPage(screen)}</>;
}

export function H5RouteSwitch({ renderPage }: { renderPage: H5RoutePageRenderer }) {
  return <Routes>
    <Route path={H5_ROUTE_PATHS.home} element={<MatchedRoutePage screen="home" renderPage={renderPage} />} />
    <Route path={H5_ROUTE_PATHS.discover} element={<MatchedRoutePage screen="home" renderPage={renderPage} />} />
    <Route path={H5_ROUTE_PATHS.messages} element={<MatchedRoutePage screen="home" renderPage={renderPage} />} />
    <Route path={H5_ROUTE_PATHS.profile} element={<MatchedRoutePage screen="home" renderPage={renderPage} />} />
    <Route path={H5_ROUTE_PATHS.following} element={<MatchedRoutePage screen="following" renderPage={renderPage} />} />
    <Route path={H5_ROUTE_PATHS.followers} element={<MatchedRoutePage screen="followers" renderPage={renderPage} />} />
    <Route path={H5_ROUTE_PATHS.communityPost} element={<MatchedRoutePage screen="pattern-detail" renderPage={renderPage} />} />
    <Route path={H5_ROUTE_PATHS.authorProfile} element={<MatchedRoutePage screen="author-profile" renderPage={renderPage} />} />
    <Route path={H5_ROUTE_PATHS.projects} element={<MatchedRoutePage screen="my-works" renderPage={renderPage} />} />
    <Route path={H5_ROUTE_PATHS.projectEdit} element={<MatchedRoutePage screen="canvas" renderPage={renderPage} />} />
    <Route path={H5_ROUTE_PATHS.projectBeading} element={<MatchedRoutePage screen="beading" renderPage={renderPage} />} />
    <Route path={H5_ROUTE_PATHS.warehouses} element={<MatchedRoutePage screen="warehouse" renderPage={renderPage} />} />
    <Route path={H5_ROUTE_PATHS.warehouseDetail} element={<MatchedRoutePage screen="warehouse-detail" renderPage={renderPage} />} />
    <Route path={H5_ROUTE_PATHS.split} element={<MatchedRoutePage screen="split" renderPage={renderPage} />} />
    <Route path={H5_ROUTE_PATHS.splitCrop} element={<MatchedRoutePage screen="split-crop" renderPage={renderPage} />} />
    <Route path={H5_ROUTE_PATHS.splitPreview} element={<MatchedRoutePage screen="split-preview" renderPage={renderPage} />} />
    <Route path={H5_ROUTE_PATHS.canvas} element={<MatchedRoutePage screen="canvas" renderPage={renderPage} />} />
    <Route path={H5_ROUTE_PATHS.beading} element={<MatchedRoutePage screen="beading" renderPage={renderPage} />} />
    <Route path="*" element={<Navigate to={H5_ROUTE_PATHS.home} replace />} />
  </Routes>;
}

export function H5RoutedContent({ renderPage, onReload, authStatus }: {
  renderPage: H5RoutePageRenderer;
  onReload?: () => void;
  authStatus?: 'restoring' | 'authenticated' | 'anonymous';
}) {
  const location = useLocation();
  const resetKey = `${location.pathname}${location.search}${location.hash}`;
  const isProtectedPath = /^\/(?:projects|warehouses|following|followers|messages)(?:\/|$)/.test(location.pathname);
  const authDecision = isProtectedPath && authStatus ? resolveAuthRoute({ status: authStatus }) : 'allow';

  if (authDecision === 'wait') return <DelayedRouteLoadingFallback />;
  if (authDecision === 'login') return <Navigate to="/" replace />;

  return <RouteLoadErrorBoundary resetKey={resetKey} onReload={onReload}>
    <Suspense fallback={<DelayedRouteLoadingFallback />}>
      <H5RouteSwitch renderPage={renderPage} />
    </Suspense>
  </RouteLoadErrorBoundary>;
}
