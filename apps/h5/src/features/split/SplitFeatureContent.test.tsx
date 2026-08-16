import { createElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SplitFeatureContent } from './SplitFeatureContent';
import { SplitFeatureProvider } from './SplitFeatureProvider';

describe('SplitFeatureContent', () => {
  it('provides a route-owned split feature entry point instead of requiring H5App to assemble a workflow prop bag', () => {
    const markup = renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/split'] },
      createElement(SplitFeatureProvider, { setStatus: () => undefined, onImport: () => undefined, children: createElement(SplitFeatureContent) }),
    ));
    expect(markup).toBe('');
  });

  it('exposes the saved-source query through the feature command boundary', () => {
    const onCommands = vi.fn();
    renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/'] },
      createElement(SplitFeatureProvider, { setStatus: () => undefined, onImport: () => undefined, onCommands, children: null }),
    ));
    expect(onCommands.mock.calls[0][0].getSourceImage()).toBeNull();
  });

  it('binds crop confirmation and preview back navigation to the route-owned workflow commands', async () => {
    const source = await import('node:fs').then(({ readFileSync }) => readFileSync(new URL('./SplitFeatureContent.tsx', import.meta.url), 'utf8'));
    expect(source).toContain("confirmSplitCrop: () => { workflow.confirmCrop(); navigate('/split/preview'); }");
    expect(source).toContain("returnToSplitCrop: () => { workflow.returnToCrop(); navigate('/split/crop'); }");
  });
});
