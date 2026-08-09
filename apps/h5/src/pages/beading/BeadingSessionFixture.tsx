import { useMemo, useState } from 'react';
import { MARD_221_COLORS, type Cell } from '@qiaoqiaole/core';
import type { BeadingSession } from '../../beading/beadingSessionClient';
import { BeadingSessionPage } from './BeadingSessionPage';

const ROWS = 27;
const COLS = 27;
const DISPLAY_CODES = ['C4', 'A14', 'C5', 'G6', 'H7', 'C3', 'B7', 'A4'] as const;
const COMPLETED_CODES = ['A14', 'C5', 'G6', 'B7'];
const paletteByCode = new Map<string, string>(MARD_221_COLORS.map(({ code, hex }) => [code, hex]));
const codeByColor = new Map<string, string>(MARD_221_COLORS.map(({ code, hex }) => [hex.toLowerCase(), code]));

function color(code: string): string {
  return paletteByCode.get(code) ?? '#000000';
}

function fixtureCodeAt(x: number, y: number): string {
  if (x === 0 && y === 0) return 'C4';
  if (y >= 20 && y <= 22 && Math.abs(x - 13) <= 10 - (y - 20) * 2) return 'C4';
  if ((y === 19 && (x <= 1 || x >= 25)) || (y === 23 && x === 13) || (y === 25 && (x === 11 || x === 15))) return 'C4';
  if (y === 18 && x >= 9 && x <= 17) return x % 2 === 0 ? 'G6' : 'H7';
  if (x === 19 && y >= 1 && y <= 17 && y % 3 === 0) return 'A14';
  if ((x + y) % 31 === 0) return 'C5';
  if ((x * 3 + y * 5) % 47 === 0) return 'C3';
  if ((x + y) % 23 === 0) return 'A4';
  return 'H7';
}

function createFixtureCells(): Cell[] {
  return Array.from({ length: ROWS * COLS }, (_, index) => {
    const x = index % COLS;
    const y = Math.floor(index / COLS);
    return { x, y, color: color(fixtureCodeAt(x, y)) };
  });
}

function createFixtureSession(cells: readonly Cell[]): BeadingSession {
  const counts = new Map(DISPLAY_CODES.map((code) => [code, 0]));
  cells.forEach((cell) => {
    const code = codeByColor.get(cell.color.toLowerCase());
    if (code && counts.has(code as typeof DISPLAY_CODES[number])) {
      counts.set(code as typeof DISPLAY_CODES[number], (counts.get(code as typeof DISPLAY_CODES[number]) ?? 0) + 1);
    }
  });
  return {
    id: 'visual-fixture-session',
    projectId: 'visual-fixture-project',
    projectName: '移动端拼豆视觉回归',
    requirements: DISPLAY_CODES.map((code) => ({ colorCode: code, required: counts.get(code) ?? 0 })),
    warehouseId: 'visual-fixture-warehouse',
    warehouseName: '测试库存',
    status: 'in_progress',
    completedColorCodes: COMPLETED_CODES,
    progress: { completed: COMPLETED_CODES.length, total: DISPLAY_CODES.length, percent: 50 },
    elapsedSeconds: 142,
    timerStartedAt: null,
    inventoryDeducted: false,
    version: 1,
  };
}

export function BeadingSessionFixture() {
  const cells = useMemo(createFixtureCells, []);
  const [session] = useState(() => createFixtureSession(cells));
  const resolveSession = () => Promise.resolve(session);

  return <BeadingSessionPage
    session={session}
    cells={cells}
    rows={ROWS}
    cols={COLS}
    getCode={(hex) => codeByColor.get(hex.toLowerCase()) ?? ''}
    onPatch={resolveSession}
    onPause={resolveSession}
    onReturnToProgress={resolveSession}
    onAbandon={resolveSession}
    onPrepareCompletion={resolveSession}
    onComplete={resolveSession}
    onResume={resolveSession}
    onOpenInventory={() => Promise.resolve()}
    onExit={() => undefined}
    onSessionConflict={() => undefined}
    draftOwnerId="visual-fixture-owner"
    onStatus={() => undefined}
  />;
}
