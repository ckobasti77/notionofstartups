"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import { ConvexProvider, ConvexReactClient, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useMemo, useRef, useState } from "react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/** Vrste kanvasa iz `docs/mobile/00-PLAN.md` §5.2. */
export type CanvasKind = "thoughts" | "ideas" | "area" | "page";
type ThemeMode = "light" | "dark";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

/**
 * Poruka native ljusci preko RN `WebView` mosta (`window.ReactNativeWebView`).
 * Namerno bez `window.parent` iframe fallback-a: globalni `next.config.ts` postavlja
 * `frame-ancestors 'none'`, pa embed i tako ne sme u iframe — jedini podržani
 * kontekst je RN WebView. Protokol: `docs/mobile/00-PLAN.md` §5.2.
 */
function postNative(message: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const bridge = (window as unknown as { ReactNativeWebView?: { postMessage: (s: string) => void } })
    .ReactNativeWebView;
  bridge?.postMessage(JSON.stringify(message));
}

/** Koliko čekamo prvu `auth` poruku pre nego što odustanemo (umesto večnog spinera). */
const AUTH_TIMEOUT_MS = 10_000;

/**
 * Chrome-less embed kanvasa za mobilni `WebView` (W4.2, §5.2). Token NE stiže kroz
 * URL — embed se učita bez njega, javi `ready`, pa native pošalje `{type:"auth",
 * token}`. Tek na prvi token pravi se `ConvexReactClient`; svaki sledeći token
 * (refresh) samo ponovo pozove `setAuth` koji čita iz `tokenRef`, pa se klijent NE
 * pravi iznova — socket, subscription i ReactFlow pan/zoom preživljavaju. Ovaj
 * `ConvexProvider` zaseni onaj iz root layout-a (cookie-auth) za ceo podstablo.
 */
export function CanvasEmbed({
  kind,
  id,
  theme,
}: {
  kind: CanvasKind;
  id: string;
  theme: ThemeMode;
}) {
  const [client, setClient] = useState<ConvexReactClient | null>(null);
  const [authTimedOut, setAuthTimedOut] = useState(false);
  // Token živi u ref-u da ga `setAuth` čita bez prestvaranja klijenta.
  const tokenRef = useRef<string | null>(null);
  const clientRef = useRef<ConvexReactClient | null>(null);

  useEffect(() => {
    if (!convexUrl) return;
    const handle = (raw: unknown) => {
      if (typeof raw !== "string") return;
      let msg: { type?: string; token?: string };
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (msg.type !== "auth" || !msg.token) return;
      tokenRef.current = msg.token;
      if (clientRef.current) {
        // Refresh: re-auth u mestu (isti klijent), token se čita iz ref-a.
        void clientRef.current.setAuth(async () => tokenRef.current ?? "");
      } else {
        const c = new ConvexReactClient(convexUrl);
        void c.setAuth(async () => tokenRef.current ?? "");
        clientRef.current = c;
        // Namerno: ako auth stigne i posle isteka (spora mreža), oporavi se u kanvas
        // umesto da ostane zaglavljen na grešci. Retke i kratke zakasnele isporuke ne
        // treba da trajno „zaključaju" ekran.
        setAuthTimedOut(false);
        setClient(c);
      }
    };
    // iOS isporučuje preko `window`, Android preko `document`.
    const onWindow = (e: MessageEvent) => handle(e.data);
    const onDocument = (e: Event) => handle((e as MessageEvent).data);
    window.addEventListener("message", onWindow);
    document.addEventListener("message", onDocument);
    postNative({ type: "ready", kind });
    const timer = window.setTimeout(() => {
      if (!clientRef.current) setAuthTimedOut(true);
    }, AUTH_TIMEOUT_MS);
    return () => {
      window.removeEventListener("message", onWindow);
      document.removeEventListener("message", onDocument);
      window.clearTimeout(timer);
    };
  }, [kind]);

  // Zatvori klijent (i njegov socket) samo na unmount — ne na promenu tokena.
  useEffect(() => {
    return () => {
      void clientRef.current?.close();
    };
  }, []);

  if (!convexUrl) {
    return <Center role="alert">Konfiguracija nije potpuna (NEXT_PUBLIC_CONVEX_URL).</Center>;
  }
  if (authTimedOut && !client) {
    return (
      <Center role="alert">Autentikacija nije stigla. Zatvori kanvas i pokušaj ponovo.</Center>
    );
  }
  if (!client) {
    return <Center>Povezivanje…</Center>;
  }

  return (
    <ConvexProvider client={client}>
      <ReactFlowProvider>
        <CanvasInner kind={kind} id={id} initialTheme={theme} />
      </ReactFlowProvider>
    </ConvexProvider>
  );
}

function CanvasInner({
  kind,
  id,
  initialTheme,
}: {
  kind: CanvasKind;
  id: string;
  initialTheme: ThemeMode;
}) {
  const [colorMode, setColorMode] = useState<ThemeMode>(initialTheme);
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  useEffect(() => {
    const apply = () => document.documentElement.classList.toggle("dark", colorMode === "dark");
    apply();
    // Root layout `ThemeProvider` primeni svoju (system/localStorage) temu u mount
    // efektu — a roditeljski efekti idu POSLE dečjih, pa bi pregazio naš `?theme=`.
    // rAF re-asserta posle commit-a da tema iz query-ja / native poruke pobedi.
    const raf = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(raf);
  }, [colorMode]);

  // Prijem view-poruka iz native ljuske (protokol §5.2: theme/focus/zoom/fit).
  // `auth`/`ready` handshake je iznad, u `CanvasEmbed`; oba listenera koegzistiraju
  // i svaki ignoriše tuđe tipove. iOS isporučuje preko `window`, Android `document`.
  useEffect(() => {
    const handle = (raw: unknown) => {
      if (typeof raw !== "string") return;
      let msg: { type?: string; mode?: string; nodeId?: string; direction?: string };
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (msg.type === "theme" && (msg.mode === "light" || msg.mode === "dark")) {
        setColorMode(msg.mode);
      } else if (msg.type === "focus" && msg.nodeId) {
        void fitView({ nodes: [{ id: msg.nodeId }], duration: 500, maxZoom: 1.4 });
      } else if (msg.type === "fit") {
        void fitView({ duration: 400 });
      } else if (msg.type === "zoom") {
        if (msg.direction === "out") void zoomOut({ duration: 200 });
        else void zoomIn({ duration: 200 });
      }
    };
    const onWindow = (e: MessageEvent) => handle(e.data);
    const onDocument = (e: Event) => handle((e as MessageEvent).data);
    window.addEventListener("message", onWindow);
    document.addEventListener("message", onDocument);
    return () => {
      window.removeEventListener("message", onWindow);
      document.removeEventListener("message", onDocument);
    };
  }, [fitView, zoomIn, zoomOut]);

  if (kind === "ideas") {
    return <IdeasFlow startupId={id as Id<"startups">} colorMode={colorMode} />;
  }
  if (kind === "thoughts") {
    return <ThoughtsFlow startupId={id as Id<"startups">} colorMode={colorMode} />;
  }
  if (kind === "area") {
    return <AreaFlow areaId={id as Id<"startupAreas">} colorMode={colorMode} />;
  }
  // Preostaje "page" (page.tsx validira `kind`, pa su sve četiri vrste pokrivene).
  return <PageFlow pageId={id as Id<"pages">} colorMode={colorMode} />;
}

/**
 * Zajednički read-only ReactFlow za embed (deljen između `IdeasFlow`/`ThoughtsFlow`).
 * Čvorovi/ivice su već izračunati (apsolutne pozicije); ovde je samo prikaz + most.
 * `detailById` nosi detalj čvora koji se prosleđuje native ljusci uz `node:open`/
 * `selection` (bez drugog upita). Vrednost je proizvoljna — samo se JSON-serializuje.
 */
function EmbedFlow({
  nodes,
  edges,
  detailById,
  colorMode,
  ariaLabel,
  emptyLabel,
}: {
  nodes: Node[];
  edges: Edge[];
  detailById: Map<string, unknown>;
  colorMode: ThemeMode;
  ariaLabel: string;
  emptyLabel: string;
}) {
  return (
    <div className="fixed inset-0 bg-background" role="application" aria-label={ariaLabel}>
      <EmbedStyles />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        colorMode={colorMode}
        fitView
        minZoom={0.15}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        panOnDrag
        zoomOnPinch
        zoomOnScroll
        panOnScroll={false}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) =>
          postNative({ type: "node:open", nodeId: node.id, node: detailById.get(node.id) })
        }
        onSelectionChange={({ nodes: selected }) => {
          const ids = selected.map((n) => n.id);
          // Detalj šaljemo samo kad je izabran baš jedan čvor — native rail tada
          // dobija primarnu akciju za taj čvor (§5.2).
          postNative({
            type: "selection",
            ids,
            node: ids.length === 1 ? detailById.get(ids[0]) : undefined,
          });
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
      {nodes.length === 0 ? (
        <div
          role="status"
          className="pointer-events-none absolute inset-0 grid place-items-center"
        >
          <span className="text-sm text-muted-foreground">{emptyLabel}</span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Čvor iz `ideas.list`, izveden iz stvarnog povratnog tipa upita (ne ručno kucan):
 * već nosi `upvotes`/`downvotes`/`userVote`/`author`, pa embed te podatke prosleđuje
 * native detalju uz `node:open`/`selection` (native ne radi drugi `useQuery`). Ako se
 * backend oblik promeni, `toNodeDetail` pukne u build-u umesto da tiho pošalje `undefined`.
 */
type IdeaListNode = FunctionReturnType<typeof api.ideas.list>["nodes"][number];

/** Detalj čvora koji embed šalje native ljusci (isti oblik kao mobilni `IdeaDetail`). */
type IdeaNodeDetail = {
  _id: Id<"ideaNodes">;
  title: string | null;
  text: string;
  upvotes: number;
  downvotes: number;
  userVote: "up" | "down" | null;
  author: { displayName: string } | null;
};

function toNodeDetail(node: IdeaListNode): IdeaNodeDetail {
  return {
    _id: node._id,
    title: node.title,
    text: node.text,
    upvotes: node.upvotes,
    downvotes: node.downvotes,
    userVote: node.userVote,
    author: node.author ? { displayName: node.author.displayName } : null,
  };
}

function IdeasFlow({ startupId, colorMode }: { startupId: Id<"startups">; colorMode: ThemeMode }) {
  const data = useQuery(api.ideas.list, { startupId });

  const { nodes, edges, detailById } = useMemo(() => {
    if (!data)
      return {
        nodes: [] as Node[],
        edges: [] as Edge[],
        detailById: new Map<string, IdeaNodeDetail>(),
      };
    const raw = data.nodes;
    const byId = new Map(raw.map((n) => [n._id, n]));
    // Detalj po id-u: native ga dobija uz `node:open`/`selection` (bez drugog upita).
    const detailById = new Map<string, IdeaNodeDetail>(
      raw.map((n) => [n._id as string, toNodeDetail(n)]),
    );
    // Pozicije ugnježdenih čvorova su relativne u odnosu na roditelja; ovde ih
    // sabiramo uz lanac roditelja u apsolutne, pa render ide ravno (bez
    // ReactFlow parent/child grafike koja traži poseban redosled).
    const absolute = (node: IdeaListNode) => {
      let x = node.x;
      let y = node.y;
      let parent = node.parentIdeaId;
      const seen = new Set<string>([node._id]);
      while (parent && !seen.has(parent)) {
        seen.add(parent);
        const parentNode = byId.get(parent);
        if (!parentNode) break;
        x += parentNode.x;
        y += parentNode.y;
        parent = parentNode.parentIdeaId;
      }
      return { x, y };
    };
    return {
      nodes: raw.map((node) => ({
        id: node._id,
        position: absolute(node),
        data: { label: (node.title ?? node.text ?? "Ideja").trim().slice(0, 80) || "Ideja" },
        className: node.isApproved ? "embed-node embed-node--approved" : "embed-node",
      })),
      edges: data.edges.map((edge) => ({
        id: edge._id,
        source: edge.nodeAId,
        target: edge.nodeBId,
      })),
      detailById,
    };
  }, [data]);

  if (data === undefined) return <Center>Učitavanje kanvasa…</Center>;

  return (
    <EmbedFlow
      nodes={nodes}
      edges={edges}
      detailById={detailById}
      colorMode={colorMode}
      ariaLabel="Kanvas ideja"
      emptyLabel="Prazan kanvas ideja."
    />
  );
}

/** Detalj misli koji embed šalje native ljusci (isti oblik kao mobilni `ThoughtDetail`). */
type ThoughtNodeDetail = {
  _id: Id<"thoughtNodes">;
  title: string | null;
  text: string;
  color: string;
  isParent: boolean;
};

type ThoughtListNode = FunctionReturnType<typeof api.thoughts.listNodes>["page"][number];

function toThoughtDetail(node: ThoughtListNode): ThoughtNodeDetail {
  return {
    _id: node._id,
    title: node.title,
    text: node.text,
    color: node.color,
    isParent: node.isParent ?? false,
  };
}

/** Server cap-ovi paginacije (`thoughts.ts`): 100 čvorova / 200 ivica po stranici. */
const THOUGHT_NODE_PAGE = 100;
const THOUGHT_EDGE_PAGE = 200;

/**
 * Kanvas misli u embed-u. VAŽNO — misli su PRIVATNE po vlasniku: `thoughts.listNodes`/
 * `listEdges` na serveru filtriraju `ownerProfileId === profile._id`, pa embed uvek
 * pokazuje samo misli ULOGOVANOG korisnika (za razliku od zajedničkih ideja).
 * Identitet stiže kroz auth-most (token), tako da server zna čije su.
 *
 * Za razliku od `IdeasFlow` (jedan `useQuery`), `listNodes`/`listEdges` su paginirani —
 * učitavamo do iscrpljenja da ceo graf bude na platnu. Pozicije ugnježdenih misli su
 * relativne u odnosu na roditelja (`parentThoughtId`), pa se sabiraju u apsolutne isto
 * kao kod ideja.
 */
function ThoughtsFlow({
  startupId,
  colorMode,
}: {
  startupId: Id<"startups">;
  colorMode: ThemeMode;
}) {
  const {
    results: nodeResults,
    status: nodeStatus,
    loadMore: loadMoreNodes,
  } = usePaginatedQuery(api.thoughts.listNodes, { startupId }, { initialNumItems: THOUGHT_NODE_PAGE });
  const {
    results: edgeResults,
    status: edgeStatus,
    loadMore: loadMoreEdges,
  } = usePaginatedQuery(api.thoughts.listEdges, { startupId }, { initialNumItems: THOUGHT_EDGE_PAGE });

  useEffect(() => {
    if (nodeStatus === "CanLoadMore") loadMoreNodes(THOUGHT_NODE_PAGE);
  }, [nodeStatus, loadMoreNodes]);
  useEffect(() => {
    if (edgeStatus === "CanLoadMore") loadMoreEdges(THOUGHT_EDGE_PAGE);
  }, [edgeStatus, loadMoreEdges]);

  const { nodes, edges, detailById } = useMemo(() => {
    const raw = nodeResults;
    const byId = new Map(raw.map((n) => [n._id, n]));
    const detailById = new Map<string, unknown>(
      raw.map((n) => [n._id as string, toThoughtDetail(n)]),
    );
    const absolute = (node: ThoughtListNode) => {
      let x = node.x;
      let y = node.y;
      let parent = node.parentThoughtId;
      const seen = new Set<string>([node._id]);
      while (parent && !seen.has(parent)) {
        seen.add(parent);
        const parentNode = byId.get(parent);
        if (!parentNode) break;
        x += parentNode.x;
        y += parentNode.y;
        parent = parentNode.parentThoughtId;
      }
      return { x, y };
    };
    return {
      nodes: raw.map((node) => ({
        id: node._id,
        position: absolute(node),
        data: { label: (node.title ?? node.text ?? "Misao").trim().slice(0, 80) || "Misao" },
        className: "embed-node",
      })) as Node[],
      edges: edgeResults.map((edge) => ({
        id: edge._id,
        source: edge.nodeAId,
        target: edge.nodeBId,
      })) as Edge[],
      detailById,
    };
  }, [nodeResults, edgeResults]);

  if (nodeStatus === "LoadingFirstPage") return <Center>Učitavanje kanvasa…</Center>;

  return (
    <EmbedFlow
      nodes={nodes}
      edges={edges}
      detailById={detailById}
      colorMode={colorMode}
      ariaLabel="Kanvas misli"
      emptyLabel="Prazan kanvas misli."
    />
  );
}

/** Payload je isti za oblast i stranicu (`canvasPayloadValidator`) — jedan render put. */
type PageCanvasData = FunctionReturnType<typeof api.areasV2.getAreaCanvasByArea>;

/** Detalj page-čvora koji embed šalje native ljusci (na mobilnom otvara ekran stranice). */
type PageNodeDetail = {
  _id: Id<"pages">;
  title: string;
  kind: string;
};

/**
 * Zajednički prikaz za kanvas oblasti i stranice — payload je identičan, razlikuje se
 * samo upit (resolver po `areaId` vs `pageId`) i prazna poruka. Pozicije stranica su
 * već izračunate na serveru (placement ili grid fallback), pa se koriste direktno.
 * Checkpoint-ivice se namerno preskaču: povezuju checkpoint pod-čvorove koje ovaj
 * pregledni embed ne crta (§5.2 — mobilni canvas je pregled/navigacija).
 */
function PageCanvasView({
  data,
  colorMode,
  ariaLabel,
  emptyLabel,
}: {
  data: PageCanvasData;
  colorMode: ThemeMode;
  ariaLabel: string;
  emptyLabel: string;
}) {
  const { nodes, edges, detailById } = useMemo(() => {
    const detailById = new Map<string, unknown>(
      data.pages.map((page) => [
        page._id as string,
        { _id: page._id, title: page.title, kind: page.kind } satisfies PageNodeDetail,
      ]),
    );
    return {
      nodes: data.pages.map((page) => ({
        id: page._id,
        position: { x: page.x, y: page.y },
        data: { label: (page.title || "Stranica").trim().slice(0, 80) || "Stranica" },
        className: "embed-node",
      })) as Node[],
      // Canvas ivice + relacije stranica dele isti oblik (source/target po id-u stranice).
      edges: [...data.edges, ...data.relations].map((edge) => ({
        id: edge._id,
        source: edge.source,
        target: edge.target,
      })) as Edge[],
      detailById,
    };
  }, [data]);

  return (
    <EmbedFlow
      nodes={nodes}
      edges={edges}
      detailById={detailById}
      colorMode={colorMode}
      ariaLabel={ariaLabel}
      emptyLabel={emptyLabel}
    />
  );
}

/** Kanvas oblasti u embed-u — resolver po `areaId` (`rootPageId: null`). */
function AreaFlow({
  areaId,
  colorMode,
}: {
  areaId: Id<"startupAreas">;
  colorMode: ThemeMode;
}) {
  const data = useQuery(api.areasV2.getAreaCanvasByArea, { areaId });
  if (data === undefined) return <Center>Učitavanje kanvasa…</Center>;
  return (
    <PageCanvasView
      data={data}
      colorMode={colorMode}
      ariaLabel="Kanvas oblasti"
      emptyLabel="Prazan kanvas oblasti."
    />
  );
}

/** Kanvas stranice u embed-u — resolver po `pageId` (`rootPageId: pageId`). */
function PageFlow({
  pageId,
  colorMode,
}: {
  pageId: Id<"pages">;
  colorMode: ThemeMode;
}) {
  const data = useQuery(api.areasV2.getPageCanvasByPage, { pageId });
  if (data === undefined) return <Center>Učitavanje kanvasa…</Center>;
  return (
    <PageCanvasView
      data={data}
      colorMode={colorMode}
      ariaLabel="Kanvas stranice"
      emptyLabel="Prazan kanvas stranice."
    />
  );
}

function Center({
  children,
  role = "status",
}: {
  children: React.ReactNode;
  role?: "status" | "alert";
}) {
  return (
    <div
      role={role}
      aria-live={role === "alert" ? "assertive" : "polite"}
      className="fixed inset-0 grid place-items-center bg-background px-6 text-center text-foreground"
    >
      <div>{children}</div>
    </div>
  );
}

/** Krupnije touch mete za ReactFlow kontrole (pan/zoom bez miša). */
function EmbedStyles() {
  return (
    <style>{`
      .react-flow__controls-button { width: 2.75rem; height: 2.75rem; }
      .react-flow__controls-button svg { max-width: 1.2rem; max-height: 1.2rem; }
      .embed-node--approved { box-shadow: 0 0 0 2px var(--primary); }
    `}</style>
  );
}
