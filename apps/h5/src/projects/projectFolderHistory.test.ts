import { describe, expect, it } from 'vitest';
import { consumeProjectFolderHistorySentinel, ensureProjectFolderHistorySentinel, isProjectFolderHistorySentinel, resolveProjectFolderHistoryPop } from './projectFolderHistory';

type Entry = { state: unknown; url: string };

function createHistoryHarness(initialState: unknown = { page: 'my-works' }) {
  const entries: Entry[] = [{ state: initialState, url: '/h5' }];
  let index = 0;
  return {
    get state() { return entries[index].state; },
    get length() { return entries.length; },
    pushState(state: unknown, _unused: string, url?: string | URL | null) {
      entries.splice(index + 1);
      entries.push({ state, url: String(url ?? '/h5') });
      index += 1;
    },
    back() { if (index > 0) index -= 1; },
  };
}

describe('project folder history sentinel', () => {
  it('adds exactly one same-document sentinel and consumes it only when the final sheet closes', () => {
    const history = createHistoryHarness();
    expect(ensureProjectFolderHistorySentinel(history, '/h5')).toBe(true);
    expect(ensureProjectFolderHistorySentinel(history, '/h5')).toBe(false);
    expect(history.length).toBe(2);
    expect(isProjectFolderHistorySentinel(history.state)).toBe(true);

    expect(consumeProjectFolderHistorySentinel(history)).toBe(true);
    expect(history.length).toBe(2);
    expect(isProjectFolderHistorySentinel(history.state)).toBe(false);
    expect(consumeProjectFolderHistorySentinel(history)).toBe(false);
  });

  it('closes only the top layer on browser Back and retains the sentinel while a lower layer or request remains', () => {
    expect(resolveProjectFolderHistoryPop({ createOpen: true, createPending: false, moveOpen: true, movePending: false })).toEqual({ close: 'create', retainSentinel: true });
    expect(resolveProjectFolderHistoryPop({ createOpen: true, createPending: true, moveOpen: true, movePending: false })).toEqual({ close: null, retainSentinel: true });
    expect(resolveProjectFolderHistoryPop({ createOpen: false, createPending: false, moveOpen: true, movePending: false })).toEqual({ close: 'move', retainSentinel: false });
  });
});
