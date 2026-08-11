import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
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
  it('uses the standard bottom-sheet scale with a compact action grid', () => {
    const styles = fs.readFileSync(path.resolve('apps/h5/src/styles.css'), 'utf8');
    const actionSheet = styles.match(/\.project-action-sheet\s*\{([^}]*)\}/)?.[1] ?? '';
    const actionTile = styles.match(/\.project-action-tile\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(actionSheet).toContain('padding: 10px 18px');
    expect(actionSheet).toContain('border-radius: 24px 24px 0 0');
    expect(actionTile).toContain('min-height: 78px');
    expect(actionTile).toContain('border-radius: 14px');
  });

  it('renders consistent action buttons with project icons and isolated callbacks', () => {
    const onClose = vi.fn();
    const onStart = vi.fn();
    const onEdit = vi.fn();
    const onShare = vi.fn();
    const onDelete = vi.fn();
    const onMove = vi.fn();
    const sheet = ProjectActionSheet({ project, hasSession: false, onClose, onStart, onEdit, onShare, onDelete, folders: [{ id: 'animals', name: '动物', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' }], onMove });
    const markup = renderToStaticMarkup(sheet);

    expect(markup).toContain('beading-sheet-backdrop');
    expect(markup).toContain('beading-sheet project-action-sheet');
    expect(markup).toContain('开始拼豆');
    expect(markup).toContain('编辑作品');
    expect(markup).toContain('分享作品');
    expect(markup).toContain('删除作品');
    expect(markup).toContain('移动到文件夹');
    expect(markup).toContain('移动到：动物');
    expect(markup).toContain('project-action-grid');
    const expectedIconClasses = ['lucide-circle-play', 'lucide-pencil', 'lucide-share-2', 'lucide-trash-2'];
    for (const iconClass of expectedIconClasses) {
      const iconMarkup = markup.match(new RegExp(`<svg(?=[^>]*class="[^"]*\\b${iconClass}\\b[^"]*")(?=[^>]*aria-hidden="true")[^>]*>`, 'g')) ?? [];
      expect(iconMarkup).toHaveLength(1);
    }

    const startButton = findButton(sheet, '开始拼豆');
    const editButton = findButton(sheet, '编辑作品');
    const shareButton = findButton(sheet, '分享作品');
    const deleteButton = findButton(sheet, '删除作品');
    expect(startButton.props.className).toContain('project-action-tile');
    expect(startButton.props.className).toContain('is-primary');
    expect(editButton.props.className).toContain('project-action-tile');
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
  });
});
