"use client";

import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { DURATION, REDUCED_FADE_MS, SPRING, springDurationMs } from "@devotion/shared";

import { useTheme } from "@/components/theme-provider";
// Čist modul, ne `@/lib/motion`: Toaster je u korenu, a barel bi povukao GSAP.
import { springLinearEasing, standardCubicBezier } from "@/lib/motion/eases";

/** Ton obaveštenja → token: tinta podloge i ivice, tekst ostaje osnovni (AA). */
function toneVars(kind: "success" | "info" | "warning" | "error", token: string) {
  return {
    [`--${kind}-bg`]: `color-mix(in oklab, var(${token}) 10%, var(--popover))`,
    [`--${kind}-border`]: `color-mix(in oklab, var(${token}) 35%, var(--border))`,
    [`--${kind}-text`]: "var(--popover-foreground)",
  };
}

/**
 * Izgled i pokret toastova u stilu aplikacije (K19). Toast animira sonner
 * (CSS prelazi), GSAP se na njega ne kači — isti element ne animiraju dve
 * biblioteke. Ovde se zadaju samo brojevi iz rečnika: put `snappy` (isti
 * spring kao CSS `linear()` kriva), neprozirnost `quick`, smanjen pokret samo
 * neprozirnost 120 ms; pravila su u `globals.css` (blok „Toastovi"). Boje su
 * tokeni obe teme.
 */
const TOASTER_STYLE = {
  "--toast-move-duration": `${springDurationMs(SPRING.snappy)}ms`,
  "--toast-move-ease": springLinearEasing("snappy"),
  "--toast-fade-duration": `${DURATION.quick}ms`,
  "--toast-fade-ease": standardCubicBezier(),
  "--toast-reduced-duration": `${REDUCED_FADE_MS}ms`,
  "--border-radius": "calc(var(--radius) + 4px)",
  "--normal-bg": "var(--popover)",
  "--normal-bg-hover": "var(--accent)",
  "--normal-border": "var(--border)",
  "--normal-border-hover": "var(--border)",
  "--normal-text": "var(--popover-foreground)",
  ...toneVars("success", "--success"),
  ...toneVars("info", "--info"),
  ...toneVars("warning", "--warning"),
  ...toneVars("error", "--destructive"),
} as CSSProperties;

function Toaster({ style, ...props }: ToasterProps) {
  const { mounted, resolvedTheme } = useTheme();
  return (
    <Sonner
      position="bottom-right"
      theme={mounted ? resolvedTheme : "system"}
      containerAriaLabel="Obaveštenja"
      richColors
      closeButton
      style={{ ...TOASTER_STYLE, ...style }}
      {...props}
      // Sonner podrazumeva englesko „Close toast" za čitač ekrana.
      toastOptions={{ closeButtonAriaLabel: "Zatvori obaveštenje", ...props.toastOptions }}
    />
  );
}

export { Toaster };
