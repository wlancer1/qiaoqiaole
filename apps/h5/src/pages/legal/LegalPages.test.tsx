import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { H5RoutedContent } from '../../app/H5RoutedContent';

const renderers: ReactTestRenderer[] = [];

afterEach(() => {
  for (const renderer of renderers) act(() => renderer.unmount());
  renderers.length = 0;
});

describe('legal pages', () => {
  it.each([
    ['/user-agreement', '用户协议', '账号与服务'],
    ['/privacy-policy', '隐私政策', '我们如何使用信息'],
  ] as const)('renders %s as an independent legal page', async (pathname, title, section) => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <MemoryRouter initialEntries={[pathname]}>
          <H5RoutedContent pages={{}} />
        </MemoryRouter>,
      );
    });
    renderers.push(renderer);

    expect(renderer.root.findByType('h1').children).toContain(title);
    expect(renderer.root.findByProps({ id: 'legal-section-title' }).children).toContain(section);
    expect(renderer.root.findByProps({ 'aria-label': '返回上一页' })).toBeDefined();
  });
});
