import { MARD_221_COLORS } from './mard221.mjs';

const MARD_221_CODES = new Set(MARD_221_COLORS.map(({ code }) => code));
const MAX_MARD_NUMBER = Math.max(...MARD_221_COLORS.map(({ code }) => Number(code.slice(1))));
const MARD_221_CODE_BY_HEX = new Map(MARD_221_COLORS.map(({ code, hex }) => [hex.toUpperCase(), code]));

export function isValidMard221Code(value) {
  if (typeof value !== 'string') return false;
  return MARD_221_CODES.has(value.trim().toUpperCase());
}

export function normalizeMardColorCode(value) {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (isValidMard221Code(normalized)) return normalized;
  const exactCode = MARD_221_CODE_BY_HEX.get(normalized);
  if (exactCode) return exactCode;
  if (!/^#[0-9A-F]{6}$/.test(normalized)) return normalized;
  const target = [1, 3, 5].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16));
  return MARD_221_COLORS.reduce((closest, color) => {
    const channels = [1, 3, 5].map((offset) => Number.parseInt(color.hex.slice(offset, offset + 2), 16));
    const distance = channels.reduce((sum, channel, index) => sum + (channel - target[index]) ** 2, 0);
    return distance < closest.distance ? { code: color.code, distance } : closest;
  }, { code: normalized, distance: Number.POSITIVE_INFINITY }).code;
}

export function aggregateBeadRequirements(entries) {
  const totals = new Map();
  for (const entry of entries ?? []) {
    const colorCode = normalizeMardColorCode(entry?.colorCode ?? entry?.color);
    const rawCount = entry?.required ?? entry?.count;
    const count = rawCount === undefined ? 1 : Number(rawCount);
    if (!isValidMard221Code(colorCode)) {
      throw new Error(`Invalid MARD 221 color code: ${colorCode || '(empty)'}`);
    }
    if (!Number.isInteger(count) || count <= 0) {
      throw new Error(`Bead count must be positive for ${colorCode}`);
    }
    totals.set(colorCode, (totals.get(colorCode) ?? 0) + count);
  }
  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([colorCode, required]) => ({ colorCode, required }));
}

export function calculateInventoryDiff(requirements, availableByColor = {}) {
  const items = requirements.map(({ colorCode, required }) => {
    const available = Math.max(0, Number(availableByColor[colorCode] ?? 0));
    const missing = Math.max(0, required - available);
    return { colorCode, required, available, missing, sufficient: missing === 0 };
  });
  const summary = items.reduce((result, item) => ({
    required: result.required + item.required,
    available: result.available + item.available,
    missing: result.missing + item.missing,
    sufficient: result.sufficient && item.sufficient,
  }), { required: 0, available: 0, missing: 0, sufficient: true });
  return { items, summary };
}

export function calculateCompletionProgress(colorCodes, completedColorCodes) {
  const total = new Set(colorCodes).size;
  const completed = [...new Set(completedColorCodes)].filter((code) => colorCodes.includes(code)).length;
  return { completed, total, percent: total === 0 ? 0 : Math.floor((completed / total) * 100) };
}

const transitions = {
  in_progress: {
    pause: 'paused',
    prepare_completion: 'pending_completion',
    abandon: 'abandoned',
  },
  paused: {
    resume: 'in_progress',
    prepare_completion: 'pending_completion',
    abandon: 'abandoned',
  },
  pending_completion: {
    return_to_progress: 'paused',
    complete_without_deduction: 'completed_without_deduction',
    complete_with_deduction: 'completed_deducted',
    abandon: 'abandoned',
  },
  abandoned: { abandon: 'abandoned' },
  completed_deducted: {},
  completed_without_deduction: {},
};

export function transitionBeadingSession(currentState, action) {
  const nextState = transitions[currentState]?.[action];
  if (!nextState) throw new Error(`Invalid transition: ${currentState} -> ${action}`);
  return nextState;
}

export { MAX_MARD_NUMBER };
