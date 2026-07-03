"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { activeCheckInPeakWindow, isPeakModeBypassUser } from "@/lib/peak-mode";

export function usePeakMode() {
  const { data: session } = useSession();
  const [now, setNow] = React.useState(() => new Date());

  React.useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = window.setInterval(tick, 30 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const activeWindow = React.useMemo(() => activeCheckInPeakWindow(now), [now]);
  const canBypass = isPeakModeBypassUser({
    role: session?.user?.role,
    position: session?.user?.position,
    currentPosition: session?.user?.currentPosition,
    secondaryPosition: session?.user?.secondaryPosition,
  });

  return {
    activeWindow,
    isPeakMode: Boolean(activeWindow),
    canBypass,
    restrictHeavyRoutes: Boolean(activeWindow) && !canBypass,
  };
}
