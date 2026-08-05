"use client";

import { SmilePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { QUICK_REACTIONS } from "@/lib/chat";
import { cn } from "@/lib/utils";

/**
 * Kurirani brzi izbor reakcija (bez emoji biblioteke). Trigger je ghost dugme;
 * sadržaj je red čestih emojija — klik prosleđuje izabrani emoji nagore.
 */
export function ReactionPicker({
  onSelect,
  className,
}: {
  onSelect: (emoji: string) => void;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("size-7", className)}
          aria-label="Dodaj reakciju"
        >
          <SmilePlus className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="flex w-auto gap-1 p-1">
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onSelect(emoji)}
            className="grid size-8 place-items-center rounded-md text-lg leading-none transition-colors hover:bg-accent"
            aria-label={`Reaguj sa ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
