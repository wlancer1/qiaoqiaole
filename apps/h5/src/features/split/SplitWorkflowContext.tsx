import { createContext, useContext } from 'react';

export type SplitWorkflowCommands = {
  upload: (file: File | undefined) => Promise<void>;
  clear: () => void;
};

export const SplitWorkflowContext = createContext<SplitWorkflowCommands | null>(null);

export function useSplitWorkflowCommands() {
  const commands = useContext(SplitWorkflowContext);
  if (!commands) throw new Error('SplitWorkflowProvider is required');
  return commands;
}
