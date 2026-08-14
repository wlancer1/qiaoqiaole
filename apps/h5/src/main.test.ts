import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const mainSource = readFileSync(resolve(__dirname, 'main.tsx'), 'utf8');
const h5AppSource = readFileSync(resolve(__dirname, 'H5App.tsx'), 'utf8');

describe('H5 application entrypoint', () => {
  it('mounts one Redux Provider, BrowserRouter, and AppBootstrap around app content', () => {
    expect(mainSource).toContain("import { Provider } from 'react-redux';");
    expect(mainSource).toContain("import { store } from './store/store';");
    expect(mainSource).toContain("import { AppBootstrap } from './app/AppBootstrap';");
    expect(mainSource.match(/<Provider\b/g)).toHaveLength(1);
    expect(mainSource.match(/<BrowserRouter\b/g)).toHaveLength(1);
    expect(mainSource.match(/<AppBootstrap\b/g)).toHaveLength(1);
    expect(mainSource).toContain('<Provider store={store}>');
    expect(mainSource).toContain('<BrowserRouter basename={import.meta.env.BASE_URL}>');
    expect(mainSource).toMatch(
      /<Provider store=\{store\}>[\s\S]*<BrowserRouter basename=\{import\.meta\.env\.BASE_URL\}>[\s\S]*<AppBootstrap>[\s\S]*\{content\}[\s\S]*<\/AppBootstrap>[\s\S]*<\/BrowserRouter>[\s\S]*<\/Provider>/,
    );
  });

  it('does not create another Provider or Router inside H5App', () => {
    expect(h5AppSource).not.toMatch(/<Provider\b/);
    expect(h5AppSource).not.toMatch(/<BrowserRouter\b/);
  });

  it('keeps the beading fixture inside the same application bootstrap', () => {
    expect(mainSource).toContain("import('./pages/beading/BeadingSessionFixture')");
    expect(mainSource).toMatch(/const content = showBeadingFixture[\s\S]*<AppBootstrap>[\s\S]*\{content\}[\s\S]*<\/AppBootstrap>/);
  });
});
