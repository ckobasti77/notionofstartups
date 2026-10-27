"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { reducedFade, springTween, standardTween, useTweenSlots } from "@/lib/motion";
import { cn } from "@/lib/utils";

type DrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** Najveća širina panela (CSS dužina); na uskom ekranu panel je pune širine. */
  width?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  /**
   * Sopstveno zaglavlje (npr. panel zadatka: čip startupa + naslov koji se
   * menja u mestu). `title` tada ostaje ime dijaloga samo za čitač ekrana.
   */
  header?: ReactNode;
  /**
   * Fokus pri otvaranju: prvi kontrol (Radix, podrazumevano) ili sam panel —
   * kad je prvi kontrol polje za izmenu ili kvačica, ne sme se slučajno kucati
   * ili čekirati (panel zadatka).
   */
  initialFocus?: "first" | "panel";
  /**
   * Gde ide fokus posle zatvaranja kad element koji je otvorio panel više ne
   * postoji (npr. stavka menija „Otvori"): obično naslov reda.
   */
  returnFocusFallback?: () => HTMLElement | null;
  /** Posle izlaza (panel demontiran) — kontejner može da pusti pretplate. */
  onExited?: () => void;
  /** Ime dugmeta za zatvaranje (sr-only). */
  closeLabel?: string;
};

/**
 * Desni panel nad Radix Dialog-om (PLAN §6, tačka 3): ulazi sa desne strane
 * `smooth` springom, pozadina se zatamni; izlazi brže (`base`) istim putem.
 * Radix drži fokus zarobljen dok je otvoren, Esc i klik van zatvaraju.
 * Posle zatvaranja sadržaj ostaje montiran samo dok traje izlaz (`forceMount`),
 * bez hvatanja klikova — stranica je odmah upotrebljiva. Element animira samo
 * GSAP (bez `tw-animate-css` klasa). Smanjen pokret: samo neprozirnost.
 */
export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  width = "28rem",
  children,
  footer,
  className,
  header,
  initialFocus = "first",
  returnFocusFallback,
  onExited,
  closeLabel = "Zatvori",
}: DrawerProps) {
  const [present, setPresent] = useState(open);
  // Montiraj odmah pri otvaranju (izvedeno stanje, bez efekta).
  if (open && !present) setPresent(true);

  // Radix Portal montira sadržaj tek posle svog prvog commit-a, pa elementi
  // stižu kroz state: ref postavi element → ponovni render pre iscrtavanja →
  // efekat ispod vidi oba elementa i pusti ulaz bez treptaja.
  const [overlay, setOverlay] = useState<HTMLDivElement | null>(null);
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  const entered = useRef(false);
  // Radix vraća fokus samo na svoj Trigger; kontrolisan panel ga nema, pa
  // pamtimo šta je bilo fokusirano pre otvaranja i vraćamo to pri zatvaranju.
  const returnFocus = useRef<HTMLElement | null>(null);
  const play = useTweenSlots();
  const onExitedRef = useRef(onExited);
  const fallbackRef = useRef(returnFocusFallback);
  useLayoutEffect(() => {
    onExitedRef.current = onExited;
    fallbackRef.current = returnFocusFallback;
  });

  useLayoutEffect(() => {
    if (!present || !overlay || !panel) return;

    if (open) {
      play("overlay", ({ gsap, reduced }) => {
        if (!entered.current) {
          gsap.set(overlay, { autoAlpha: 0 });
          // Smanjen pokret: samo `opacity` — `visibility: hidden` bi sprečio Radix da fokusira panel.
          gsap.set(panel, reduced ? { opacity: 0 } : { xPercent: 100 });
          entered.current = true;
        }
        gsap.set([overlay, panel], { clearProps: "pointerEvents" });
        return gsap.to(overlay, { autoAlpha: 1, ...(reduced ? reducedFade() : standardTween("base")) });
      });
      play("panel", ({ gsap, reduced }) =>
        reduced
          ? gsap.to(panel, { opacity: 1, xPercent: 0, ...reducedFade() })
          : gsap.to(panel, { autoAlpha: 1, xPercent: 0, ...springTween("smooth") }),
      );
      return;
    }

    const finish = () => {
      entered.current = false;
      setPresent(false);
      onExitedRef.current?.();
    };
    play("overlay", ({ gsap, reduced }) => {
      // Izlazni sloj ne sme da hvata klikove dok nestaje.
      gsap.set([overlay, panel], { pointerEvents: "none" });
      return gsap.to(overlay, { autoAlpha: 0, ...(reduced ? reducedFade() : standardTween("base")) });
    });
    play("panel", ({ gsap, reduced }) =>
      reduced
        ? gsap.to(panel, { opacity: 0, ...reducedFade(), onComplete: finish })
        : gsap.to(panel, { xPercent: 100, ...standardTween("base"), onComplete: finish }),
    );
  }, [open, present, overlay, panel, play]);

  // Fokus se vraća posle izlaza, kad je panel demontiran: tada je skinut i
  // Radix `aria-hidden` sa ostatka stranice (kao Radix sa sopstvenim Trigger-om).
  // Pasivan efekat, jer i Radix FocusScope (dete) čisti u pasivnom efektu.
  useEffect(() => {
    if (present) return;
    const target = returnFocus.current;
    returnFocus.current = null;
    // Ako je korisnik tokom izlaza već kliknuo nešto drugo, fokus se ne otima.
    const lost = document.activeElement === null || document.activeElement === document.body;
    if (!lost) return;
    // `body` (fioka otvorena klikom na neizborni element) nije meta — tada ide rezerva.
    const destination = target?.isConnected && target !== document.body ? target : fallbackRef.current?.();
    destination?.focus({ preventScroll: true });
  }, [present]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {present ? (
        <DialogPrimitive.Portal forceMount>
          <DialogPrimitive.Overlay
            ref={setOverlay}
            forceMount
            data-slot="drawer-overlay"
            className="fixed inset-0 z-50 bg-black/50"
          />
          <DialogPrimitive.Content
            ref={setPanel}
            forceMount
            data-slot="drawer-content"
            onOpenAutoFocus={(event) => {
              if (document.activeElement instanceof HTMLElement) returnFocus.current = document.activeElement;
              if (initialFocus === "panel") {
                event.preventDefault();
                (event.currentTarget as HTMLElement | null)?.focus({ preventScroll: true });
              }
            }}
            onCloseAutoFocus={(event) => event.preventDefault()}
            // Polje koje samo obrađuje Esc (npr. naslov u izmeni: Esc vraća staru
            // vrednost) nosi `data-escape-local`; panel se tada ne zatvara.
            onEscapeKeyDown={(event) => {
              const active = document.activeElement;
              if (active instanceof HTMLElement && active.dataset.escapeLocal === "true") {
                event.preventDefault();
                return;
              }
              // Polje koje čuva na blur (beleška, instrukcije) mora da sačuva pre
              // nego što panel ode — demontiran element ne dobija `blur`.
              if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) active.blur();
            }}
            // Bez opisa: Radix ne traži Description (inače upozorenje u konzoli).
            {...(description ? {} : { "aria-describedby": undefined })}
            className={cn(
              "desk-surface fixed inset-y-0 right-0 z-50 flex h-dvh w-full flex-col border-l bg-popover text-popover-foreground outline-none",
              className,
            )}
            style={{ maxWidth: width }}
          >
            <header className="flex shrink-0 items-start gap-3 border-b px-5 py-4">
              <div className="min-w-0 flex-1">
                <DialogPrimitive.Title className={header ? "sr-only" : "text-base font-semibold tracking-[-0.02em]"}>
                  {title}
                </DialogPrimitive.Title>
                {header}
                {description ? (
                  <DialogPrimitive.Description className="mt-1 text-sm leading-5 text-muted-foreground">
                    {description}
                  </DialogPrimitive.Description>
                ) : null}
              </div>
              <DialogPrimitive.Close className="-mr-1 -mt-1 grid size-10 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground">
                <X className="size-4" aria-hidden="true" />
                <span className="sr-only">{closeLabel}</span>
              </DialogPrimitive.Close>
            </header>
            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer ? (
              <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                {footer}
              </footer>
            ) : null}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      ) : null}
    </DialogPrimitive.Root>
  );
}
