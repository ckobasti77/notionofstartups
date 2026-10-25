"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { DurationName } from "@devotion/shared";

import { reducedFade, standardTween } from "./eases";
import { useTweenSlots, type MotionApi } from "./use-gsap";

/** Odlazeći sloj (CSS: `pointer-events: none`, `globals.css`). */
export const EXITING_ATTRIBUTE = "data-layer-exiting";

// Globalni GSAP namespace (tipovi paketa ga deklarišu globalno).
type Animation = gsap.core.Animation;

export type LayerMotion = {
  /** Panel pre prvog frejma ulaza (pun pokret; smanjen pokret: samo neprozirnost 0). */
  hide: (api: MotionApi, panel: HTMLElement) => void;
  /** Ulaz panela od trenutne vrednosti (pun pokret). */
  enter: (api: MotionApi, panel: HTMLElement) => Animation;
  /**
   * Panel odmah u mirovanju (bez pomeraja i skaliranja) — smanjen pokret, i kad
   * je podešavanje promenjeno usred ranijeg pokreta.
   */
  rest: (api: MotionApi, panel: HTMLElement) => void;
  /** Izlaz panela istim putem (pun pokret); `done` kad se završi. */
  exit: (api: MotionApi, panel: HTMLElement, done: () => void) => Animation;
  /** Trajanje zatamnjenja pri ulazu i izlazu (ime iz rečnika). */
  scrim: { enter: DurationName; exit: DurationName };
};

/**
 * Prisustvo sloja (dijalog, sheet) koji animira samo GSAP — obrazac `Drawer` /
 * `MotionDialog` za deljene primitive (`ui/dialog`, `ui/sheet`). Sloj ostaje
 * montiran dok traje izlaz (`present`), elementi stižu kroz state (Radix
 * Portal ih montira tek posle svog commit-a). Odlazeći sloj ne hvata klikove;
 * ponovno otvaranje usred izlaza kreće od trenutne vrednosti. Smanjen pokret:
 * samo neprozirnost 120 ms.
 */
export function useLayerMotion(open: boolean, motion: LayerMotion, { withOverlay = true }: { withOverlay?: boolean } = {}) {
  const [present, setPresent] = useState(open);
  // Montiraj odmah pri otvaranju (izvedeno stanje, bez efekta).
  if (open && !present) setPresent(true);

  const [overlay, setOverlay] = useState<HTMLElement | null>(null);
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const entered = useRef(false);
  // Opis pokreta se pravi u svakom renderu; čita se samo iz efekta.
  const motionRef = useRef(motion);
  useLayoutEffect(() => {
    motionRef.current = motion;
  });
  const play = useTweenSlots();

  useLayoutEffect(() => {
    // Nemodalan sloj (`modal={false}`) nema zatamnjenje: Radix ne montira overlay.
    if (!present || !panel || (withOverlay && !overlay)) return;
    const current = motionRef.current;

    if (open) {
      play("overlay", (api) => {
        const { gsap, reduced } = api;
        if (!entered.current) {
          if (overlay) gsap.set(overlay, { autoAlpha: 0 });
          // Smanjen pokret: samo `opacity` — `visibility: hidden` bi sprečio
          // Radix da fokusira polje u panelu.
          if (reduced) gsap.set(panel, { opacity: 0 });
          else current.hide(api, panel);
          entered.current = true;
        }
        overlay?.removeAttribute(EXITING_ATTRIBUTE);
        panel.removeAttribute(EXITING_ATTRIBUTE);
        panel.removeAttribute("inert");
        if (!overlay) return null;
        return gsap.to(overlay, {
          autoAlpha: 1,
          ...(reduced ? reducedFade() : standardTween(current.scrim.enter)),
        });
      });
      play("panel", (api) => {
        if (!api.reduced) return current.enter(api, panel);
        current.rest(api, panel);
        return api.gsap.to(panel, { opacity: 1, ...reducedFade() });
      });
      return;
    }

    const finish = () => {
      entered.current = false;
      setPresent(false);
    };
    play("overlay", ({ gsap, reduced }) => {
      // Izlazni sloj ne sme da hvata klikove dok nestaje. Atribut (ne inline
      // `pointer-events`): Radix DismissableLayer pri zatvaranju prepiše inline
      // stil sadržaja, a atribut i pravilo u `globals.css` ostaju. `inert`:
      // ni tastatura (dupli Enter) ne sme da stigne do panela koji odlazi.
      overlay?.setAttribute(EXITING_ATTRIBUTE, "");
      panel.setAttribute(EXITING_ATTRIBUTE, "");
      panel.setAttribute("inert", "");
      if (!overlay) return null;
      return gsap.to(overlay, {
        autoAlpha: 0,
        ...(reduced ? reducedFade() : standardTween(current.scrim.exit)),
      });
    });
    play("panel", (api) =>
      api.reduced
        ? api.gsap.to(panel, { opacity: 0, ...reducedFade(), onComplete: finish })
        : current.exit(api, panel, finish),
    );
  }, [open, present, overlay, panel, play, withOverlay]);

  return { present, setOverlay, setPanel };
}
