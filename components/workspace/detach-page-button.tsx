"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { FolderOutput, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

export function DetachPageButton({
  startupId,
  pageId,
  title,
  compact = false,
  className,
}: {
  startupId: Id<"startups">;
  pageId: Id<"pages">;
  title: string;
  compact?: boolean;
  className?: string;
}) {
  const detachPage = useMutation(api.areasV2.detachPage);
  const [busy, setBusy] = useState(false);

  async function detach() {
    if (busy) return;
    if (
      !window.confirm(
        `Odvojiti „${title || "stavku bez naslova"}“ od roditelja i vratiti je u koren oblasti?`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const result = await detachPage({ startupId, pageId });
      if (result.status !== "detached") {
        throw new Error("Stavka više nije ugnežđena.");
      }
      toast.success("Stavka je odvojena i vraćena u koren oblasti.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Stavka nije odvojena.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className={cn(
        "h-8 gap-1.5 rounded-lg px-2.5 text-xs",
        className,
      )}
      disabled={busy}
      aria-label={`Odvoji ${title || "stavku bez naslova"} u koren oblasti`}
      onClick={() => void detach()}
    >
      {busy ? (
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <FolderOutput className="size-3.5" aria-hidden="true" />
      )}
      {compact ? "Odvoji" : "Odvoji u oblast"}
    </Button>
  );
}
