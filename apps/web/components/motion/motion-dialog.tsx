"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { SCALE } from "@devotion/shared";

import { reducedFade, springTween, standardTween, useTweenSlots } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type MotionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** Naslov samo za čitač ekrana (npr. kad je vidljiva samo mala oznaka). */
  hideTitle?: boolean;
  /** Najveća širina (CSS dužina). */
  width?: string;
  /** `top`: prozor gore (brzi unos, plan dana) — tastatura ne pokriva polje. */
  position?: "center" | "top";
  /** Element koji dobija fokus pri otvaranju (inače prvi fokusabilan). */
  initialFocus?: () => HTMLElement | null;
  /**
   * Kuda fokus posle izlaza kad element koji je otvorio dijalog više nije
   * vidljiv (npr. uzak ekran prešao sa liste na razgovor).
   */
  returnFocusFallback?: () => HTMLElement | null;
  showClose?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
};

/**
 * Dijalog sa pokretom (plan K07, E8): Radix Dialog + `forceMount`, element
 * animira samo GSAP (bez `tw-animate-css`). Ulaz: scale 0,96 → 1 (`snappy`) uz
 * neprozirnost (`quick`); izlaz samo neprozirnošću (`quick`). Odlazeći sloj ne
 * hvata klikove, fokus se posle izlaza vraća na element koji je dijalog
 * otvorio (obrazac `Drawer`). Smanjen pokret: samo neprozirnost.
 */
export function MotionDialog({
  open,
  onOpenChange,
  title,
  description,
  hideTitle = false,
  width = "32rem",
  position = "center",
  initialFocus,
  returnFocusFallback,
  showClose = true,
  children,
  footer,
  className,
  bodyClassName,
}: MotionDialogProps) {
  const [present, setPresent] = useState(open);
  if (open && !present) setPresent(true);

  const [overlay, setOverlay] = useState<HTMLDivElement | null>(null);
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  const entered = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  // Poslednja rezerva iz props-a; čita se tek posle izlaza.
  const fallbackRef = useRef(returnFocusFallback);
  useLayoutEffect(() => {
    fallbackRef.current = returnFocusFallback;
  });
  const play = useTweenSlots();

  useLayoutEffect(() => {
    if (!present || !overlay || !panel) return;

    if (open) {
      play("overlay", ({ gsap, reduced }) => {
        if (!entered.current) {
          // Panel samo kroz neprozirnost (ne `visibility`): Radix u svom efektu
          // fokusira polje u panelu, a skriven element ne prima fokus.
          gsap.set(overlay, { autoAlpha: 0 });
          gsap.set(panel, { opacity: 0 });
          if (!reduced) gsap.set(panel, { scale: SCALE.dialogFrom });
          entered.current = true;
        }
        gsap.set([overlay, panel], { clearProps: "pointerEvents" });
        return gsap.to(overlay, { autoAlpha: 1, ...(reduced ? reducedFade() : standardTween("quick")) });
      });
      play("panel", ({ gsap, reduced }) => {
        if (reduced) return gsap.to(panel, { opacity: 1, scale: 1, ...reducedFade() });
        const timeline = gsap.timeline();
        timeline.to(panel, { opacity: 1, ...standardTween("quick") }, 0);
        timeline.to(panel, { scale: 1, ...springTween("snappy") }, 0);
        return timeline;
      });
      return;
    }

    const finish = () => {
      entered.current = false;
      setPresent(false);
    };
    play("overlay", ({ gsap, reduced }) => {
      gsap.set([overlay, panel], { pointerEvents: "none" });
      return gsap.to(overlay, { autoAlpha: 0, ...(reduced ? reducedFade() : standardTween("quick")) });
    });
    play("panel", ({ gsap, reduced }) =>
      gsap.to(panel, { opacity: 0, ...(reduced ? reducedFade() : standardTween("quick")), onComplete: finish }),
    );
  }, [open, present, overlay, panel, play]);

  // Fokus se vraća posle demontaže (tada je skinut i Radix `aria-hidden`).
  useEffect(() => {
    if (present) return;
    const target = returnFocus.current;
    returnFocus.current = null;
    // Bez zapamćenog elementa dijalog nije ni bio otvoren (prvi render).
    if (target === null) return;
    const lost = document.activeElement === null || document.activeElement === document.body;
    if (!lost) return;
    if (target.isConnected && target.getClientRects().length > 0) {
      target.focus({ preventScroll: true });
      return;
    }
    fallbackRef.current?.()?.focus({ preventScroll: true });
  }, [present]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {present ? (
        <DialogPrimitive.Portal forceMount>
          <DialogPrimitive.Overlay
            ref={setOverlay}
            forceMount
            data-slot="motion-dialog-overlay"
            className="fixed inset-0 z-50 bg-black/50"
          />
          <div
            className={cn(
              "pointer-events-none fixed inset-0 z-50 flex justify-center p-3 sm:p-4",
              position === "top" ? "items-start pt-3 sm:pt-[12vh]" : "items-center",
            )}
          >
            <DialogPrimitive.Content
              ref={setPanel}
              forceMount
              data-slot="motion-dialog-content"
              onOpenAutoFocus={(event) => {
                if (document.activeElement instanceof HTMLElement) returnFocus.current = document.activeElement;
                const target = initialFocus?.();
                if (target) {
                  event.preventDefault();
                  target.focus({ preventScroll: true });
                }
              }}
              onCloseAutoFocus={(event) => event.preventDefault()}
              {...(description ? {} : { "aria-describedby": undefined })}
              className={cn(
                "desk-surface pointer-events-auto relative flex max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-hidden rounded-2xl border bg-popover text-popover-foreground outline-none",
                // Gore: 12vh odozgo, pa podnožje mora da stane iznad ivice ekrana.
                position === "top" ? "sm:max-h-[calc(88dvh-1rem)]" : "sm:max-h-[calc(100dvh-2rem)]",
                className,
              )}
              style={{ maxWidth: width }}
            >
              <header className={cn("flex shrink-0 items-start gap-3 px-5 pt-4", showClose && "pr-12", hideTitle && "sr-only")}>
                <div className="min-w-0 flex-1">
                  <DialogPrimitive.Title className="text-base font-semibold tracking-[-0.02em]">
                    {title}
                  </DialogPrimitive.Title>
                  {description ? (
                    <DialogPrimitive.Description className="mt-1 text-sm leading-5 text-muted-foreground">
                      {description}
                    </DialogPrimitive.Description>
                  ) : null}
                </div>
              </header>
              {showClose ? (
                <DialogPrimitive.Close className="absolute right-2.5 top-2.5 grid size-10 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground">
                  <X className="size-4" aria-hidden="true" />
                  <span className="sr-only">Zatvori</span>
                </DialogPrimitive.Close>
              ) : null}
              <div className={cn("scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-4", bodyClassName)}>
                {children}
              </div>
              {footer ? (
                <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t px-5 py-3">
                  {footer}
                </footer>
              ) : null}
            </DialogPrimitive.Content>
          </div>
        </DialogPrimitive.Portal>
      ) : null}
    </DialogPrimitive.Root>
  );
}
