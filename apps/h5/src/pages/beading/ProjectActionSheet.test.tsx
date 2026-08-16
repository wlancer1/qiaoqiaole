import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ProjectActionSheet } from './ProjectActionSheet';
import type { RecentProject } from '../../shared/h5Types';

type TestElement = ReactElement<{ children?: ReactNode; className?: string; onClick?: () => void }>;

const project: RecentProject = {
  id: 'p1',
  name: '小熊',
  rows: 32,
  cols: 32,
  tone: 'recent-bear',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

function childElements(node: ReactNode): TestElement[] {
  return Children.toArray(node).filter(isValidElement) as TestElement[];
}

function collectElements(node: ReactNode): TestElement[] {
  if (!isValidElement(node)) return [];
  const element = node as TestElement;
  return [element, ...childElements(element.props.children).flatMap(collectElements)];
}

function textContent(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map((child) => textContent(child)).join('');
  if (isValidElement(node)) return textContent((node as TestElement).props.children);
  return Children.toArray(node).map((child) => textContent(child)).join('');
}

function findButton(root: ReactNode, label: string): TestElement {
  const button = collectElements(root).find((element) => element.type === 'button' && textContent(element.props.children).includes(label));
  if (!button) throw new Error(`button not found: ${label}`);
  return button;
}

describe('ProjectActionSheet', () => {
  it('matches the established bottom-sheet structure instead of inheriting legacy beading layout', () => {
    const styles = fs.readFileSync(path.resolve('apps/h5/src/styles.css'), 'utf8');
    const actionModal = styles.match(/\.project-action-modal\s*\{([^}]*)\}/)?.[1] ?? '';
    const confirmBackdrop = styles.match(/\.confirm-dialog-backdrop\s*\{([^}]*)\}/)?.[1] ?? '';
    const actionSheet = styles.match(/\.project-action-sheet\s*\{([^}]*)\}/)?.[1] ?? '';
    const actionHandle = styles.match(/\.project-action-sheet \.beading-sheet-handle\s*\{([^}]*)\}/)?.[1] ?? '';
    const actionClose = styles.match(/\.project-action-close\s*\{([^}]*)\}/)?.[1] ?? '';
    const actionTile = styles.match(/\.project-action-tile\s*\{([^}]*)\}/)?.[1] ?? '';
    const dangerTile = styles.match(/\.project-action-tile\.is-danger\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(actionModal).toContain('z-index: 800');
    expect(confirmBackdrop).toContain('z-index: 1000');
    expect(actionModal).toContain('background: var(--sheet-backdrop)');
    expect(actionModal).toContain('justify-content: center');
    expect(actionModal).toContain('backdrop-filter: blur(.1905rem)');
    expect(actionSheet).toContain('position: relative');
    expect(actionSheet).toContain('display: grid');
    expect(actionSheet).toContain('animation: modal-sheet-in 220ms cubic-bezier(.2, .85, .35, 1)');
    expect(actionSheet).toContain('width: min(calc(100% - 0.7619rem), var(--sheet-width))');
    expect(actionSheet).toContain('border-radius: var(--sheet-radius) var(--sheet-radius) 0 0');
    expect(actionSheet).toContain('box-shadow: var(--sheet-shadow)');
    expect(actionHandle).toContain('position: absolute');
    expect(actionHandle).toContain('width: 1.2063rem');
    expect(actionHandle).toContain('margin: 0');
    expect(actionClose).toContain('background: transparent');
    expect(actionClose).toContain('color: var(--muted)');
    expect(actionTile).toContain('min-height: 2.2857rem');
    expect(actionTile).toContain('border-radius: .4444rem');
    expect(actionTile).toContain('font-size: .4444rem');
    expect(actionTile).toContain('background: var(--panel)');
    expect(actionTile).toContain('color: var(--ink)');
    expect(dangerTile).toContain('border-color: #d6455d');
    expect(dangerTile).toContain('color: #d6455d');
  });

  it('renders consistent action buttons with project icons and isolated callbacks', () => {
    const onClose = vi.fn();
    const onStart = vi.fn();
    const onEdit = vi.fn();
    const onShare = vi.fn();
    const onDelete = vi.fn();
    const onMove = vi.fn();
    const sheet = ProjectActionSheet({ project, hasSession: false, onClose, onStart, onEdit, onShare, onDelete, onMove });
    const markup = renderToStaticMarkup(sheet);

    expect(markup).toContain('beading-sheet-backdrop');
    expect(markup).toContain('beading-sheet project-action-sheet');
    expect(markup).toContain('开始拼豆');
    expect(markup).toContain('编辑作品');
    expect(markup).toContain('分享作品');
    expect(markup).toContain('删除作品');
    expect(markup).toContain('移动到文件夹');
    expect(markup).not.toContain('<select');
    expect(markup).toContain('project-action-grid');
    expect(markup).toContain('project-action-close');
    const expectedIconClasses = ['lucide-circle-play', 'lucide-pencil', 'lucide-folder-input', 'lucide-share-2', 'lucide-trash-2'];
    for (const iconClass of expectedIconClasses) {
      const iconMarkup = markup.match(new RegExp(`<svg(?=[^>]*class="[^"]*\\b${iconClass}\\b[^"]*")(?=[^>]*aria-hidden="true")[^>]*>`, 'g')) ?? [];
      expect(iconMarkup).toHaveLength(1);
    }
    expect(markup.match(/<svg(?=[^>]*class="[^"]*\blucide-x\b[^"]*")(?=[^>]*aria-hidden="true")[^>]*>/g)).toHaveLength(1);

    const startButton = findButton(sheet, '开始拼豆');
    const editButton = findButton(sheet, '编辑作品');
    const moveButton = findButton(sheet, '移动到文件夹');
    const shareButton = findButton(sheet, '分享作品');
    const deleteButton = findButton(sheet, '删除作品');
    expect(startButton.props.className).toContain('project-action-tile');
    expect(startButton.props.className).toContain('is-primary');
    expect(editButton.props.className).toContain('project-action-tile');
    expect(moveButton.props.className).toContain('project-action-tile');
    expect(shareButton.props.className).toContain('project-action-tile');
    expect(deleteButton.props.className).toContain('project-action-tile');
    expect(deleteButton.props.className).toContain('is-danger');

    startButton.props.onClick?.();
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(0);
    expect(onShare).toHaveBeenCalledTimes(0);
    expect(onDelete).toHaveBeenCalledTimes(0);

    editButton.props.onClick?.();
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onShare).toHaveBeenCalledTimes(0);
    expect(onDelete).toHaveBeenCalledTimes(0);

    shareButton.props.onClick?.();
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(0);

    deleteButton.props.onClick?.();
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledTimes(0);
    expect(onClose).not.toHaveBeenCalled();

    moveButton.props.onClick?.();
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenLastCalledWith();
    expect(onClose).not.toHaveBeenCalled();
  });
});
