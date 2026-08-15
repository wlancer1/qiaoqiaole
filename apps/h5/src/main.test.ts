import React, { useEffect } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Provider, useStore } from 'react-redux';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppBootstrap } from './app/AppBootstrap';
import { routeScopeId } from './app/RouteScopeBridge';
import { useAuthGate } from './store/ui/AuthGateContext';
import { selectCurrentRouteScope } from './store/ui/uiSlice';
import { useAppSelector } from './store/hooks';
import { createH5Store, type H5Store } from './store/store';

const mainSource = readFileSync(resolve(__dirname, 'main.tsx'), 'utf8');
const h5AppSource = readFileSync(resolve(__dirname, 'H5App.tsx'), 'utf8');
const renderers: ReactTestRenderer[] = [];

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  for (const renderer of renderers) act(() => renderer.unmount());
  renderers.length = 0;
  vi.restoreAllMocks();
});

describe('H5 application entrypoint', () => {
  it('mounts one Redux Provider, BrowserRouter, and AppBootstrap around app content', () => {
    expect(mainSource).toContain("import { Provider } from 'react-redux';");
    expect(mainSource).toContain("import { store, type H5Store } from './store/store';");
    expect(mainSource).toContain("import { AppBootstrap } from './app/AppBootstrap';");
    expect(mainSource.match(/<Provider\b/g)).toHaveLength(1);
    expect(mainSource.match(/<BrowserRouter\b/g)).toHaveLength(1);
    expect(mainSource.match(/<AppBootstrap\b/g)).toHaveLength(1);
    expect(mainSource).toContain('appStore = store');
    expect(mainSource).toContain('<Provider store={appStore}>');
    expect(mainSource).toContain('<BrowserRouter basename={import.meta.env.BASE_URL}>');
    expect(mainSource).toContain('<AppBootstrap>{content ?? <H5AppShell />}</AppBootstrap>');
  });

  it('does not create another Provider or Router inside H5App', () => {
    expect(h5AppSource).not.toMatch(/<Provider\b/);
    expect(h5AppSource).not.toMatch(/<BrowserRouter\b/);
  });

  it('keeps the beading fixture inside the same application bootstrap', () => {
    expect(mainSource).toContain("import('./pages/beading/BeadingSessionFixture')");
    expect(mainSource).toMatch(/const content = showBeadingFixture[\s\S]*: undefined;/);
    expect(mainSource).toContain('<H5Application content={content} />');
  });

  it('runs Redux, Router, AppBootstrap, and RouteScopeBridge together under StrictMode', async () => {
    const storage = {
      getItem: vi.fn(() => JSON.stringify({ token: 'token', username: 'alice' })),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    } as unknown as Storage;
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      user: { id: 'user-1', username: 'alice' },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const appStore = createH5Store({ storage });
    const observations: Array<{
      store: H5Store;
      pathname: string;
      scopeId: string;
    }> = [];

    function ContextProbe() {
      const contextStore = useStore() as H5Store;
      const location = useLocation();
      const scopeId = useAppSelector(selectCurrentRouteScope);
      const gate = useAuthGate();
      useEffect(() => {
        gate.attach('main-test');
        observations.push({
          store: contextStore,
          pathname: location.pathname,
          scopeId,
        });
        return () => gate.release('main-test');
      }, [contextStore, gate, location.pathname, scopeId]);
      return React.createElement('output', null, location.pathname);
    }

    let renderer!: ReactTestRenderer;
    await act(async () => {
      const routerContent = React.createElement(
        MemoryRouter,
        { initialEntries: ['/discover?tab=hot'] },
        React.createElement(
          AppBootstrap,
          null,
          React.createElement(ContextProbe),
        ),
      );
      renderer = create(
        React.createElement(
          React.StrictMode,
          null,
          React.createElement(
            Provider,
            { store: appStore, children: routerContent },
          ),
        ),
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    renderers.push(renderer);

    expect(renderer.root.findByType('output').props.children).toBe('/discover');
    expect(observations.length).toBeGreaterThan(0);
    expect(observations.every(({ store }) => store === appStore)).toBe(true);
    expect(observations.at(-1)).toMatchObject({
      pathname: '/discover',
      scopeId: expect.stringContaining('/discover?tab=hot'),
    });
    expect(appStore.getState().ui.currentRouteScope).toBe(
      routeScopeId({ key: 'default', pathname: '/discover', search: '?tab=hot' }),
    );
    expect(appStore.getState().auth.status).toBe('authenticated');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
