"use client";

import { useRef, useState } from "react";
import { Check, LoaderCircle, NotebookPen, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const AREA_BRIEFING_LIMIT = 20_000;

export function AreaBriefingDock({
  areaLabel,
  content,
  revision,
  canEdit,
  onSave,
}: {
  areaLabel: string;
  content: string;
  revision: number;
  canEdit: boolean;
  onSave: (content: string, expectedRevision: number) => Promise<number>;
}) {
  const [draft, setDraft] = useState(content);
  const [state, setState] = useState<"saved" | "dirty" | "saving" | "error">(
    "saved",
  );
  const [savedContent, setSavedContent] = useState(content);
  const revisionRef = useRef(revision);
  const draftRef = useRef(content);
  const savedContentRef = useRef(content);
  const savingRef = useRef(false);
  const saveQueuedRef = useRef(false);

  async function save() {
    if (!canEdit) return;
    if (savingRef.current) {
      saveQueuedRef.current = true;
      return;
    }
    const snapshot = draftRef.current;
    if (snapshot === savedContentRef.current) return;
    savingRef.current = true;
    setState("saving");
    try {
      revisionRef.current = await onSave(snapshot, revisionRef.current);
      savedContentRef.current = snapshot;
      setSavedContent(snapshot);
      if (draftRef.current === snapshot) {
        setState("saved");
      } else {
        saveQueuedRef.current = true;
        setState("dirty");
      }
    } catch {
      saveQueuedRef.current = false;
      setState("error");
      return;
    } finally {
      savingRef.current = false;
    }
    if (saveQueuedRef.current) {
      saveQueuedRef.current = false;
      void save();
    }
  }

  return (
    <section
      className="relative overflow-hidden rounded-[1.35rem] border border-border/75 bg-card shadow-sm"
      aria-labelledby="area-briefing-title"
    >
      <div
        className="absolute inset-y-0 left-0 w-1.5 bg-[oklch(0.64_0.13_232)]"
        aria-hidden="true"
      />
      <div className="flex flex-col gap-4 px-5 py-5 pl-7 sm:px-7 sm:pl-9">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sky-500/10 text-sky-700 dark:text-sky-300">
              <NotebookPen className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[0.6875rem] font-bold uppercase tracking-[0.13em] text-sky-700 dark:text-sky-300">
                Briefing oblasti
              </p>
              <h2
                id="area-briefing-title"
                className="mt-1 truncate text-base font-bold tracking-[-0.02em]"
              >
                Glavni kontekst za {areaLabel}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {state === "saving" ? (
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
            ) : state === "saved" ? (
              <Check className="size-3.5 text-emerald-600" aria-hidden="true" />
            ) : null}
            <span aria-live="polite">
              {!canEdit
                ? "Briefing uređuje kreator startupa"
                : state === "saving"
                  ? "Čuvam…"
                  : state === "error"
                    ? "Čuvanje nije uspelo"
                    : state === "dirty"
                      ? "Ima nesačuvanih izmena"
                      : "Sačuvano"}
            </span>
          </div>
        </div>

        <textarea
          value={draft}
          readOnly={!canEdit}
          maxLength={AREA_BRIEFING_LIMIT}
          aria-label={`Glavni briefing oblasti ${areaLabel}`}
          placeholder={
            canEdit
              ? "Zapiši cilj oblasti, važne odluke i zajednički kontekst…"
              : "Kreator startupa još nije dodao briefing za ovu oblast."
          }
          className={cn(
            "min-h-28 w-full resize-y rounded-xl border border-border/70 bg-background/70 px-4 py-3 text-sm leading-6 outline-none transition-shadow placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring",
            !canEdit && "cursor-default bg-muted/20",
          )}
          onChange={(event) => {
            const nextDraft = event.target.value;
            draftRef.current = nextDraft;
            setDraft(nextDraft);
            setState(
              savingRef.current
                ? "saving"
                : nextDraft === savedContentRef.current
                  ? "saved"
                  : "dirty",
            );
          }}
          onBlur={() => void save()}
        />

        {canEdit ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[0.6875rem] tabular-nums text-muted-foreground">
              {draft.length.toLocaleString("sr-Latn-RS")}/
              {AREA_BRIEFING_LIMIT.toLocaleString("sr-Latn-RS")}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-xl"
              disabled={state === "saving" || draft === savedContent}
              onClick={() => void save()}
            >
              {state === "saving" ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Save />
              )}
              Sačuvaj briefing
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
