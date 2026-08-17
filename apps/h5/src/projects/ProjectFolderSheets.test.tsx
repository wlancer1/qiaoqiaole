import { act, create, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreateProjectFolderSheet, MoveProjectFolderSheet } from './ProjectFolderSheets';
import type { ProjectFolder } from './projectFolders';

const folders: ProjectFolder[] = [
  { id: 'animals', name: '动物和一段特别特别长但不能撑破窄屏的文件夹名称', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' },
  { id: 'flowers', name: '花卉', createdAt: '2026-08-02T00:00:00.000Z', updatedAt: '2026-08-02T00:00:00.000Z' },
];

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function findButton(root: ReactTestInstance, name: string) {
  return root.findAllByType('button').find((button) => button.props['aria-label'] === name || button.children.join('') === name)!;
}

const mountedRenderers: ReactTestRenderer[] = [];

function renderSheet(element: Parameters<typeof create>[0], options?: Parameters<typeof create>[1]) {
  const renderer = create(element, options);
  mountedRenderers.push(renderer);
  return renderer;
}

afterEach(() => {
  while (mountedRenderers.length > 0) {
    const renderer = mountedRenderers.pop();
    if (renderer) act(() => renderer.unmount());
  }
});

function installDomHarness() {
  const listeners = new Map<string, Set<(event: { key?: string; preventDefault: () => void; stopImmediatePropagation: () => void }) => void>>();
  const windowMock = {
    addEventListener: vi.fn((type: string, listener: (event: { key?: string; preventDefault: () => void; stopImmediatePropagation: () => void }) => void) => {
      const entries = listeners.get(type) ?? new Set();
      entries.add(listener);
      listeners.set(type, entries);
    }),
    removeEventListener: vi.fn((type: string, listener: (event: { key?: string; preventDefault: () => void; stopImmediatePropagation: () => void }) => void) => listeners.get(type)?.delete(listener)),
  };
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: windowMock });
  return {
    pressEscape() {
      const event = { key: 'Escape', preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() };
      listeners.get('keydown')?.forEach((listener) => listener(event));
      return event;
    },
    restore() {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow });
    },
  };
}

describe('CreateProjectFolderSheet', () => {
  it('removes a covered lower create sheet from interaction and accessibility', async () => {
    const onClose = vi.fn();
    const onCreate = vi.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = renderSheet(<CreateProjectFolderSheet covered name="动物" onNameChange={vi.fn()} onCreate={onCreate} onClose={onClose} />);
    });
    const dialog = renderer.root.findByProps({ role: 'dialog' });
    const backdrop = renderer.root.findByProps({ 'data-testid': 'project-folder-sheet-backdrop' });

    expect(dialog.props['aria-hidden']).toBe(true);
    expect(dialog.props['aria-modal']).toBeUndefined();
    expect(dialog.props.inert).toBe(true);
    expect(backdrop.props['aria-hidden']).toBe(true);
    expect(backdrop.props.inert).toBe(true);
    expect(findButton(renderer.root, '取消新建文件夹').props.disabled).toBe(true);
    expect(findButton(renderer.root, '创建文件夹').props.disabled).toBe(true);
    backdrop.props.onClick?.();
    await act(async () => {
      renderer.root.findByType('form').props.onSubmit({ preventDefault: vi.fn() });
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('uses dialog semantics, validates a 30-character name, and isolates content clicks', () => {
    const onClose = vi.fn();
    const onNameChange = vi.fn();
    const onCreate = vi.fn();
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = renderSheet(<CreateProjectFolderSheet name="" onNameChange={onNameChange} onCreate={onCreate} onClose={onClose} error="名称已存在" />);
    });
    const dialog = renderer.root.findByProps({ role: 'dialog' });
    const backdrop = renderer.root.findByProps({ 'data-testid': 'project-folder-sheet-backdrop' });
    const input = renderer.root.findByProps({ 'aria-label': '文件夹名称' });
    const submit = findButton(renderer.root, '创建文件夹');
    const stopPropagation = vi.fn();

    expect(dialog.props['aria-modal']).toBe('true');
    expect(dialog.props['aria-labelledby']).toBeTruthy();
    expect(input.props.maxLength).toBe(30);
    expect(submit.props.disabled).toBe(true);
    expect(renderer.root.findByProps({ role: 'alert' }).children.join('')).toContain('名称已存在');
    dialog.props.onClick({ stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    backdrop.props.onClick();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('locks cancel, backdrop, Escape, and repeated submit while a request is active', async () => {
    const harness = installDomHarness();
    const request = deferred();
    const onClose = vi.fn();
    const onCreate = vi.fn(() => request.promise);
    let renderer!: ReactTestRenderer;
    try {
      await act(async () => {
        renderer = renderSheet(<CreateProjectFolderSheet name="动物" onNameChange={vi.fn()} onCreate={onCreate} onClose={onClose} />);
      });
      const form = renderer.root.findByType('form');
      const event = { preventDefault: vi.fn() };
      await act(async () => {
        const first = form.props.onSubmit(event);
        const second = form.props.onSubmit(event);
        expect(onCreate).toHaveBeenCalledTimes(1);
        renderer.root.findByProps({ 'data-testid': 'project-folder-sheet-backdrop' }).props.onClick();
        findButton(renderer.root, '取消新建文件夹').props.onClick();
        expect(harness.pressEscape().preventDefault).toHaveBeenCalledOnce();
        request.resolve();
        await Promise.all([first, second]);
      });
      expect(onClose).not.toHaveBeenCalled();
    } finally {
      act(() => renderer?.unmount());
      harness.restore();
    }
  });

  it('focuses the name input and restores focus to the supplied trigger', () => {
    const dialogFocus = vi.fn();
    const inputFocus = vi.fn();
    const triggerFocus = vi.fn();
    const returnFocusRef = { current: { focus: triggerFocus } as unknown as HTMLElement };
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = renderSheet(
        <CreateProjectFolderSheet name="" onNameChange={vi.fn()} onCreate={vi.fn()} onClose={vi.fn()} returnFocusRef={returnFocusRef} />,
        {
          createNodeMock: (element) => {
            if ((element.props as { role?: string }).role === 'dialog') return { focus: dialogFocus };
            if (element.type === 'input') return { focus: inputFocus };
            return {};
          },
        },
      );
    });
    expect(inputFocus).toHaveBeenCalledOnce();
    expect(dialogFocus).not.toHaveBeenCalled();
    act(() => renderer.unmount());
    expect(triggerFocus).toHaveBeenCalledOnce();
  });

  it('cycles Tab and Shift+Tab inside the visible sheet without leaking to the page', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = renderSheet(<CreateProjectFolderSheet name="动物" onNameChange={vi.fn()} onCreate={vi.fn()} onClose={vi.fn()} />);
    });
    const firstFocus = vi.fn();
    const lastFocus = vi.fn();
    const first = { focus: firstFocus, getAttribute: () => null } as unknown as HTMLElement;
    const last = { focus: lastFocus, getAttribute: () => null } as unknown as HTMLElement;
    const dialog = renderer.root.findByProps({ role: 'dialog' });
    const next = { key: 'Tab', shiftKey: false, target: last, currentTarget: { querySelectorAll: () => [first, last] }, preventDefault: vi.fn() };
    const previous = { key: 'Tab', shiftKey: true, target: first, currentTarget: { querySelectorAll: () => [first, last] }, preventDefault: vi.fn() };

    dialog.props.onKeyDown(next);
    dialog.props.onKeyDown(previous);

    expect(next.preventDefault).toHaveBeenCalledOnce();
    expect(previous.preventDefault).toHaveBeenCalledOnce();
    expect(firstFocus).toHaveBeenCalledOnce();
    expect(lastFocus).toHaveBeenCalledOnce();
  });

  it('unlocks after a failed request so the user can retry', async () => {
    const onCreate = vi.fn()
      .mockRejectedValueOnce(new Error('名称已存在'))
      .mockResolvedValueOnce(undefined);
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = renderSheet(<CreateProjectFolderSheet name="动物" onNameChange={vi.fn()} onCreate={onCreate} onClose={vi.fn()} />);
    });
    const submit = () => renderer.root.findByType('form').props.onSubmit({ preventDefault: vi.fn() });

    await act(async () => {
      submit();
      await Promise.resolve();
    });
    await act(async () => {
      submit();
      await Promise.resolve();
    });

    expect(onCreate).toHaveBeenCalledTimes(2);
  });
});

describe('MoveProjectFolderSheet', () => {
  it('removes a covered lower move sheet from interaction and accessibility', async () => {
    const onClose = vi.fn();
    const onSelectionChange = vi.fn();
    const onConfirm = vi.fn();
    const onCreateFolder = vi.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = renderSheet(<MoveProjectFolderSheet covered folders={folders} currentFolderId="animals" selectedFolderId="flowers" onSelectionChange={onSelectionChange} onConfirm={onConfirm} onCreateFolder={onCreateFolder} onClose={onClose} />);
    });
    const dialog = renderer.root.findByProps({ role: 'dialog' });
    const backdrop = renderer.root.findByProps({ 'data-testid': 'project-folder-sheet-backdrop' });

    expect(dialog.props['aria-hidden']).toBe(true);
    expect(dialog.props['aria-modal']).toBeUndefined();
    expect(dialog.props.inert).toBe(true);
    expect(backdrop.props['aria-hidden']).toBe(true);
    expect(backdrop.props.inert).toBe(true);
    expect(renderer.root.findByProps({ 'aria-label': '选择文件夹花卉' }).props.disabled).toBe(true);
    expect(findButton(renderer.root, '新建文件夹').props.disabled).toBe(true);
    expect(findButton(renderer.root, '移动到所选文件夹').props.disabled).toBe(true);
    backdrop.props.onClick?.();
    renderer.root.findByProps({ 'aria-label': '选择文件夹花卉' }).props.onClick();
    findButton(renderer.root, '新建文件夹').props.onClick();
    findButton(renderer.root, '移动到所选文件夹').props.onClick();
    expect(onClose).not.toHaveBeenCalled();
    expect(onSelectionChange).not.toHaveBeenCalled();
    expect(onCreateFolder).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('focuses the selected folder option, or uncategorized when there is no selection', () => {
    const selectedFocus = vi.fn();
    const uncategorizedFocus = vi.fn();
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = renderSheet(
        <MoveProjectFolderSheet folders={folders} currentFolderId="animals" selectedFolderId="flowers" onSelectionChange={vi.fn()} onConfirm={vi.fn()} onCreateFolder={vi.fn()} onClose={vi.fn()} />,
        {
          createNodeMock: (element) => {
            const label = (element.props as { 'aria-label'?: string })['aria-label'];
            if ((element.props as { role?: string }).role === 'dialog') return { focus: vi.fn() };
            if (label === '选择文件夹花卉') return { focus: selectedFocus };
            if (label === '选择未分类文件夹') return { focus: uncategorizedFocus };
            return {};
          },
        },
      );
    });

    expect(selectedFocus).toHaveBeenCalledOnce();
    expect(uncategorizedFocus).not.toHaveBeenCalled();
    act(() => renderer.unmount());

    act(() => {
      renderer = renderSheet(
        <MoveProjectFolderSheet folders={folders} currentFolderId="animals" selectedFolderId={null} onSelectionChange={vi.fn()} onConfirm={vi.fn()} onCreateFolder={vi.fn()} onClose={vi.fn()} />,
        {
          createNodeMock: (element) => {
            const label = (element.props as { 'aria-label'?: string })['aria-label'];
            if ((element.props as { role?: string }).role === 'dialog') return { focus: vi.fn() };
            if (label === '选择文件夹花卉') return { focus: selectedFocus };
            if (label === '选择未分类文件夹') return { focus: uncategorizedFocus };
            return {};
          },
        },
      );
    });

    expect(uncategorizedFocus).toHaveBeenCalledOnce();
    expect(selectedFocus).toHaveBeenCalledOnce();
    act(() => renderer.unmount());
  });

  it('always shows uncategorized and the new-folder action with no user folders', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = renderSheet(<MoveProjectFolderSheet folders={[]} currentFolderId="animals" selectedFolderId={null} onSelectionChange={vi.fn()} onConfirm={vi.fn()} onCreateFolder={vi.fn()} onClose={vi.fn()} />);
    });
    expect(renderer.root.findByProps({ 'aria-label': '选择未分类文件夹' })).toBeTruthy();
    expect(findButton(renderer.root, '新建文件夹')).toBeTruthy();
  });

  it('uses radio-like selection and requires explicit confirmation of a different target', () => {
    const onSelectionChange = vi.fn();
    const onConfirm = vi.fn();
    const onCreateFolder = vi.fn();
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = renderSheet(<MoveProjectFolderSheet folders={folders} currentFolderId="animals" selectedFolderId="animals" onSelectionChange={onSelectionChange} onConfirm={onConfirm} onCreateFolder={onCreateFolder} onClose={vi.fn()} />);
    });
    const current = renderer.root.findByProps({ 'aria-label': `选择文件夹${folders[0].name}` });
    const target = renderer.root.findByProps({ 'aria-label': '选择文件夹花卉' });
    const confirm = findButton(renderer.root, '移动到所选文件夹');

    expect(current.props.role).toBe('radio');
    expect(current.props['aria-checked']).toBe(true);
    expect(confirm.props.disabled).toBe(true);
    target.props.onClick();
    expect(onSelectionChange).toHaveBeenCalledWith('flowers');
    expect(onConfirm).not.toHaveBeenCalled();
    findButton(renderer.root, '新建文件夹').props.onClick();
    expect(onCreateFolder).toHaveBeenCalledOnce();
  });

  it('uses roving tab stops and direction keys to select and focus adjacent folders', () => {
    const onSelectionChange = vi.fn();
    const focusUncategorized = vi.fn();
    const focusAnimals = vi.fn();
    const focusFlowers = vi.fn();
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = renderSheet(
        <MoveProjectFolderSheet folders={folders} currentFolderId="animals" selectedFolderId="animals" onSelectionChange={onSelectionChange} onConfirm={vi.fn()} onCreateFolder={vi.fn()} onClose={vi.fn()} />,
        {
          createNodeMock: (element) => {
            const label = (element.props as { 'aria-label'?: string })['aria-label'];
            if (label === '选择未分类文件夹') return { focus: focusUncategorized };
            if (label === `选择文件夹${folders[0].name}`) return { focus: focusAnimals };
            if (label === '选择文件夹花卉') return { focus: focusFlowers };
            return {};
          },
        },
      );
    });
    const uncategorized = renderer.root.findByProps({ 'aria-label': '选择未分类文件夹' });
    const animals = renderer.root.findByProps({ 'aria-label': `选择文件夹${folders[0].name}` });
    const flowers = renderer.root.findByProps({ 'aria-label': '选择文件夹花卉' });
    const next = { key: 'ArrowDown', preventDefault: vi.fn() };
    const previous = { key: 'ArrowUp', preventDefault: vi.fn() };
    const wrapForward = { key: 'ArrowRight', preventDefault: vi.fn() };
    const wrapBackward = { key: 'ArrowLeft', preventDefault: vi.fn() };

    expect(animals.props.tabIndex).toBe(0);
    expect(uncategorized.props.tabIndex).toBe(-1);
    expect(flowers.props.tabIndex).toBe(-1);
    focusAnimals.mockClear();
    animals.props.onKeyDown(next);
    flowers.props.onKeyDown(previous);
    flowers.props.onKeyDown(wrapForward);
    uncategorized.props.onKeyDown(wrapBackward);

    expect(next.preventDefault).toHaveBeenCalledOnce();
    expect(previous.preventDefault).toHaveBeenCalledOnce();
    expect(wrapForward.preventDefault).toHaveBeenCalledOnce();
    expect(wrapBackward.preventDefault).toHaveBeenCalledOnce();
    expect(onSelectionChange).toHaveBeenNthCalledWith(1, 'flowers');
    expect(onSelectionChange).toHaveBeenNthCalledWith(2, 'animals');
    expect(onSelectionChange).toHaveBeenNthCalledWith(3, null);
    expect(onSelectionChange).toHaveBeenNthCalledWith(4, 'flowers');
    expect(focusFlowers).toHaveBeenCalledTimes(2);
    expect(focusAnimals).toHaveBeenCalledOnce();
    expect(focusUncategorized).toHaveBeenCalledOnce();
  });

  it('closes from cancel, backdrop, and Escape while content clicks stay inside when idle', () => {
    const harness = installDomHarness();
    const onClose = vi.fn();
    let renderer!: ReactTestRenderer;
    try {
      act(() => {
        renderer = renderSheet(<MoveProjectFolderSheet folders={folders} currentFolderId="animals" selectedFolderId="flowers" onSelectionChange={vi.fn()} onConfirm={vi.fn()} onCreateFolder={vi.fn()} onClose={onClose} />);
      });

      renderer.root.findByProps({ role: 'dialog' }).props.onClick({ stopPropagation: vi.fn() });
      expect(onClose).not.toHaveBeenCalled();

      findButton(renderer.root, '取消移动').props.onClick();
      expect(onClose).toHaveBeenCalledOnce();

      renderer.root.findByProps({ 'data-testid': 'project-folder-sheet-backdrop' }).props.onClick();
      expect(onClose).toHaveBeenCalledTimes(2);

      const escape = harness.pressEscape();
      expect(escape.preventDefault).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledTimes(3);
    } finally {
      act(() => renderer?.unmount());
      harness.restore();
    }
  });

  it('locks all dismiss and submit paths while move confirmation is active', async () => {
    const harness = installDomHarness();
    const request = deferred();
    const onClose = vi.fn();
    const onConfirm = vi.fn(() => request.promise);
    let renderer!: ReactTestRenderer;
    try {
      await act(async () => {
        renderer = renderSheet(<MoveProjectFolderSheet folders={folders} currentFolderId="animals" selectedFolderId="flowers" onSelectionChange={vi.fn()} onConfirm={onConfirm} onCreateFolder={vi.fn()} onClose={onClose} />);
      });
      const confirm = findButton(renderer.root, '移动到所选文件夹');
      const first = confirm.props.onClick();
      const second = confirm.props.onClick();
      renderer.root.findByProps({ 'data-testid': 'project-folder-sheet-backdrop' }).props.onClick();
      findButton(renderer.root, '取消移动').props.onClick();
      expect(harness.pressEscape().preventDefault).toHaveBeenCalledOnce();
      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
      request.resolve();
      await act(async () => { await Promise.all([first, second]); });
    } finally {
      act(() => renderer?.unmount());
      harness.restore();
    }
  });

  it('lets Escape close only the topmost stacked sheet and keeps a pending top sheet open', () => {
    const harness = installDomHarness();
    const closeLower = vi.fn();
    const closeTop = vi.fn();
    let renderer!: ReactTestRenderer;
    try {
      act(() => {
        renderer = renderSheet(
          <>
            <MoveProjectFolderSheet folders={folders} currentFolderId="animals" selectedFolderId="flowers" onSelectionChange={vi.fn()} onConfirm={vi.fn()} onCreateFolder={vi.fn()} onClose={closeLower} />
            <CreateProjectFolderSheet name="新文件夹" onNameChange={vi.fn()} onCreate={vi.fn()} onClose={closeTop} />
          </>,
        );
      });
      act(() => { harness.pressEscape(); });
      expect(closeTop).toHaveBeenCalledOnce();
      expect(closeLower).not.toHaveBeenCalled();

      act(() => {
        renderer.update(
          <>
            <MoveProjectFolderSheet folders={folders} currentFolderId="animals" selectedFolderId="flowers" onSelectionChange={vi.fn()} onConfirm={vi.fn()} onCreateFolder={vi.fn()} onClose={closeLower} />
            <CreateProjectFolderSheet name="新文件夹" onNameChange={vi.fn()} onCreate={vi.fn()} onClose={closeTop} pending />
          </>,
        );
      });
      act(() => { harness.pressEscape(); });
      expect(closeTop).toHaveBeenCalledOnce();
      expect(closeLower).not.toHaveBeenCalled();
    } finally {
      act(() => renderer?.unmount());
      harness.restore();
    }
  });

  it('keeps focus on the new-folder trigger when an uncovered move sheet resumes', () => {
    const selectedFolderFocus = vi.fn();
    const newFolderTriggerFocus = vi.fn();
    const newFolderTriggerRef = { current: { focus: newFolderTriggerFocus } as unknown as HTMLElement };
    let renderer!: ReactTestRenderer;

    act(() => {
      renderer = renderSheet(
        <>
          <MoveProjectFolderSheet covered folders={folders} currentFolderId="animals" selectedFolderId="flowers" onSelectionChange={vi.fn()} onConfirm={vi.fn()} onCreateFolder={vi.fn()} onClose={vi.fn()} />
          <CreateProjectFolderSheet name="新文件夹" onNameChange={vi.fn()} onCreate={vi.fn()} onClose={vi.fn()} returnFocusRef={newFolderTriggerRef} />
        </>,
        {
          createNodeMock: (element) => {
            const props = element.props as { 'aria-label'?: string; role?: string };
            if (props['aria-label'] === '选择文件夹花卉') return { focus: selectedFolderFocus };
            if (element.type === 'input' || props.role === 'dialog') return { focus: vi.fn() };
            return {};
          },
        },
      );
    });

    selectedFolderFocus.mockClear();
    act(() => {
      renderer.update(
        <MoveProjectFolderSheet folders={folders} currentFolderId="animals" selectedFolderId="flowers" onSelectionChange={vi.fn()} onConfirm={vi.fn()} onCreateFolder={vi.fn()} onClose={vi.fn()} />,
      );
    });

    expect(newFolderTriggerFocus).toHaveBeenCalledOnce();
    expect(selectedFolderFocus).not.toHaveBeenCalled();
  });
});

describe('project folder sheet styles', () => {
  it('uses the project flow brand for its primary action', () => {
    const styles = fs.readFileSync(path.resolve('apps/h5/src/styles.css'), 'utf8');
    const primary = styles.match(/\.project-folder-sheet-primary\s*\{([^}]*)\}/)?.[1] ?? '';
    const selected = styles.match(/\.project-folder-option\.is-selected\s*\{([^}]*)\}/)?.[1] ?? '';
    const create = [...styles.matchAll(/\.project-folder-create-option\s*\{([^}]*)\}/g)].at(-1)?.[1] ?? '';
    const focus = styles.match(/\.project-folder-sheet button:focus-visible[^\{]*\{([^}]*)\}/)?.[1] ?? '';
    const actionPrimary = styles.match(/\.project-action-tile\.is-primary\s*\{([^}]*)\}/)?.[1] ?? '';
    const actionFolderFocus = styles.match(/\.project-action-folder:focus-within\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(primary).toContain('background: var(--flow-brand, #146cff)');
    expect(primary).toContain('border-color: var(--flow-brand, #146cff)');
    expect(selected).toContain('border-color: var(--flow-brand, #146cff)');
    expect(selected).toContain('background: var(--flow-brand-soft, #eaf2ff)');
    expect(create).toContain('color: var(--flow-brand, #146cff)');
    expect(focus).toContain('outline: .0635rem solid var(--flow-brand, #146cff)');
    expect(actionPrimary).toContain('background: var(--flow-brand, #146cff)');
    expect(actionFolderFocus).toContain('border-color: var(--flow-brand, #146cff)');
  });

  it('constrains the viewport and scrolls only the options area with a safe-area footer', () => {
    const styles = fs.readFileSync(path.resolve('apps/h5/src/styles.css'), 'utf8');
    const backdrop = styles.match(/\.project-folder-sheet-backdrop\s*\{([^}]*)\}/)?.[1] ?? '';
    const shell = styles.match(/\.project-folder-sheet\s*\{([^}]*)\}/)?.[1] ?? '';
    const body = styles.match(/\.project-folder-sheet-body\s*\{([^}]*)\}/)?.[1] ?? '';
    const options = styles.match(/\.project-folder-options\s*\{([^}]*)\}/)?.[1] ?? '';
    const footer = styles.match(/\.project-folder-sheet-footer\s*\{([^}]*)\}/)?.[1] ?? '';
    const name = styles.match(/\.project-folder-option-name\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(backdrop).toContain('z-index: 920');
    expect(shell).toContain('width: min(calc(100% - 0.7619rem), var(--sheet-width))');
    expect(shell).toContain('max-height: min(86dvh, 24.127rem)');
    expect(shell).toContain('overflow: hidden');
    expect(body).not.toContain('overflow-y: auto');
    expect(options).toContain('overflow-y: auto');
    expect(options).toContain('min-width: 0');
    expect(footer).toContain('env(safe-area-inset-bottom)');
    expect(footer).toContain('flex: 0 0 auto');
    expect(name).toContain('overflow: hidden');
    expect(name).toContain('text-overflow: ellipsis');
  });
});
