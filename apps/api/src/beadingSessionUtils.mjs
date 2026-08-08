const MAX_MARD_NUMBER = 14;

export function isValidMard221Code(value) {
  if (typeof value !== 'string') return false;
  const match = /^([A-Z])([1-9]|1[0-4])$/.exec(value.trim().toUpperCase());
  return Boolean(match);
}

export function aggregateBeadRequirements(entries) {
  const totals = new Map();
  for (const entry of entries ?? []) {
    const colorCode = String(entry?.colorCode ?? entry?.color ?? '').trim().toUpperCase();
    const count = Number(entry?.required ?? entry?.count);
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
