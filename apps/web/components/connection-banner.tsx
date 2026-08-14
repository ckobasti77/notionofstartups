"use client";

import { useEffect, useState } from "react";
import { useConvexConnectionState } from "convex/react";
import { WifiOff } from "lucide-react";

/**
 * Pukla veza ka Convexu NE baca grešku — upiti samo večno „učitavaju", pa je
 * jedini pošten signal ovaj baner (server greške idu kroz error boundary-je,
 * ne ovuda). Kratak prag guši treptaj pri prvom povezivanju i mikro-prekidima.
 */
const SHOW_DELAY_MS = 3_000;

export function ConnectionBanner() {
  const connection = useConvexConnectionState();
  const disconnected = !connection.isWebSocketConnected;
  // `armed` se pali tek posle praga; render kapija je `disconnected && armed`,
  // pa povratak veze skida baner bez setState-a u telu efekta (lint pravilo).
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!disconnected) return;
    const id = window.setTimeout(() => setArmed(true), SHOW_DELAY_MS);
    return () => {
      window.clearTimeout(id);
      setArmed(false);
    };
  }, [disconnected]);

  if (!disconnected || !armed) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[95] flex justify-center px-3 pt-2">
      <span
        role="status"
        className="pointer-events-auto flex items-center gap-2 rounded-full border border-amber-500/30 bg-card/95 px-4 py-2 text-xs font-medium text-amber-700 shadow-[var(--shadow-desk)] backdrop-blur dark:text-amber-300"
      >
        <WifiOff className="size-3.5" aria-hidden="true" />
        Veza sa serverom je prekinuta — pokušavam ponovo…
      </span>
    </div>
  );
}
