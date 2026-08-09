import React from 'react';
import ReactDOM from 'react-dom/client';
import H5App from './H5App';
import './styles.css';

const showBeadingFixture = import.meta.env.DEV
  && new URLSearchParams(window.location.search).get('beading-fixture') === '1';

async function renderApp() {
  const content = showBeadingFixture
    ? React.createElement((await import('./pages/beading/BeadingSessionFixture')).BeadingSessionFixture)
    : <H5App />;
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>{content}</React.StrictMode>,
  );
}

void renderApp();
