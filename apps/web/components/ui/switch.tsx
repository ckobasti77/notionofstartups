"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Prekidač (uključeno/isključeno). shadcn Switch se oslanja na
 * `@radix-ui/react-switch`, koji nije u projektu; ovo je lagana, pristupačna
 * zamena preko `role="switch"` dugmeta — ista vizuelna gramatika i tokeni kao
 * ostali primitivi u `components/ui/`.
 */
function Switch({
  checked,
  onCheckedChange,
  disabled,
  className,
  ...props
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
} & Omit<React.ComponentProps<"button">, "onChange" | "value" | "type">) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      data-slot="switch"
      data-state={checked ? "checked" : "unchecked"}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-input",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none block size-5 rounded-full bg-background shadow-sm ring-0 transition-transform",
          checked ? "translate-x-[1.375rem]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

export { Switch };
