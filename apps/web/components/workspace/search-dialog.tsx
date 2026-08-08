"use client";

import { Component, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import {
  Brain,
  CheckSquare2,
  FileText,
  Lightbulb,
  LoaderCircle,
  MessageSquare,
  Search,
  TriangleAlert,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { WorkspaceRoute } from "@/components/workspace/types";
import { EmptyState } from "@/components/workspace/workspace-ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * Pretraga celog startupa. Pet grupa, isti redosled kao mobilni (`pretraga.tsx`):
 * Stranice i Zadaci iz `search.pages` (po `kind`), Ideje i Misli iz
 * `search.ideasAndThoughts`, Poruke iz `chat.searchMessages` (kanal-level authz je
 * unutar te funkcije). Debounce 300 ms, minimum 2 znaka — paritet sa mobilnim.
 *
 * Navigacija je na nivou sekcije (nema deep-linka do čvora/poruke): stranice i
 * zadaci otvaraju detalj u mestu (`onOpenPage`), a ideje/misli/poruke vode na svoj
 * prikaz kroz `onNavigate` (isti obrazac kao klik na obaveštenje).
 *
 * Upiti su izdvojeni u `SearchResults` iza `SearchResultsBoundary`: Convex
 * `useQuery` baca grešku upita naviše, pa bi bez granice pad pretrage srušio ceo
 * radni prostor. Polje i chrome dijaloga ostaju van granice, pa greška u
 * rezultatima ne ruši ni njih ni ostatak workspace-a.
 */
export function SearchDialog({
  open,
  onOpenChange,
  startupId,
  onOpenPage,
  onNavigate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  startupId: Id<"startups">;
  onOpenPage: (pageId: Id<"pages">) => void;
  onNavigate: (route: WorkspaceRoute) => void;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const normalizedQuery = query.trim();

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(normalizedQuery), 300);
    return () => window.clearTimeout(timer);
  }, [normalizedQuery]);

  const queryIsReady =
    open && normalizedQuery.length >= 2 && debouncedQuery === normalizedQuery;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[12vh] max-w-2xl translate-y-0 gap-0 overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Pretraga</DialogTitle>
          <DialogDescription>
            Pretraži stranice, zadatke, ideje, misli i poruke u startupu.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3 border-b px-4">
          <Search aria-hidden="true" className="size-5 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Pretraži beleške, zadatke, ideje…"
            aria-label="Pretraga"
            className="h-14 border-0 px-0 text-base shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="scrollbar-thin max-h-[60vh] min-h-64 overflow-y-auto p-2">
          {normalizedQuery.length < 2 ? (
            <EmptyState
              icon={Search}
              title="Pronađi ono što ti treba"
              description="Unesi bar dva slova. Pretražujemo stranice, zadatke, ideje, misli i poruke ovog startupa."
              className="min-h-60 border-0 bg-transparent"
            />
          ) : (
            <SearchResultsBoundary>
              <SearchResults
                startupId={startupId}
                query={debouncedQuery}
                normalizedQuery={normalizedQuery}
                ready={queryIsReady}
                onOpenPage={onOpenPage}
                onNavigate={onNavigate}
                onClose={() => onOpenChange(false)}
              />
            </SearchResultsBoundary>
          )}
        </div>
        <p className="border-t bg-muted/25 px-4 py-2 text-[0.6875rem] text-muted-foreground">
          Savet: pritisni <kbd className="rounded border bg-card px-1 py-0.5 font-mono">Ctrl K</kbd> da otvoriš pretragu.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function SearchResults({
  startupId,
  query,
  normalizedQuery,
  ready,
  onOpenPage,
  onNavigate,
  onClose,
}: {
  startupId: Id<"startups">;
  query: string;
  normalizedQuery: string;
  ready: boolean;
  onOpenPage: (pageId: Id<"pages">) => void;
  onNavigate: (route: WorkspaceRoute) => void;
  onClose: () => void;
}) {
  const pages = useQuery(
    api.search.pages,
    ready ? { query, startupId, limit: 30 } : "skip",
  );
  const messages = useQuery(
    api.chat.searchMessages,
    ready ? { startupId, term: query } : "skip",
  );
  const nodes = useQuery(
    api.search.ideasAndThoughts,
    ready ? { startupId, query, limit: 30 } : "skip",
  );

  const pageList = pages ?? [];
  const otherPages = pageList.filter((page) => page.kind !== "task");
  const tasks = pageList.filter((page) => page.kind === "task");
  const ideas = nodes?.ideas ?? [];
  const thoughts = nodes?.thoughts ?? [];
  const msgs = messages ?? [];

  const loading =
    !ready || pages === undefined || messages === undefined || nodes === undefined;
  const total =
    otherPages.length + tasks.length + ideas.length + thoughts.length + msgs.length;

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-60 items-center justify-center gap-2 text-sm text-muted-foreground"
      >
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> Pretražujem
      </div>
    );
  }
  if (total === 0) {
    return (
      <EmptyState
        icon={Search}
        title="Nema rezultata"
        description={`Ništa ne odgovara upitu „${normalizedQuery}“. Probaj kraći izraz.`}
        className="min-h-60 border-0 bg-transparent"
      />
    );
  }
  return (
    <div className="flex flex-col">
      {otherPages.length > 0 ? (
        <Group title="Stranice">
          {otherPages.map((page) => (
            <ResultRow
              key={page._id}
              icon={<FileText className="size-4" />}
              title={page.title}
              subtitle={`${page.area?.label ?? "Oblast"} · ${page.startup?.name ?? "Startup"}`}
              onClick={() => {
                onOpenPage(page._id);
                onClose();
              }}
            />
          ))}
        </Group>
      ) : null}
      {tasks.length > 0 ? (
        <Group title="Zadaci">
          {tasks.map((page) => (
            <ResultRow
              key={page._id}
              icon={<CheckSquare2 className="size-4" />}
              title={page.title}
              subtitle={`${page.area?.label ?? "Oblast"} · ${page.startup?.name ?? "Startup"}`}
              onClick={() => {
                onOpenPage(page._id);
                onClose();
              }}
            />
          ))}
        </Group>
      ) : null}
      {ideas.length > 0 ? (
        <Group title="Ideje">
          {ideas.map((node) => (
            <ResultRow
              key={node._id}
              icon={<Lightbulb className="size-4" />}
              title={nodePrimary(node)}
              subtitle={nodeSubtitle(node)}
              onClick={() => {
                onNavigate({ kind: "ideas" });
                onClose();
              }}
            />
          ))}
        </Group>
      ) : null}
      {thoughts.length > 0 ? (
        <Group title="Misli">
          {thoughts.map((node) => (
            <ResultRow
              key={node._id}
              icon={<Brain className="size-4" />}
              title={nodePrimary(node)}
              subtitle={nodeSubtitle(node)}
              onClick={() => {
                onNavigate({ kind: "thoughts" });
                onClose();
              }}
            />
          ))}
        </Group>
      ) : null}
      {msgs.length > 0 ? (
        <Group title="Poruke">
          {msgs.map((message) => (
            <ResultRow
              key={message._id}
              icon={<MessageSquare className="size-4" />}
              title={message.body || "Prilog"}
              subtitle={`${message.channelName}${message.author ? ` · ${message.author.displayName}` : ""}`}
              onClick={() => {
                onNavigate({ kind: "chat", channelId: message.channelId });
                onClose();
              }}
            />
          ))}
        </Group>
      ) : null}
    </div>
  );
}

// Naslov ideje/misli je opcion — kad ga nema, tekst čvora nosi primarni red.
function nodePrimary(node: { title: string | null; text: string }) {
  return node.title?.trim() || node.text.trim() || "Bez naslova";
}
function nodeSubtitle(node: { title: string | null; text: string }) {
  const title = node.title?.trim();
  const body = node.text.trim();
  return title && body ? body : "";
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="pb-1">
      <h3 className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <ul>{children}</ul>
    </div>
  );
}

function ResultRow({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className="flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-accent/55"
        onClick={onClick}
      >
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/9 text-primary"
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{title}</span>
          {subtitle ? (
            <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

/**
 * Convex `useQuery` baca grešku upita tokom rendera. Bez ove granice pad bilo koje
 * od tri pretrage srušio bi ceo workspace do korenskog `app/error.tsx`. Granica
 * hvata i prikazuje kontejnerizovanu grešku (kao mobilni `PretragaError`) umesto
 * pada. Resetuje se kad se dijalog ponovo otvori — shell remontira `SearchDialog`
 * (`key={searchOpen}`), pa se i ova granica montira iznova.
 */
class SearchResultsBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <EmptyState
          icon={TriangleAlert}
          title="Pretraga ne radi"
          description="Došlo je do greške pri pretrazi. Izmeni upit i pokušaj ponovo."
          className="min-h-60 border-0 bg-transparent"
        />
      );
    }
    return this.props.children;
  }
}
