"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { FolderOutput, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

export type MoveToAreaOption = {
  _id: Id<"startupAreas">;
  label: string;
};

/**
 * Eksplicitno premeštanje oblačića u drugu oblast — ista mutacija kao
 * prevlačenje u sidebar-u, ali dostupna i bez drag-and-drop-a (touch, meniji).
 * Cross-area premeštanje uvek sleće u koren ciljne oblasti; ugnežđivanje posle
 * ide kroz postojeći „Ugneždi u…” tok.
 */
export function MoveToAreaMenu({
  startupId,
  pageId,
  pageTitle,
  currentAreaId,
  areas,
  className,
  compact = false,
  asSubmenu = false,
  onMoved,
}: {
  startupId: Id<"startups">;
  pageId: Id<"pages">;
  pageTitle: string;
  currentAreaId: Id<"startupAreas">;
  areas: MoveToAreaOption[];
  className?: string;
  compact?: boolean;
  /** Renderuje stavke kao podmeni postojećeg dropdown-a umesto samostalnog dugmeta. */
  asSubmenu?: boolean;
  onMoved?: (targetAreaId: Id<"startupAreas">) => void;
}) {
  const movePage = useMutation(api.areasV2.movePage);
  const [busyAreaId, setBusyAreaId] = useState<Id<"startupAreas"> | null>(null);

  const targets = areas.filter((area) => area._id !== currentAreaId);

  async function moveTo(target: MoveToAreaOption) {
    if (busyAreaId !== null) return;
    setBusyAreaId(target._id);
    try {
      const result = await movePage({
        startupId,
        pageId,
        targetAreaId: target._id,
        targetParentPageId: null,
      });
      if (result.nestingStatus === "pending") {
        toast.info(
          "Zahtev je poslat autoru roditeljske stranice. Premeštanje čeka odobrenje.",
        );
      } else {
        toast.success(
          `„${pageTitle || "Stavka bez naslova"}“ je premeštena u „${target.label}“.`,
        );
      }
      onMoved?.(target._id);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Stavka nije premeštena.",
      );
    } finally {
      setBusyAreaId(null);
    }
  }

  const items = targets.map((target) => (
    <DropdownMenuItem
      key={target._id}
      disabled={busyAreaId !== null}
      onSelect={() => void moveTo(target)}
    >
      {busyAreaId === target._id ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <FolderOutput className="size-4" aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1 truncate">{target.label}</span>
    </DropdownMenuItem>
  ));

  if (asSubmenu) {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger disabled={targets.length === 0}>
          <FolderOutput className="size-4" aria-hidden="true" />
          Premesti u oblast
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="max-h-72 w-56 overflow-y-auto">
          {items}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn(compact && "h-8 gap-1.5 rounded-lg px-2.5 text-xs", className)}
          disabled={targets.length === 0 || busyAreaId !== null}
          aria-label={`Premesti ${pageTitle || "stavku bez naslova"} u drugu oblast`}
        >
          {busyAreaId !== null ? (
            <LoaderCircle
              className={cn("animate-spin", compact && "size-3.5")}
              aria-hidden="true"
            />
          ) : (
            <FolderOutput className={cn(compact && "size-3.5")} aria-hidden="true" />
          )}
          {compact ? "Premesti" : "Premesti u…"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-72 w-[min(18rem,calc(100vw-2rem))] overflow-y-auto"
      >
        <DropdownMenuLabel>Izaberi ciljnu oblast</DropdownMenuLabel>
        {items}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
