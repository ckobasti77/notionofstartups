"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

type ThemeToggleProps = React.ComponentProps<"button"> & {
  showLabel?: boolean;
};

function ThemeToggle({ className, showLabel = false, ...props }: ThemeToggleProps) {
  const { mounted, resolvedTheme, toggleTheme } = useTheme();
  const isDark = mounted && resolvedTheme === "dark";
  const label = isDark ? "Uklju\u010di svetlu temu" : "Uklju\u010di tamnu temu";

  return (
    <button
      type="button"
      data-slot="theme-toggle"
      data-touch-target="true"
      aria-label={label}
      title={label}
      onClick={toggleTheme}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border/80 bg-card px-2.5 text-sm font-medium text-muted-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55 disabled:pointer-events-none disabled:opacity-50",
        !showLabel && "w-9 px-0",
        !mounted && "invisible",
        className,
      )}
      {...props}
    >
      <span className="relative grid size-4 place-items-center" aria-hidden="true">
        {isDark ? <Moon className="size-4" /> : <Sun className="size-4" />}
      </span>
      {showLabel ? <span>{isDark ? "Svetla tema" : "Tamna tema"}</span> : null}
    </button>
  );
}

export { ThemeToggle };
