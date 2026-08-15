import React, { type ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { AppBootstrap } from './app/AppBootstrap';
import { H5AppShell } from './app/H5AppShell';
import { store, type H5Store } from './store/store';
import './styles.css';

export type H5ApplicationProps = {
  appStore?: H5Store;
  content?: ReactNode;
  renderRouter?: (content: ReactNode) => ReactNode;
};

function renderBrowserRouter(content: ReactNode): ReactNode {
  return <BrowserRouter basename={import.meta.env.BASE_URL}>{content}</BrowserRouter>;
}

export function H5Application({
  appStore = store,
  content,
  renderRouter = renderBrowserRouter,
}: H5ApplicationProps) {
  return (
    <Provider store={appStore}>
      {renderRouter(
        <AppBootstrap>{content ?? <H5AppShell />}</AppBootstrap>,
      )}
    </Provider>
  );
}

async function renderApp() {
  const showBeadingFixture = import.meta.env.DEV
    && new URLSearchParams(window.location.search).get('beading-fixture') === '1';
  const content = showBeadingFixture
    ? React.createElement((await import('./pages/beading/BeadingSessionFixture')).BeadingSessionFixture)
    : undefined;
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <H5Application content={content} />
    </React.StrictMode>,
  );
}

if (typeof document !== 'undefined') void renderApp();
