import type { ReactNode } from 'react';
import H5Application from './H5Application';
import { AppOverlayHost } from './overlays/AppOverlayHost';
import { AppOverlayProvider } from './overlays/AppOverlayContext';

export type H5AppShellProps = {
  /**
   * Test seam for mounting alternate routed content under the durable overlays.
   */
  legacyContent?: ReactNode;
};

export function H5AppShell({ legacyContent }: H5AppShellProps) {
  return (
    <AppOverlayProvider>
      <div data-testid="h5-app-shell">
        <div data-testid="h5-app-routed-content">
          {legacyContent ?? <H5Application />}
        </div>
        <AppOverlayHost />
      </div>
    </AppOverlayProvider>
  );
}
