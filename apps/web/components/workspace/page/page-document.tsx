"use client";

import { useId, useRef, type ReactNode, type Ref } from "react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Clock3,
  FileX2,
  History,
  LoaderCircle,
  MessageSquare,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";

import { LockBadge, LockNotice } from "@/components/collab/lock";
import { PresenceIndicator, type PresenceEditor } from "@/components/collab/presence-indicator";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/workspace/workspace-ui";
import { cn } from "@/lib/utils";

import { SAVE_STATE_LABELS, type PageEditorSaveState } from "./page-autosave-model";
import { documentMetaLine, type LockView, type PageMenuKey } from "./page-document-model";

export type PageDocumentMenuItem = {
  key: PageMenuKey;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  destructive?: boolean;
  /**
   * Radnja pomera fokus van menija (npr. na unos komentara): izvršava se tek
   * kad se meni zatvori, umesto da Radix vrati fokus na dugme „…".
   */
  afterClose?: boolean;
};

export type PageDocumentNotice = {
  text: string;
  actionLabel: string;
  onAction: () => void;
  secondary?: { label: string; onAction: () => void };
};

/** Selektor dugmeta „Radnje stranice" — fioke otvorene iz menija vraćaju fokus na njega. */
export const PAGE_ACTIONS_SELECTOR = "[data-page-actions]";

export type PageDocumentProps = {
  crumbs: {
    areaLabel: string;
    onOpenArea?: () => void;
    /** Roditelji od vrha ka stranici (bez same stranice — ona je naslov). */
    ancestors: ReadonlyArray<{ id: string; title: string }>;
    onOpenPage?: (id: string) => void;
  };
  title: string;
  /** Naslov i telo menja svako ko sme (`permissions.canEdit`). */
  editable: boolean;
  onTitleChange: (value: string) => void;
  titleRef?: Ref<HTMLInputElement>;
  /** `null` kad gledalac ne menja stranicu (nema čuvanja). */
  saveState: PageEditorSaveState | null;
  /** Traka ispod naslova (nerešen konflikt, izgubljeno pravo izmene). */
  notice?: PageDocumentNotice | null;
  editors: ReadonlyArray<PresenceEditor>;
  lock: { view: LockView; lockedByName: string | null; lockedAt: number | null };
  meta: { authorName: string | null; editorName: string | null; updatedAt: number };
  commentCount: string | null;
  onJumpToComments: () => void;
  onOpenHistory: () => void;
  menuItems: ReadonlyArray<PageDocumentMenuItem>;
  /** Podmeni (npr. „Premesti u oblast") — ide pre brisanja. */
  menuExtra?: ReactNode;
  body: ReactNode;
  subpages: ReactNode;
  /** Autor · Izmena · Zaključano (≥ `lg`). */
  sideFacts: ReactNode;
  relations: ReactNode;
  comments: ReactNode;
  /** Deo u kome se meri „uređuje" (naslov i telo). */
  regionRef?: Ref<HTMLDivElement>;
  now: number;
};

/** Najavljuju se samo problemi; „Čuvam…/Sačuvano" posle svake pauze bi bilo buka. */
const ANNOUNCED_STATES: ReadonlySet<PageEditorSaveState> = new Set(["error", "conflict", "invalid"]);

function SaveStatus({ state, invalidId }: { state: PageEditorSaveState; invalidId?: string }) {
  const Icon =
    state === "saving"
      ? LoaderCircle
      : state === "saved"
        ? Check
        : state === "dirty"
          ? Clock3
          : AlertTriangle;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <Icon
        aria-hidden="true"
        className={cn(
          "size-3.5 shrink-0",
          state === "saving" && "animate-spin motion-reduce:animate-none",
          state === "saved" && "text-success",
          (state === "error" || state === "conflict" || state === "invalid") && "text-destructive",
        )}
      />
      <span id={state === "invalid" ? invalidId : undefined} className="truncate">
        {SAVE_STATE_LABELS[state]}
      </span>
      <span role="status" className="sr-only">
        {ANNOUNCED_STATES.has(state) ? SAVE_STATE_LABELS[state] : ""}
      </span>
    </span>
  );
}

/**
 * Stranica kao dokument tima — prezentacija (PROSTOR P13, P19, P23; plan K07
 * §5.6). Putanja i radnje u gornjem redu; naslov i telo (beleška, tabela ili
 * fajl) za svakog ko sme da menja; podstranice kao lista; bočna kolona sa
 * autorom, izmenom, zaključavanjem i „Povezano"; Komentari ispod. Ispod `lg`
 * bočna kolona postaje meta red i sekcija „Povezano". Bez `useQuery`.
 */
export function PageDocument({
  crumbs,
  title,
  editable,
  onTitleChange,
  titleRef,
  saveState,
  notice,
  editors,
  lock,
  meta,
  commentCount,
  onJumpToComments,
  onOpenHistory,
  menuItems,
  menuExtra,
  body,
  subpages,
  sideFacts,
  relations,
  comments,
  regionRef,
  now,
}: PageDocumentProps) {
  const regular = menuItems.filter((item) => !item.destructive);
  const destructive = menuItems.filter((item) => item.destructive);
  const invalidId = useId();
  const afterCloseRef = useRef<(() => void) | null>(null);
  const select = (item: PageDocumentMenuItem) => {
    if (item.afterClose) afterCloseRef.current = item.onSelect;
    else item.onSelect();
  };
  // Status se crta na dva mesta (≥ md u gornjem redu, ispod md uz meta red), a
  // samo vidljiv primerak nosi id poruke za `aria-describedby` naslova.
  const statusFor = (primary: boolean) => (
    <>
      {saveState ? <SaveStatus state={saveState} invalidId={primary ? invalidId : undefined} /> : null}
      <PresenceIndicator editors={editors} />
    </>
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-4 sm:px-6 lg:px-8 lg:pt-6">
      <div data-workspace-enter className="mb-3 flex min-h-9 items-center gap-2">
        <nav aria-label="Putanja stranice" className="flex min-w-0 flex-1 items-center gap-1 text-xs text-muted-foreground">
          <button
            type="button"
            disabled={!crumbs.onOpenArea}
            onClick={crumbs.onOpenArea}
            className="max-w-40 shrink-0 truncate rounded px-1 py-1 hover:bg-muted/60 hover:text-foreground disabled:hover:bg-transparent"
          >
            {crumbs.areaLabel}
          </button>
          {crumbs.ancestors.map((item) => (
            <span key={item.id} className="flex min-w-0 items-center gap-1">
              <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
              <button
                type="button"
                disabled={!crumbs.onOpenPage}
                onClick={() => crumbs.onOpenPage?.(item.id)}
                className="min-w-0 max-w-48 truncate rounded px-1 py-1 hover:bg-muted/60 hover:text-foreground"
              >
                {item.title.trim() || "Bez naslova"}
              </button>
            </span>
          ))}
        </nav>
        <div className="hidden min-w-0 items-center gap-3 md:flex">{statusFor(true)}</div>
        <Button type="button" variant="ghost" size="sm" className="hidden md:inline-flex" onClick={onJumpToComments}>
          <MessageSquare aria-hidden="true" />
          Komentari
          {commentCount ? <span className="tabular-nums text-muted-foreground">{commentCount}</span> : null}
        </Button>
        <Button type="button" variant="ghost" size="sm" className="hidden md:inline-flex" onClick={onOpenHistory}>
          <History aria-hidden="true" />
          Istorija
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" aria-label="Radnje stranice" data-page-actions="">
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56"
            onCloseAutoFocus={(event) => {
              const run = afterCloseRef.current;
              if (!run) return;
              afterCloseRef.current = null;
              event.preventDefault();
              run();
            }}
          >
            {regular.map((item) => (
              <DropdownMenuItem key={item.key} onSelect={() => select(item)}>
                <item.icon aria-hidden="true" />
                {item.label}
              </DropdownMenuItem>
            ))}
            {menuExtra}
            {destructive.length > 0 ? <DropdownMenuSeparator /> : null}
            {destructive.map((item) => (
              <DropdownMenuItem key={item.key} variant="destructive" onSelect={() => select(item)}>
                <item.icon aria-hidden="true" />
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,46rem)_15rem] lg:gap-x-10">
        <div ref={regionRef} className="min-w-0 lg:col-start-1 lg:row-start-1">
          <h1 className="text-xl font-semibold tracking-[-0.02em] lg:text-2xl">
            {editable ? (
              <input
                ref={titleRef}
                value={title}
                maxLength={200}
                placeholder="Bez naslova"
                aria-label="Naslov stranice"
                aria-invalid={saveState === "invalid"}
                aria-describedby={saveState === "invalid" ? invalidId : undefined}
                onChange={(event) => onTitleChange(event.target.value)}
                className="w-full rounded-md bg-transparent outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              />
            ) : (
              <span className="break-words">{title.trim() || "Bez naslova"}</span>
            )}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-xs leading-5 text-muted-foreground lg:hidden">
              {documentMetaLine({ ...meta, now })}
            </p>
            {lock.view === "locked-editable" ? (
              <LockBadge lockedByName={lock.lockedByName} lockedAt={lock.lockedAt} now={now} />
            ) : null}
            <div className="flex min-w-0 items-center gap-3 md:hidden">{statusFor(false)}</div>
          </div>
          {lock.view === "locked-readonly" ? <LockNotice className="mt-3" /> : null}
          {notice ? (
            <div
              role="alert"
              className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-2">
                <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden="true" />
                {notice.text}
              </span>
              <span className="flex flex-wrap gap-2">
                {notice.secondary ? (
                  <Button type="button" variant="ghost" size="sm" onClick={notice.secondary.onAction}>
                    {notice.secondary.label}
                  </Button>
                ) : null}
                <Button type="button" variant="outline" size="sm" onClick={notice.onAction}>
                  {notice.actionLabel}
                </Button>
              </span>
            </div>
          ) : null}
          <div className="mt-4">{body}</div>
          <div className="mt-8">{subpages}</div>
        </div>

        <aside
          aria-label="Podaci o stranici"
          className="mt-8 min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-1"
        >
          <div className="space-y-6 lg:sticky lg:top-6">
            {sideFacts}
            {relations}
          </div>
        </aside>

        <div className="mt-8 min-w-0 lg:col-start-1 lg:row-start-2">{comments}</div>
      </div>
    </div>
  );
}

/** Učitavanje stranice u obliku dokumenta. */
export function PageDocumentSkeleton() {
  return (
    <div role="status" aria-label="Učitavanje stranice" className="mx-auto w-full max-w-6xl px-4 pb-16 pt-4 sm:px-6 lg:px-8 lg:pt-6">
      <Skeleton className="mb-3 h-9 w-48 rounded-md" />
      <div className="lg:grid lg:grid-cols-[minmax(0,46rem)_15rem] lg:gap-x-10">
        <div className="space-y-3">
          <Skeleton className="h-8 w-3/4 rounded-md" />
          <Skeleton className="h-4 w-1/3 rounded-md" />
          <Skeleton className="mt-6 h-[40vh] rounded-lg" />
        </div>
        <div className="mt-8 hidden space-y-3 lg:mt-1 lg:block">
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-10 rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Prazno („obrisana ili ne postoji") i greška stranice — prezentacija. */
export function PageRouteProblem({
  missing,
  onRetry,
  onOpenTrash,
}: {
  missing: boolean;
  onRetry: () => void;
  onOpenTrash: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <h1 className="sr-only">Stranica</h1>
      {missing ? (
        <EmptyState
          icon={FileX2}
          headingAs="h2"
          title="Ova stranica je obrisana ili ne postoji."
          action={
            <Button type="button" variant="outline" onClick={onOpenTrash}>
              Otvori Korpu
            </Button>
          }
        />
      ) : (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed px-4 py-6 text-sm">
          <p>Stranica nije učitana.</p>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Pokušaj ponovo
          </Button>
        </div>
      )}
    </div>
  );
}
