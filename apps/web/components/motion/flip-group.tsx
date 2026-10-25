"use client";

import { Component, type ReactNode, type RefObject } from "react";
import { SCALE } from "@devotion/shared";

import {
  Flip,
  FLIP_SELECTOR,
  getGsap,
  prefersReducedMotion,
  reducedFade,
  shouldFlip,
  springTween,
  standardTween,
} from "@/lib/motion";

/** Iznad ovoliko stavki raspored se menja odmah, bez Flip-a (plan K07, E12). */
export const FLIP_MAX_ITEMS = 80;

type FlipGroupProps = {
  /** Kontejner u kome su stavke sa `data-flip-id`. */
  scope: RefObject<HTMLElement | null>;
  /** Potpis rasporeda (npr. ključevi redom); promena okida Flip. */
  layoutKey: string;
  /**
   * Promena ovog ključa nije pomeranje nego nov skup (drugi tab, kucanje u
   * pretrazi): raspored se menja odmah, bez Flip-a i bez ulaza.
   */
  resetKey?: string;
  /** Npr. previše stavki (E12): raspored se menja odmah. */
  disabled?: boolean;
  children: ReactNode;
};

type Snapshot = { state: Flip.FlipState | null; ids: ReadonlySet<string> } | null;

function flipIds(elements: ReadonlyArray<HTMLElement>): Set<string> {
  return new Set(elements.map((element) => element.dataset.flipId ?? ""));
}

/**
 * Flip za liste koje menja server (glas, odluka, nova stavka drugog člana —
 * PLAN §6, tačka 8). `getSnapshotBeforeUpdate` snimi položaje stavki dok je DOM
 * još stari, a posle commit-a stavke doputuju sa starog mesta (`snappy`); nove
 * ulaze neprozirnošću + scale 0,98 → 1 (`quick`). Ne treba `capture()` u
 * rukovaocu, pa radi i kad promena stigne posle odgovora servera. Prekidivo:
 * `Flip.getState` zatekne let u toku i nastavlja od trenutnog položaja.
 * Smanjen pokret: bez Flip-a, nove stavke se samo pretope (120 ms).
 *
 * Ne pravi DOM element (vraća `children`); stavke nose `data-flip-id`.
 */
export class FlipGroup extends Component<FlipGroupProps> {
  private animation: gsap.core.Animation | null = null;

  getSnapshotBeforeUpdate(previous: Readonly<FlipGroupProps>): Snapshot {
    if (!shouldFlip(previous, this.props)) return null;
    const root = this.props.scope.current;
    if (!root) return null;
    const elements = Array.from(root.querySelectorAll<HTMLElement>(FLIP_SELECTOR));
    if (prefersReducedMotion()) return { state: null, ids: flipIds(elements) };
    const gsap = getGsap();
    // Snimak hvata stvaran položaj na ekranu (i usred ulaza liste ili prethodnog
    // Flip-a, koji `getState` sam zatekne). Ulaz liste (`useEnter`) koji još
    // traje gubi samo `transform` — Flip nastavlja put od trenutne tačke, a
    // neprozirnost ulaza se dovršava.
    const state = Flip.getState(elements);
    gsap.killTweensOf(elements, "x,y,scale");
    gsap.set(elements, { clearProps: "transform" });
    return { state, ids: flipIds(elements) };
  }

  componentDidUpdate(_previous: Readonly<FlipGroupProps>, _state: unknown, snapshot: Snapshot) {
    if (!snapshot) return;
    const root = this.props.scope.current;
    if (!root) return;
    const gsap = getGsap();
    const elements = Array.from(root.querySelectorAll<HTMLElement>(FLIP_SELECTOR));
    this.animation?.kill();
    this.animation = null;

    if (!snapshot.state) {
      const arrived = elements.filter((element) => !snapshot.ids.has(element.dataset.flipId ?? ""));
      if (arrived.length > 0) {
        this.animation = gsap.fromTo(
          arrived,
          { opacity: 0 },
          { opacity: 1, ...reducedFade(), clearProps: "opacity" },
        );
      }
      return;
    }

    this.animation = Flip.from(snapshot.state, {
      targets: elements,
      ...springTween("snappy"),
      nested: true,
      simple: true,
      prune: true,
      onEnter: (entering) =>
        gsap.fromTo(
          entering,
          { autoAlpha: 0, scale: SCALE.enterFrom },
          { autoAlpha: 1, scale: 1, ...standardTween("quick"), clearProps: "opacity,visibility,transform" },
        ),
    });
  }

  componentWillUnmount() {
    this.animation?.kill();
    this.animation = null;
  }

  render() {
    return this.props.children;
  }
}
