"use client";

import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { MessagesSquare, SquarePen } from "lucide-react";
import { ENTER_OFFSET_PX, hubIsEmpty, type HubGroup } from "@devotion/shared";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/workspace/workspace-ui";
import { reducedFade, springTween, standardTween, useTweenSlots } from "@/lib/motion";
import { cn } from "@/lib/utils";

import { HubList, type HubListState } from "./hub-list";

/** Od ove širine lista i razgovor stoje jedno pored drugog (E10: `xl`). */
export const HUB_SPLIT_QUERY = "(min-width: 80rem)";

function visible(element: HTMLElement | null): HTMLElement | null {
  return element && element.getClientRects().length > 0 ? element : null;
}

/**
 * Kuda fokus posle dijaloga kad je element koji ga je otvorio sakriven (uzak
 * ekran prešao na razgovor ili nazad na listu): dugme zaglavlja razgovora,
 * pretraga razgovora, pa samo okno razgovora.
 */
export function hubFocusFallback(): HTMLElement | null {
  return (
    visible(document.querySelector<HTMLElement>("[data-hub-conversation] header button")) ??
    visible(document.querySelector<HTMLElement>("[data-hub-search]")) ??
    visible(document.querySelector<HTMLElement>("[data-hub-conversation]"))
  );
}

export type ChatHubViewProps = {
  now: number;
  meId: string;
  state: HubListState;
  groups: ReadonlyArray<HubGroup>;
  query: string;
  onQueryChange: (query: string) => void;
  onToggleGroup: (key: string) => void;
  activeChannelId: string | null;
  onSelect: (channelId: string) => void;
  onNewMessage: () => void;
  onNewGroup: () => void;
  /** Otvoren razgovor (`ConversationPane` ili njegovo stanje); `null` bez izbora. */
  conversation: ReactNode;
  searchRef?: RefObject<HTMLInputElement | null>;
};

/**
 * Poruke (K15, plan K07 §1.6): levo hub razgovora, desno razgovor. Dva panela
 * tek od `xl` (E10); ispod toga se vidi lista ILI razgovor, kao na telefonu.
 *
 * Pokret (plan K07 §4.2): na širokom ekranu promena razgovora pretapa okno
 * (`quick`) uz 8 px nagore (`snappy`); na uskom lista ↔ razgovor ulazi bočno u
 * smeru kretanja (±8 px, `gentle`, neprozirnost `base`), kao `MotionStage`
 * sa `direction`. Smanjen pokret: samo neprozirnost 120 ms.
 */
export function ChatHubView({
  now,
  meId,
  state,
  groups,
  query,
  onQueryChange,
  onToggleGroup,
  activeChannelId,
  onSelect,
  onNewMessage,
  onNewGroup,
  conversation,
  searchRef,
}: ChatHubViewProps) {
  const listPaneRef = useRef<HTMLDivElement>(null);
  const conversationPaneRef = useRef<HTMLDivElement>(null);
  const previousRef = useRef(activeChannelId);
  const play = useTweenSlots();

  useLayoutEffect(() => {
    const previous = previousRef.current;
    previousRef.current = activeChannelId;
    if (previous === activeChannelId) return;
    const wide = window.matchMedia(HUB_SPLIT_QUERY).matches;
    // Uzak ekran, povratak na listu: lista ulazi s leve strane.
    const target = !wide && activeChannelId === null ? listPaneRef.current : conversationPaneRef.current;
    if (!target) return;
    const sideways = !wide && (previous === null || activeChannelId === null);
    const direction = activeChannelId === null ? -1 : 1;

    // Uzak ekran: element sa fokusom (red liste, „Nazad") upravo je sakriven.
    // Fokus ide u razgovor (prvo dugme zaglavlja), a pri povratku na red
    // razgovora koji je bio otvoren (ili na pretragu).
    const focused = document.activeElement;
    const lost =
      !(focused instanceof HTMLElement) ||
      focused === document.body ||
      !focused.isConnected ||
      focused.getClientRects().length === 0;
    if (!wide && lost) {
      if (activeChannelId === null) {
        const row = previous
          ? listPaneRef.current?.querySelector<HTMLElement>(`[data-channel-id="${CSS.escape(previous)}"]`)
          : null;
        const fallback = listPaneRef.current?.querySelector<HTMLElement>("input[type=search]");
        const next = row && row.getClientRects().length > 0 ? row : fallback;
        next?.focus({ preventScroll: true });
        next?.scrollIntoView({ block: "nearest" });
      } else {
        const pane = conversationPaneRef.current;
        (pane?.querySelector<HTMLElement>("header button") ?? pane)?.focus({ preventScroll: true });
      }
    }
    play("pane", ({ gsap, reduced }) => {
      if (reduced) {
        return gsap.fromTo(target, { opacity: 0 }, { opacity: 1, ...reducedFade(), clearProps: "opacity", overwrite: "auto" });
      }
      const timeline = gsap.timeline();
      if (sideways) {
        timeline
          .fromTo(target, { opacity: 0 }, { opacity: 1, ...standardTween("base"), clearProps: "opacity", overwrite: "auto" }, 0)
          .fromTo(
            target,
            { x: direction * ENTER_OFFSET_PX },
            { x: 0, ...springTween("gentle"), clearProps: "transform", overwrite: "auto" },
            0,
          );
      } else {
        timeline
          .fromTo(target, { opacity: 0 }, { opacity: 1, ...standardTween("quick"), clearProps: "opacity", overwrite: "auto" }, 0)
          .fromTo(
            target,
            { y: ENTER_OFFSET_PX },
            { y: 0, ...springTween("snappy"), clearProps: "transform", overwrite: "auto" },
            0,
          );
      }
      return timeline;
    });
  }, [activeChannelId, play]);

  const selected = activeChannelId !== null;
  const empty = state.status === "ready" && hubIsEmpty(state.input);

  return (
    <div className="flex h-full min-h-0 overflow-x-clip bg-background">
      <div
        ref={listPaneRef}
        className={cn(
          "min-h-0 w-full shrink-0 flex-col border-r border-border/70 bg-sidebar/40 xl:flex xl:w-80",
          selected ? "hidden" : "flex",
        )}
      >
        <div data-workspace-enter className="flex h-full min-h-0 flex-col">
          <HubList
            now={now}
            meId={meId}
            state={state}
            groups={groups}
            query={query}
            onQueryChange={onQueryChange}
            onToggleGroup={onToggleGroup}
            activeChannelId={activeChannelId}
            onSelect={onSelect}
            onNewMessage={onNewMessage}
            onNewGroup={onNewGroup}
            searchRef={searchRef}
          />
        </div>
      </div>

      <div
        ref={conversationPaneRef}
        tabIndex={-1}
        aria-label="Otvoren razgovor"
        role="region"
        data-hub-conversation=""
        className={cn("min-h-0 min-w-0 flex-1 flex-col outline-none", selected ? "flex" : "hidden xl:flex")}
      >
        <div data-workspace-enter className="flex h-full min-h-0 flex-col">
          {selected ? (
            conversation
          ) : state.status !== "ready" ? null : (
            <div className="flex h-full items-center justify-center p-6">
              {empty ? (
                <EmptyState
                  icon={MessagesSquare}
                  title="Još nemaš razgovora"
                  description="Pošalji poruku nekome iz tima ili napravi grupu."
                  action={
                    <Button type="button" size="sm" onClick={onNewMessage}>
                      <SquarePen aria-hidden="true" />
                      Nova poruka
                    </Button>
                  }
                  className="max-w-md border-none bg-transparent"
                />
              ) : (
                <EmptyState
                  icon={MessagesSquare}
                  title="Izaberi razgovor"
                  description="Otvori razgovor sa leve strane."
                  className="max-w-md border-none bg-transparent"
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
