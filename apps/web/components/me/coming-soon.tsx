import type { ComponentType } from "react";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/workspace/workspace-ui";

export type ComingSoonProps = {
  /** Naslov prikaza (h1), npr. „Moji zadaci". */
  title: string;
  icon: ComponentType<{ className?: string }>;
  /** Kako se do tada stiže do istog sadržaja u startupu. */
  description: string;
  actionLabel: string;
  onAction: () => void;
};

/**
 * Privremeni prikaz ličnog nivoa (K08) dok ga pravi korak iz para: K11
 * (Moji zadaci), K14 (Inbox), K15 (Poruke). Vodi na isti sadržaj u startupu.
 */
export function ComingSoon({ title, icon, description, actionLabel, onAction }: ComingSoonProps) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-7 lg:px-8 lg:py-8">
      <h1 data-workspace-enter className="text-2xl font-bold tracking-[-0.035em] sm:text-3xl">
        {title}
      </h1>
      <div data-workspace-enter className="mt-6">
        <EmptyState
          icon={icon}
          title="Stiže uskoro"
          description={description}
          action={
            <Button type="button" className="h-auto min-h-9 whitespace-normal py-2" onClick={onAction}>
              {actionLabel}
              <ArrowRight aria-hidden="true" />
            </Button>
          }
        />
      </div>
    </div>
  );
}
