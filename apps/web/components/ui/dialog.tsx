"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { SCALE } from "@devotion/shared";

import {
  assignRef,
  springTween,
  standardTween,
  tweenScaleProperty,
  useLayerMotion,
  type LayerMotion,
} from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Da li je dijalog otvoren — sadržaj ga čita da bi ostao montiran dok traje
 * izlaz (GSAP, ne `tw-animate-css`). `null` = sadržaj je van ovog `Dialog`-a.
 */
const DialogOpenContext = React.createContext<{ open: boolean; modal: boolean } | null>(null);

/**
 * Radix `Root` koji uvek zna `open` (kontrolisan ili ne) i prosleđuje ga
 * sadržaju. Ponašanje je isto kao Radix: `open`/`onOpenChange` ili
 * `defaultOpen` + `DialogTrigger`.
 */
function Dialog({ open: openProp, defaultOpen = false, onOpenChange, modal = true, ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
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
    <DialogOpenContext.Provider value={{ open, modal }}>
      <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange} modal={modal} {...props} />
    </DialogOpenContext.Provider>
  );
}

const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return <DialogPrimitive.Overlay data-slot="dialog-overlay" className={cn("fixed inset-0 z-50 bg-black/50", className)} {...props} />;
}

/**
 * Pokret dijaloga (PLAN §6, plan K07 §4.2 — isto kao `MotionDialog`): ulaz
 * scale 0,96 → 1 (`snappy`) uz neprozirnost (`quick`), izlaz samo
 * neprozirnošću (`quick`), zatamnjenje `quick`. Scale ide kroz CSS svojstvo
 * `scale` jer sadržaj centrira Tailwind `translate` (vidi `scale-property.ts`).
 */
const DIALOG_MOTION: LayerMotion = {
  hide: ({ gsap }, panel) => {
    gsap.set(panel, { opacity: 0 });
    panel.style.scale = String(SCALE.dialogFrom);
  },
  enter: ({ gsap }, panel) =>
    gsap
      .timeline()
      .to(panel, { opacity: 1, ...standardTween("quick") }, 0)
      .add(tweenScaleProperty(gsap, panel, { to: 1, ...springTween("snappy") }), 0),
  exit: ({ gsap }, panel, done) => gsap.to(panel, { opacity: 0, ...standardTween("quick"), onComplete: done }),
  rest: (_api, panel) => {
    panel.style.removeProperty("scale");
  },
  scrim: { enter: "quick", exit: "quick" },
};

const contentClass =
  "fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100svh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-lg border bg-background p-6 shadow-lg sm:w-full";

type DialogContentProps = React.ComponentProps<typeof DialogPrimitive.Content> & { showCloseButton?: boolean };

function DialogContent(props: DialogContentProps) {
  const state = React.useContext(DialogOpenContext);
  // Van `Dialog`-a (goli Radix Root) nema `open`, pa ni pokreta.
  if (state === null) return <StaticDialogContent {...props} />;
  return <MotionDialogContent open={state.open} modal={state.modal} {...props} />;
}

function MotionDialogContent({ open, modal, className, children, showCloseButton = true, ref, ...props }: DialogContentProps & { open: boolean; modal: boolean }) {
  const { present, setOverlay, setPanel } = useLayerMotion(open, DIALOG_MOTION, { withOverlay: modal });
  const panelRef = React.useCallback(
    (element: HTMLDivElement | null) => {
      setPanel(element);
      return assignRef(ref, element);
    },
    [ref, setPanel],
  );
  if (!present) return null;
  return (
    <DialogPortal forceMount>
      <DialogOverlay ref={setOverlay} forceMount />
      <DialogPrimitive.Content ref={panelRef} forceMount data-slot="dialog-content" className={cn(contentClass, className)} {...props}>
        {children}
        {showCloseButton ? <DialogCloseButton /> : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function StaticDialogContent({ className, children, showCloseButton = true, ...props }: DialogContentProps) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content data-slot="dialog-content" className={cn(contentClass, className)} {...props}>
        {children}
        {showCloseButton ? <DialogCloseButton /> : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogCloseButton() {
  return (
    <DialogPrimitive.Close className="absolute right-2 top-2 z-50 grid size-10 place-items-center rounded-xl border border-border/70 bg-background/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none sm:right-3 sm:top-3">
      <X className="size-4" />
      <span className="sr-only">Zatvori</span>
    </DialogPrimitive.Close>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn("flex flex-col gap-2 text-center sm:text-left", className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-footer" className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />;
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={cn("text-lg leading-none font-semibold", className)} {...props} />;
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description data-slot="dialog-description" className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger };
