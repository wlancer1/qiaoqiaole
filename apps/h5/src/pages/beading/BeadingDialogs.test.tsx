import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { ReactElement } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BeadingCompletionDialog } from './BeadingCompletionDialog';
import { BeadingExitDialog } from './BeadingExitDialog';

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

type NodeMock = {
  focus: ReturnType<typeof vi.fn>;
  parentElement?: { children: NodeMock[] } | null;
  inert?: boolean;
  attributes: Map<string, string>;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  querySelectorAll(): NodeMock[];
};

function nodeMock(): NodeMock {
  const attributes = new Map<string, string>();
  const node: NodeMock = {
    focus: vi.fn(() => { (document as any).activeElement = node; }),
    parentElement: null,
    attributes,
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => { attributes.set(name, value); },
    removeAttribute: (name) => { attributes.delete(name); },
    querySelectorAll: () => [],
  };
  return node;
}

function key(keyName: string, shiftKey = false) {
  return { key: keyName, shiftKey, preventDefault: vi.fn() };
}

describe('beading modal focus contract', () => {
  beforeEach(() => {
    const previous = nodeMock();
    vi.stubGlobal('document', { activeElement: previous });
  });

  async function renderDialog(element: ReactElement) {
    const background = nodeMock();
    const backdrop = nodeMock();
    const dialog = nodeMock();
    const buttons: NodeMock[] = [];
    backdrop.parentElement = { children: [background, backdrop] };
    dialog.querySelectorAll = () => buttons;
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(element, {
        createNodeMock: (reactElement) => {
          const elementProps = reactElement.props as Record<string, unknown>;
          if (elementProps.role === 'dialog') return backdrop;
          if (reactElement.type === 'section') return dialog;
          if (reactElement.type === 'button') {
            const button = nodeMock();
            buttons.push(button);
            return button;
          }
          return nodeMock();
        },
      });
    });
    return { renderer, background, backdrop, dialog, buttons };
  }

  it('focuses, traps Tab, handles Escape, restores focus, and restores background state', async () => {
    const previous = document.activeElement as unknown as NodeMock;
    const onContinue = vi.fn();
    const view = await renderDialog(<BeadingExitDialog onContinue={onContinue} onSaveExit={vi.fn()} onAbandon={vi.fn()} />);
    expect(view.buttons[0].focus).toHaveBeenCalledTimes(1);
    expect(view.background.inert).toBe(true);
    expect(view.background.getAttribute('aria-hidden')).toBe('true');

    (document as any).activeElement = view.buttons.at(-1);
    const tab = key('Tab');
    act(() => view.renderer.root.findByProps({ role: 'dialog' }).props.onKeyDown(tab));
    expect(tab.preventDefault).toHaveBeenCalled();
    expect(view.buttons[0].focus).toHaveBeenCalledTimes(2);

    const escape = key('Escape');
    act(() => view.renderer.root.findByProps({ role: 'dialog' }).props.onKeyDown(escape));
    expect(onContinue).toHaveBeenCalledTimes(1);
    act(() => view.renderer.unmount());
    expect(view.background.inert).toBe(false);
    expect(view.background.getAttribute('aria-hidden')).toBeNull();
    expect(previous.focus).toHaveBeenCalledTimes(1);
  });

  it('announces pending and blocks Escape plus every exit action', async () => {
    const onContinue = vi.fn();
    const view = await renderDialog(<BeadingExitDialog pending onContinue={onContinue} onSaveExit={vi.fn()} onAbandon={vi.fn()} />);
    expect(view.renderer.root.findByProps({ role: 'dialog' }).props['aria-busy']).toBe(true);
    expect(view.renderer.root.findAllByType('button').every((item) => item.props.disabled)).toBe(true);
    act(() => view.renderer.root.findByProps({ role: 'dialog' }).props.onKeyDown(key('Escape')));
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('applies the same pending and Escape behavior to completion', async () => {
    const onReturn = vi.fn();
    const view = await renderDialog(<BeadingCompletionDialog pending onReturn={onReturn} onNoDeduct={vi.fn()} onDeduct={vi.fn()} />);
    expect(view.renderer.root.findByProps({ role: 'dialog' }).props['aria-busy']).toBe(true);
    act(() => view.renderer.root.findByProps({ role: 'dialog' }).props.onKeyDown(key('Escape')));
    expect(onReturn).not.toHaveBeenCalled();
  });
});
