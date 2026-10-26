"use client";

import { Lock } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { LOCK_NOTICE, lockedByLabel } from "./collab-model";

/**
 * Oznaka „Zaključano" (K07 §6.3): ikonica i reč; ko i kada u opisu (tooltip i
 * ime za čitač ekrana). Fokusabilna, da opis stigne i sa tastature.
 */
export function LockBadge({
  lockedByName,
  lockedAt,
  now,
  className,
}: {
  lockedByName: string | null;
  lockedAt: number | null;
  now: number;
  className?: string;
}) {
  const detail = lockedByLabel({ lockedByName, lockedAt, now });
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-label={`Zaključano. ${detail}`}
          className={cn(
            "inline-flex items-center gap-1 rounded-md text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          <Lock className="size-3.5" aria-hidden="true" />
          Zaključano
        </span>
      </TooltipTrigger>
      <TooltipContent>{detail}</TooltipContent>
    </Tooltip>
  );
}

/** Traka ispod naslova kad je stranica zaključana, a gledalac ne sme da je menja. */
export function LockNotice({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm leading-6 text-muted-foreground",
        className,
      )}
    >
      <Lock className="mt-1 size-4 shrink-0" aria-hidden="true" />
      <span>{LOCK_NOTICE}</span>
    </p>
  );
}
