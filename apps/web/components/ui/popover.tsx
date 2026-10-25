"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { SCALE } from "@devotion/shared";

import { reducedFade, springTween, standardTween, useTweenSlots } from "@/lib/motion";
import { cn } from "@/lib/utils";

function Popover(props: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger(props: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverAnchor(props: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

/**
 * Sadržaj popovera (shadcn oblik, plan K07 E1). Ulaz animira GSAP — ne
 * `tw-animate-css`: neprozirnost `quick` + scale 0,98 → 1 `snappy` iz tačke
 * okidača (`--radix-popover-content-transform-origin`), izlaz je odmah (plan
 * K07 §4.2). Smanjen pokret: samo neprozirnost.
 */
function PopoverContent({
  className,
  align = "center",
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <MotionPopoverContent align={align} sideOffset={sideOffset} className={className} {...props} />
    </PopoverPrimitive.Portal>
  );
}

function MotionPopoverContent({ className, style, ref, ...props }: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  const localRef = React.useRef<HTMLDivElement | null>(null);
  const play = useTweenSlots();

  // Sadržaj se montira zajedno sa ovom komponentom (unutar Portal-a), pa je
  // element tu već u prvom layout efektu.
  React.useLayoutEffect(() => {
    const element = localRef.current;
    if (!element) return;
    play("fade", ({ gsap, reduced }) =>
      gsap.fromTo(
        element,
        { opacity: 0 },
        { opacity: 1, ...(reduced ? reducedFade() : standardTween("quick")), clearProps: "opacity" },
      ),
    );
    play("scale", ({ gsap, reduced }) =>
      reduced
        ? null
        : gsap.fromTo(element, { scale: SCALE.enterFrom }, { scale: 1, ...springTween("snappy"), clearProps: "transform" }),
    );
  }, [play]);

  const setRef = (element: HTMLDivElement | null) => {
    localRef.current = element;
    if (typeof ref === "function") ref(element);
    else if (ref) ref.current = element;
  };

  return (
    <PopoverPrimitive.Content
      ref={setRef}
      data-slot="popover-content"
      className={cn(
        "z-50 max-h-(--radix-popover-content-available-height) overflow-y-auto rounded-xl border bg-popover p-3 text-popover-foreground shadow-md outline-none",
        className,
      )}
      style={{ transformOrigin: "var(--radix-popover-content-transform-origin)", ...style }}
      {...props}
    />
  );
}

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger };
