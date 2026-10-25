"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { assignRef, springTween, standardTween, useLayerMotion, type LayerMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Da li je sheet otvoren — sadržaj ga čita da bi ostao montiran dok traje
 * izlaz (GSAP, ne `tw-animate-css`). `null` = sadržaj je van ovog `Sheet`-a.
 */
const SheetOpenContext = React.createContext<{ open: boolean; modal: boolean } | null>(null);

/** Radix `Root` koji uvek zna `open` (kontrolisan ili ne) — isto kao `Dialog`. */
function Sheet({ open: openProp, defaultOpen = false, onOpenChange, modal = true, ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : uncontrolled;
  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!controlled) setUncontrolled(next);
      onOpenChange?.(next);
    },
    [controlled, onOpenChange],
  );
  return (
    <SheetOpenContext.Provider value={{ open, modal }}>
      <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange} modal={modal} {...props} />
    </SheetOpenContext.Provider>
  );
}

const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

function SheetOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return <DialogPrimitive.Overlay data-slot="sheet-overlay" className={cn("fixed inset-0 z-50 bg-black/50", className)} {...props} />;
}

const sideClasses = {
  top: "inset-x-0 top-0 border-b",
  bottom: "inset-x-0 bottom-0 border-t",
  left: "inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm",
  right: "inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm",
} as const;

type SheetSide = keyof typeof sideClasses;

/** Odakle sheet dolazi: osa i pomeraj (u % sopstvene veličine) van ekrana. */
const SIDE_OFFSET: Record<SheetSide, { xPercent: number } | { yPercent: number }> = {
  top: { yPercent: -100 },
  bottom: { yPercent: 100 },
  left: { xPercent: -100 },
  right: { xPercent: 100 },
};

/**
 * Pokret sheet-a (PLAN §6, tačka 3 — isto kao `Drawer`): ulazi sa svoje
 * ivice `smooth` springom, izlazi istim putem brže (`base`), zatamnjenje `base`.
 */
function sheetMotion(side: SheetSide): LayerMotion {
  const away = SIDE_OFFSET[side];
  const home = "xPercent" in away ? { xPercent: 0 } : { yPercent: 0 };
  return {
    hide: ({ gsap }, panel) => {
      gsap.set(panel, away);
    },
    enter: ({ gsap }, panel) => gsap.to(panel, { autoAlpha: 1, ...home, ...springTween("smooth") }),
    exit: ({ gsap }, panel, done) => gsap.to(panel, { ...away, ...standardTween("base"), onComplete: done }),
    rest: ({ gsap }, panel) => {
      gsap.set(panel, home);
    },
    scrim: { enter: "base", exit: "base" },
  };
}

const contentClass = "fixed z-50 flex flex-col gap-4 bg-background p-6 shadow-lg";

type SheetContentProps = React.ComponentProps<typeof DialogPrimitive.Content> & { side?: SheetSide };

function SheetContent(props: SheetContentProps) {
  const state = React.useContext(SheetOpenContext);
  // Van `Sheet`-a (goli Radix Root) nema `open`, pa ni pokreta.
  if (state === null) return <StaticSheetContent {...props} />;
  return <MotionSheetContent open={state.open} modal={state.modal} {...props} />;
}

function MotionSheetContent({ open, modal, className, children, side = "right", ref, ...props }: SheetContentProps & { open: boolean; modal: boolean }) {
  const motion = React.useMemo(() => sheetMotion(side), [side]);
  const { present, setOverlay, setPanel } = useLayerMotion(open, motion, { withOverlay: modal });
  const panelRef = React.useCallback(
    (element: HTMLDivElement | null) => {
      setPanel(element);
      return assignRef(ref, element);
    },
    [ref, setPanel],
  );
  if (!present) return null;
  return (
    <SheetPortal forceMount>
      <SheetOverlay ref={setOverlay} forceMount />
      <DialogPrimitive.Content ref={panelRef} forceMount data-slot="sheet-content" className={cn(contentClass, sideClasses[side], className)} {...props}>
        {children}
        <SheetCloseButton />
      </DialogPrimitive.Content>
    </SheetPortal>
  );
}

function StaticSheetContent({ className, children, side = "right", ...props }: SheetContentProps) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Content data-slot="sheet-content" className={cn(contentClass, sideClasses[side], className)} {...props}>
        {children}
        <SheetCloseButton />
      </DialogPrimitive.Content>
    </SheetPortal>
  );
}

function SheetCloseButton() {
  return (
    <DialogPrimitive.Close className="absolute top-4 right-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none">
      <X className="size-4" />
      <span className="sr-only">Zatvori</span>
    </DialogPrimitive.Close>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-header" className={cn("flex flex-col gap-2 text-center sm:text-left", className)} {...props} />;
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-footer" className={cn("mt-auto flex flex-col gap-2 sm:flex-row sm:justify-end", className)} {...props} />;
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title data-slot="sheet-title" className={cn("text-lg font-semibold", className)} {...props} />;
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description data-slot="sheet-description" className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetOverlay, SheetPortal, SheetTitle, SheetTrigger };
