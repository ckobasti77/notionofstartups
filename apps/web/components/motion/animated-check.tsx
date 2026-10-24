"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { reducedFade, springTween, standardTween, useTweenSlots } from "@/lib/motion";
import { cn } from "@/lib/utils";

type AnimatedCheckProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Šta se štiklira, za čitač ekrana (npr. „Završi: Pozovi dobavljača"). */
  label: string;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
};

const BOX = { sm: "size-[1.125rem]", md: "size-5" } as const;
const MARK = { sm: "size-3", md: "size-3.5" } as const;

/**
 * Kvačica zadatka (PLAN §6, tačka 1): na štikliranje se krug puni `bouncy`
 * springom od centra i kvačica se iscrtava; poništavanje je brže (`quick`).
 * Prekidivo: svaka promena kreće od trenutnog stanja na ekranu. Vizuelno
 * stanje posle mount-a drži GSAP (React ga postavlja samo pri prvom renderu).
 * Smanjen pokret: samo neprozirnost.
 */
export function AnimatedCheck({
  checked,
  onCheckedChange,
  label,
  disabled = false,
  size = "md",
  className,
}: AnimatedCheckProps) {
  const [initiallyChecked] = useState(checked);
  const fillRef = useRef<HTMLSpanElement>(null);
  const markRef = useRef<SVGPathElement>(null);
  const settled = useRef<boolean | null>(null);
  const play = useTweenSlots();

  useLayoutEffect(() => {
    if (settled.current === null) {
      settled.current = checked;
      return;
    }
    if (settled.current === checked) return;
    settled.current = checked;
    const fill = fillRef.current;
    const mark = markRef.current;
    if (!fill || !mark) return;

    play("fill", ({ gsap, reduced }) => {
      if (reduced) {
        gsap.set(fill, { scale: 1 });
        return gsap.to(fill, { opacity: checked ? 1 : 0, ...reducedFade() });
      }
      return checked
        ? gsap.to(fill, { scale: 1, opacity: 1, ...springTween("bouncy") })
        : gsap.to(fill, { scale: 0, opacity: 0, ...standardTween("quick") });
    });
    play("mark", ({ gsap, reduced }) => {
      if (reduced) {
        gsap.set(mark, { strokeDashoffset: 0 });
        return gsap.to(mark, { opacity: checked ? 1 : 0, ...reducedFade() });
      }
      gsap.set(mark, { opacity: 1 });
      return gsap.to(mark, { strokeDashoffset: checked ? 0 : 1, ...standardTween("quick") });
    });
  }, [checked, play]);

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        // Meta mišem ≥ 24 px (WCAG 2.5.8); na dodir globalno pravilo diže na 44 px.
        // Fokus prsten je globalni :focus-visible (2 px --ring) na samom dugmetu.
        "group grid size-6 shrink-0 place-items-center rounded-full disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      <span
        className={cn(
          "relative grid place-items-center rounded-full border-[1.5px] bg-card transition-colors",
          // muted-foreground/70 na kartici: 3,36:1 (svetla) i 3,75:1 (tamna) — WCAG 1.4.11.
          checked ? "border-primary" : "border-muted-foreground/70 group-hover:border-primary",
          BOX[size],
        )}
      >
        <span
          ref={fillRef}
          aria-hidden="true"
          className="absolute -inset-px rounded-full bg-primary"
          style={{ opacity: initiallyChecked ? 1 : 0, transform: `scale(${initiallyChecked ? 1 : 0})` }}
        />
        <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className={cn("relative text-primary-foreground", MARK[size])}>
          <path
            ref={markRef}
            d="M3.6 8.5 6.7 11.4 12.6 4.9"
            pathLength={1}
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={1}
            style={{ strokeDashoffset: initiallyChecked ? 0 : 1 }}
          />
        </svg>
      </span>
    </button>
  );
}
