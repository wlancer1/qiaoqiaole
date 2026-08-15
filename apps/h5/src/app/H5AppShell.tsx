import type { ReactNode } from 'react';
import H5App from '../H5App';

export type H5AppShellProps = {
  /**
   * Temporary seam for migrating feature boundaries out of the legacy coordinator.
   * Production uses H5App until each routed feature owns its own implementation.
   */
  legacyContent?: ReactNode;
};

export function H5AppShell({ legacyContent }: H5AppShellProps) {
  return (
    <div data-testid="h5-app-shell">
      <div data-testid="h5-app-routed-content">
        {legacyContent ?? <H5App />}
      </div>
      <div data-testid="h5-app-overlay-slot" />
    </div>
  );
}
