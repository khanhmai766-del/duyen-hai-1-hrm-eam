"use client";

import type { ReactNode } from "react";
import { PeakModeNotice } from "@/components/shared/peak-mode-notice";
import { usePeakMode } from "@/hooks/usePeakMode";

export function PeakProtectedRoute({ children }: { children: ReactNode }) {
  const peakMode = usePeakMode();

  if (peakMode.restrictHeavyRoutes) {
    return <PeakModeNotice activeWindow={peakMode.activeWindow} />;
  }

  return <>{children}</>;
}
