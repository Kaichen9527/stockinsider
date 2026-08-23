'use client';

import type { ReactNode } from 'react';

export function HydrationSafeHome({ children }: { children: ReactNode }) {
  // Render cards in the first response. The former client-only shell made the
  // no-JS page look empty and hid checksum-valid last-good research.
  return <>{children}</>;
}
