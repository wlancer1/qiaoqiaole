import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ConfirmDialogRequest } from '../../shared/ConfirmDialog';

export const appOverlaySlotNames = [
  'login',
  'profile',
  'save',
  'saveLoginPrompt',
  'share',
  'folder',
  'projectAction',
  'inventory',
  'warehouse',
] as const;

export type AppOverlaySlotName = (typeof appOverlaySlotNames)[number];
export type AppOverlaySlots = Partial<Record<AppOverlaySlotName, ReactNode>>;

type AppOverlayCommandContextValue = {
  openConfirm: (request: ConfirmDialogRequest) => void;
  closeConfirm: (id?: number) => void;
  setOverlaySlot: (name: AppOverlaySlotName, content: ReactNode | null) => void;
};

type AppOverlayStateContextValue = {
  confirmRequest: { id: number; request: ConfirmDialogRequest } | null;
  slots: AppOverlaySlots;
};

const AppOverlayCommandContext = createContext<AppOverlayCommandContextValue | null>(null);
const AppOverlayStateContext = createContext<AppOverlayStateContextValue | null>(null);

export function AppOverlayProvider({ children }: { children: ReactNode }) {
  const [confirmRequest, setConfirmRequest] = useState<{ id: number; request: ConfirmDialogRequest } | null>(null);
  const [slots, setSlots] = useState<AppOverlaySlots>({});
  const nextConfirmId = useRef(0);

  const openConfirm = useCallback((request: ConfirmDialogRequest) => {
    nextConfirmId.current += 1;
    setConfirmRequest({ id: nextConfirmId.current, request });
  }, []);
  const closeConfirm = useCallback((id?: number) => {
    setConfirmRequest((current) => !current || (id !== undefined && current.id !== id) ? current : null);
  }, []);
  const setOverlaySlot = useCallback((name: AppOverlaySlotName, content: ReactNode | null) => {
    setSlots((current) => {
      if (content === null) {
        if (!(name in current)) return current;
        const { [name]: _removed, ...remaining } = current;
        return remaining;
      }
      return { ...current, [name]: content };
    });
  }, []);
  const commands = useMemo(() => ({ openConfirm, closeConfirm, setOverlaySlot }), [closeConfirm, openConfirm, setOverlaySlot]);
  const state = useMemo(() => ({ confirmRequest, slots }), [confirmRequest, slots]);

  return <AppOverlayCommandContext.Provider value={commands}>
    <AppOverlayStateContext.Provider value={state}>{children}</AppOverlayStateContext.Provider>
  </AppOverlayCommandContext.Provider>;
}

export function useAppOverlay(): AppOverlayCommandContextValue {
  const context = useContext(AppOverlayCommandContext);
  if (!context) throw new Error('useAppOverlay 必须在 AppOverlayProvider 内使用');
  return context;
}

export function useAppOverlayState(): AppOverlayStateContextValue {
  const context = useContext(AppOverlayStateContext);
  if (!context) throw new Error('useAppOverlayState 必须在 AppOverlayProvider 内使用');
  return context;
}
