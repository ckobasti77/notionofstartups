"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import {
  FolderInput,
  LoaderCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { pageKindMeta, type PageKind } from "@/lib/page-kinds";
import { cn } from "@/lib/utils";

export type NestingTargetOption = {
  pageId: Id<"pages">;
  title: string;
  kind: PageKind;
};

export function NestingTargetMenu({
  startupId,
  childPageId,
  childTitle,
  candidates,
  className,
  compact = false,
}: {
  startupId: Id<"startups">;
  childPageId: Id<"pages">;
  childTitle: string;
  candidates: NestingTargetOption[];
  className?: string;
  compact?: boolean;
}) {
  const requestNesting = useMutation(api.areasV2.requestNesting);
  const [busyTargetId, setBusyTargetId] = useState<Id<"pages"> | null>(null);

  async function nestInto(target: NestingTargetOption) {
    if (busyTargetId !== null) return;
    setBusyTargetId(target.pageId);
    try {
      const result = await requestNesting({
        startupId,
        childPageId,
        targetParentPageId: target.pageId,
      });
      toast.success(
        result.nestingStatus === "pending"
          ? `Zahtev za ugnežđavanje u „${target.title || "stavku bez naslova"}“ je poslat autoru.`
          : `„${childTitle || "Stavka bez naslova"}“ je ugnežđena u „${target.title || "stavku bez naslova"}“.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Stavka nije ugnežđena.",
      );
    } finally {
      setBusyTargetId(null);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn(
            "h-8 gap-1.5 rounded-lg px-2.5 text-xs",
            className,
          )}
          disabled={candidates.length === 0 || busyTargetId !== null}
          aria-label={`Ugneždi ${childTitle || "stavku bez naslova"} u drugu karticu`}
        >
          {busyTargetId !== null ? (
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <FolderInput className="size-3.5" aria-hidden="true" />
          )}
          {compact ? "Ugneždi" : "Ugneždi u…"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-72 w-[min(20rem,calc(100vw-2rem))] overflow-y-auto"
      >
        <DropdownMenuLabel>Izaberi roditeljsku karticu</DropdownMenuLabel>
        {candidates.map((candidate) => {
          const Icon =
            pageKindMeta(candidate.kind).icon;
          return (
            <DropdownMenuItem
              key={candidate.pageId}
              disabled={busyTargetId !== null}
              onSelect={() => void nestInto(candidate)}
            >
              <Icon className="size-4" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">
                {candidate.title || "Bez naslova"}
              </span>
              <span className="text-[0.6875rem] text-muted-foreground">
                {pageKindMeta(candidate.kind).label}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
