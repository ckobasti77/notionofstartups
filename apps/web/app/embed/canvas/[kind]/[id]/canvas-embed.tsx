"use client";

import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  useStoreApi,
  type Edge,
} from "@xyflow/react";
import { ConvexProvider, ConvexReactClient, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { pageKindLabel } from "@/lib/page-kinds";

import {
  EMBED_NODE_HEIGHT,
  EMBED_NODE_TYPE,
  EMBED_NODE_TYPES,
  EMBED_NODE_WIDTH,
  type EmbedFlowNode,
} from "./embed-node";

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
function postNative(message: Record<string, unknown>): boolean {
  if (typeof window === "undefined") return false;
  const bridge = (window as unknown as { ReactNativeWebView?: { postMessage: (s: string) => void } })
    .ReactNativeWebView;
  if (!bridge) return false;
  bridge.postMessage(JSON.stringify(message));
  return true;
}

/**
 * Srpske a11y poruke za `ReactFlow` (čitač ekrana). Kao u desktop kanvasima, const se
 * namerno duplira po fajlu (nije deljen). Generičke („čvor") — isti `EmbedFlow` crta
 * sve četiri vrste kanvasa, pa se prosleđuje uz konkretan `aria-label` po vrsti.
 */
const SERBIAN_ARIA_LABELS = {
  "node.a11yDescription.default":
    "Pritisni Enter ili Space da izabereš čvor. Strelicama ga pomeraš.",
  "node.a11yDescription.keyboardDisabled": "Ovaj čvor se ne može pomerati tastaturom.",
  "node.a11yDescription.ariaLiveMessage": ({
    direction,
    x,
    y,
  }: {
    direction: string;
    x: number;
    y: number;
  }) => `Čvor je pomeren ${direction}. Nova pozicija je ${Math.round(x)}, ${Math.round(y)}.`,
  "edge.a11yDescription.default": "Pritisni Enter ili Space da izabereš vezu.",
  "controls.ariaLabel": "Kontrole kanvasa",
  "controls.zoomIn.ariaLabel": "Uvećaj prikaz",
  "controls.zoomOut.ariaLabel": "Umanji prikaz",
  "controls.fitView.ariaLabel": "Prikaži sve",
  "controls.interactive.ariaLabel": "Uključi ili isključi interakciju",
  "minimap.ariaLabel": "Minimapa",
  "handle.ariaLabel": "Tačka za povezivanje",
} as const;

/**
 * `useLayoutEffect` na serveru ne radi (i baca upozorenje); na klijentu trči posle
 * commit-a a PRE paint-a, pa bootstrap prebaci stanje bez vidljivog frejma. Za razliku
 * od lazy `useState` initializer-a (koji trči i na serveru i tokom hidracije, pa vraća
 * različit rezultat → hydration mismatch), efekat ne trči na serveru ni tokom hidracije:
 * SSR i prvi klijentski render oba pokažu `boot`, a stanje se prebaci tek posle commit-a.
 */
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Oblik `window.__DEVOTION_AUTH__` koji native injektuje pre učitavanja stranice. */
type DevotionAuth = { token?: string; theme?: string };

/**
 * Trajanje animacija kamere (fit/focus/zoom) uz poštovanje `prefers-reduced-motion` —
 * isti obrazac kao `area-canvas-view.tsx` i `thoughts-canvas-view.tsx`. Čita se pri
 * svakoj akciji (ne jednom na mount-u) jer korisnik može da promeni sistemsku postavku
 * dok je kanvas otvoren.
 */
function motionDuration(ms: number): number {
  if (typeof window === "undefined") return 0;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : ms;
}

/**
 * Chrome-less embed kanvasa za mobilni `WebView` (W4.2, §5.2). Token NE stiže kroz URL
 * ni kroz `postMessage` handshake: native ga injektuje u `window.__DEVOTION_AUTH__` preko
 * `injectedJavaScriptBeforeContentLoaded` PRE učitavanja stranice, pa ga čitamo sinhrono
 * na mount-u (nema trke sa startom mosta — pet rundi debagovanja handshake-a; §5.2 i
 * ZA-POPRAVKU Z2). Na prvi token pravi se `ConvexReactClient`; svaki sledeći token (refresh
 * kroz most) samo ponovo pozove `setAuth` iz `tokenRef`, pa se klijent NE pravi iznova —
 * socket, subscription i ReactFlow pan/zoom preživljavaju. Ovaj `ConvexProvider` zaseni onaj
 * iz root layout-a (cookie-auth) za ceo podstablo. Otvoreno u običnom browseru (nema
 * injekcije) → jasna poruka, ne spiner.
 */
export function CanvasEmbed({ kind, id }: { kind: CanvasKind; id: string }) {
  // "boot": čita se injekcija (najviše jedan commit); "app": klijent spreman;
  // "no-app": nema injekcije (običan browser) — terminalno, bez spinera i bez timeout-a.
  const [status, setStatus] = useState<"boot" | "app" | "no-app">("boot");
  const [client, setClient] = useState<ConvexReactClient | null>(null);
  // Token živi u ref-u da ga `setAuth` čita bez prestvaranja klijenta; tema iz injekcije
  // je samo inicijalna (dalje promene idu kroz `theme` most poruku). Tema je state (ne
  // ref) jer se čita u renderu — eslint `react-hooks/refs` zabranjuje `ref.current` tamo.
  const tokenRef = useRef<string | null>(null);
  const clientRef = useRef<ConvexReactClient | null>(null);
  const [initialTheme, setInitialTheme] = useState<ThemeMode>("light");

  useIsoLayoutEffect(() => {
    if (!convexUrl) return;
    const auth = (window as unknown as { __DEVOTION_AUTH__?: DevotionAuth }).__DEVOTION_AUTH__;
    if (!auth?.token) {
      // Nema injekcije → stranica je otvorena van Devotion aplikacije.
      setStatus("no-app");
      return;
    }
    tokenRef.current = auth.token;
    setInitialTheme(auth.theme === "dark" ? "dark" : "light");
    const c = new ConvexReactClient(convexUrl);
    void c.setAuth(async () => tokenRef.current ?? "");
    clientRef.current = c;
    setClient(c);
    setStatus("app");
    // Zatvaranje je UPARENO sa kreiranjem u istom efektu: React Strict Mode (dev, podrazumevano
    // uključen u App Router-u) izvrši efekat dvaput (setup→cleanup→setup). Da cleanup zatvara
    // klijent iz odvojenog efekta, prvi napravljeni klijent bi ostao otvoren (curenje socket-a),
    // a drugi efekat bi zatvorio pogrešnu instancu. Uparivanje garantuje da se svaki napravljeni
    // klijent i zatvori — i u Strict Mode-u i na stvarni unmount.
    return () => {
      void c.close();
      if (clientRef.current === c) clientRef.current = null;
    };
  }, []);

  // Osvežavanje tokena (§5.2, nekritičan put): native na promenu tokena pošalje
  // `{type:"auth"}` kroz most. Re-auth u mestu (isti klijent, čita iz `tokenRef`) — bez
  // pravljenja novog klijenta, pa socket/subscription/pan-zoom preživljavaju. iOS
  // isporučuje preko `window`, Android preko `document`.
  useEffect(() => {
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
      void clientRef.current?.setAuth(async () => tokenRef.current ?? "");
    };
    const onWindow = (e: MessageEvent) => handle(e.data);
    const onDocument = (e: Event) => handle((e as MessageEvent).data);
    window.addEventListener("message", onWindow);
    document.addEventListener("message", onDocument);
    return () => {
      window.removeEventListener("message", onWindow);
      document.removeEventListener("message", onDocument);
    };
  }, []);

  if (!convexUrl) {
    return <Center role="alert">Konfiguracija nije potpuna (NEXT_PUBLIC_CONVEX_URL).</Center>;
  }
  if (status === "no-app") {
    return <Center role="alert">Ovaj prikaz radi samo u Devotion aplikaciji.</Center>;
  }
  if (status === "boot" || !client) {
    // Neutralni placeholder (boja pozadine), NAMERNO ne spiner: injekcija se čita sinhrono
    // u layout efektu, pa ovo stanje ne stigne da se naslika (nula paint frejmova).
    return <div className="fixed inset-0 bg-background" />;
  }

  return (
    <ConvexProvider client={client}>
      <ReactFlowProvider>
        <CanvasInner kind={kind} id={id} initialTheme={initialTheme} />
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
    // efektu — a roditeljski efekti idu POSLE dečjih, pa bi pregazio našu temu.
    // rAF re-asserta posle commit-a da tema iz injekcije / native poruke pobedi.
    const raf = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(raf);
  }, [colorMode]);

  // Prijem view-poruka iz native ljuske (protokol §5.2: theme/focus/zoom/fit).
  // Refresh tokena (`auth`) sluša poseban listener u `CanvasEmbed`; oba koegzistiraju
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
        void fitView({ nodes: [{ id: msg.nodeId }], duration: motionDuration(500), maxZoom: 1.4 });
      } else if (msg.type === "fit") {
        void fitView({ duration: motionDuration(400) });
      } else if (msg.type === "zoom") {
        if (msg.direction === "out") void zoomOut({ duration: motionDuration(200) });
        else void zoomIn({ duration: motionDuration(200) });
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
  nodes: EmbedFlowNode[];
  edges: Edge[];
  detailById: Map<string, unknown>;
  colorMode: ThemeMode;
  ariaLabel: string;
  emptyLabel: string;
}) {
  const { fitView } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const storeApi = useStoreApi();
  const didFitRef = useRef(false);

  // Handleri MORAJU da budu memoizovani: xyflow ih drži u store-u i ponovo registruje
  // kad im se promeni referenca, pa bi inline strelica to radila na svaki render.
  const handleNodeClick = useCallback(
    (event: React.MouseEvent, node: EmbedFlowNode) => {
      // Ghost (čeka odobrenje) se ne otvara — odobrava se kroz ekran „Odobrenja".
      if (node.data.ghost) return;
      // Ctrl/Cmd/Shift-klik je multi-selekcija (spoljna tastatura uz WebView) — tada se
      // detalj NE otvara. Isti guard kao desktop kanvasi (`ideas-canvas-view.tsx`).
      if (event.ctrlKey || event.metaKey || event.shiftKey) return;
      postNative({ type: "node:open", nodeId: node.id, node: detailById.get(node.id) });
    },
    [detailById],
  );
  const handleSelectionChange = useCallback(
    ({ nodes: selected }: { nodes: EmbedFlowNode[] }) => {
      const ids = selected.map((n) => n.id);
      // Detalj šaljemo samo kad je izabran baš jedan čvor — native rail tada
      // dobija primarnu akciju za taj čvor (§5.2).
      postNative({
        type: "selection",
        ids,
        node: ids.length === 1 ? detailById.get(ids[0]) : undefined,
      });
    },
    [detailById],
  );

  // Determinističan prvi fit: `fitView` prop se oslanja na to da su čvorovi izmereni,
  // pa ga ovde dopunjujemo jednokratnim imperativnim uklapanjem čim xyflow javi da
  // jesu. Ref (ne state) da kasnije osvežavanje podataka ne pregazi korisnikov pan/zoom.
  useEffect(() => {
    if (!nodesInitialized || didFitRef.current || nodes.length === 0) return;
    didFitRef.current = true;
    void fitView({ padding: 0.2, maxZoom: 1.2, duration: motionDuration(300) });
  }, [nodesInitialized, nodes.length, fitView]);

  // PRIVREMENA DIJAGNOSTIKA (samo dev): jednom javi native logu da li su čvorovi
  // stigli do xyflow store-a i do DOM-a. Briše se čim se uzrok praznog grafa potvrdi.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const timer = setTimeout(() => {
      const state = storeApi.getState();
      postNative({
        type: "debug",
        nodesLen: nodes.length,
        storeNodeCount: state.nodeLookup.size,
        domNodeCount: document.querySelectorAll(".react-flow__node").length,
        containerW: Math.round(state.width),
        containerH: Math.round(state.height),
        transform: state.transform.map((n) => Math.round(n * 100) / 100),
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [nodes.length, storeApi]);

  return (
    // `role="application"` + ime idu na sam `<ReactFlow>` (koji ga i tako postavlja i
    // prima fokus/tastaturu), ne na omotač — inače dupli `role="application"` bez imena.
    <div className="fixed inset-0 bg-background">
      <EmbedStyles />
      <ReactFlow<EmbedFlowNode, Edge>
        nodes={nodes}
        edges={edges}
        nodeTypes={EMBED_NODE_TYPES}
        colorMode={colorMode}
        aria-label={ariaLabel}
        ariaLabelConfig={SERBIAN_ARIA_LABELS}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
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
        onNodeClick={handleNodeClick}
        onSelectionChange={handleSelectionChange}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="color-mix(in oklab, var(--muted-foreground) 30%, transparent)"
        />
        {/* Namerno BEZ `<Controls>`: zoom i centriranje drži native rail preko mosta
            (§9.3). Dva identična seta kontrola na istom ekranu su se čitala kao rail
            bez primarne akcije. */}
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
        nodes: [] as EmbedFlowNode[],
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
      nodes: raw.map<EmbedFlowNode>((node) => ({
        id: node._id,
        type: EMBED_NODE_TYPE,
        position: absolute(node),
        // Veličina ide i u čvor i u `style` — vidi `embed-node.tsx` (granice za `fitView`
        // moraju da postoje pre nego što xyflow izmeri DOM).
        width: node.width ?? EMBED_NODE_WIDTH,
        height: node.height ?? EMBED_NODE_HEIGHT,
        style: { width: node.width ?? EMBED_NODE_WIDTH, height: node.height ?? EMBED_NODE_HEIGHT },
        data: {
          label: (node.title ?? node.text ?? "Ideja").trim().slice(0, 80) || "Ideja",
          meta: `${node.upvotes} za · ${node.downvotes} protiv`,
          accent: node.isApproved,
        },
        ariaLabel: `Ideja: ${node.title ?? node.text}`,
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
      nodes: raw.map<EmbedFlowNode>((node) => ({
        id: node._id,
        type: EMBED_NODE_TYPE,
        position: absolute(node),
        width: node.width ?? EMBED_NODE_WIDTH,
        height: node.height ?? EMBED_NODE_HEIGHT,
        style: { width: node.width ?? EMBED_NODE_WIDTH, height: node.height ?? EMBED_NODE_HEIGHT },
        data: {
          label: (node.title ?? node.text ?? "Misao").trim().slice(0, 80) || "Misao",
          meta: node.isParent ? "Roditeljska misao" : undefined,
        },
        ariaLabel: `${node.isParent ? "Roditeljska misao" : "Misao"}: ${node.title ?? node.text}`,
      })),
      edges: edgeResults.map((edge) => ({
        id: edge._id,
        source: edge.nodeAId,
        target: edge.nodeBId,
      })) as Edge[],
      detailById,
    };
  }, [nodeResults, edgeResults]);

  // Renderuj tek kad su i čvorovi i ivice do kraja učitani. `listNodes`/`listEdges`
  // pagira po `updatedAt` (ne po hijerarhiji), pa roditelj ugnježdene misli nije
  // garantovano stigao pre deteta — prerani render bi čvor privremeno crtao na
  // relativnoj poziciji, a ivice bez oba kraja. Auto-load do iscrpljenja je brz.
  if (nodeStatus !== "Exhausted" || edgeStatus !== "Exhausted") {
    return <Center>Učitavanje kanvasa…</Center>;
  }

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

// Ghost-ovi ne nose placement dimenzije sa servera (samo x/y), pa dobijaju fiksnu
// veličinu — usklađenu sa podrazumevanom karticom stranice da se ne izdvajaju oblikom.
const GHOST_NODE_WIDTH = 288;
const GHOST_NODE_HEIGHT = 196;

/**
 * Zajednički prikaz za kanvas oblasti i stranice — payload je identičan, razlikuje se
 * samo upit (resolver po `areaId` vs `pageId`) i prazna poruka. Pozicije stranica su
 * već izračunate na serveru (placement ili grid fallback), pa se koriste direktno.
 *
 * NAMERNO IZOSTAVLJENO iz preglednog embeda (§5.2 — mobilni canvas je pregled/
 * navigacija/dodavanje, ne moderacija ni preuređivanje; izuzeci se zapisuju):
 * - `checkpointEdges` — vezuju checkpoint pod-čvorove koje embed ne crta.
 * - `truncated` — baner „nije sve prikazano" se ne prikazuje.
 * - `label`/`kind` ivica — sve ivice se crtaju jednako (bez teksta veze i bez
 *   vizuelne razlike canvas/relacija); desktop to ima, embed pojednostavljuje.
 *
 * `ghosts` (stranice koje čekaju nesting-odobrenje) SE crtaju — prigušeno, sa
 * oznakom „Čeka odobrenje", ne-interaktivno (odobravaju se kroz ekran „Odobrenja",
 * ne na kanvasu). Ranije su tiho ispuštani, pa je stranica napravljena drugde a
 * ugnježđena ovamo prosto nestajala; tiho nestajanje je najgori ishod (§5.2). Zato
 * prazno stanje sada gleda pages + ghosts (oba su u `nodes`).
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
    // Stranice nose stvarne dimenzije sa servera (placement ili podrazumevane), pa se
    // koriste one — layout ostaje isti kao na desktopu.
    const pageNodes = data.pages.map<EmbedFlowNode>((page) => ({
      id: page._id,
      type: EMBED_NODE_TYPE,
      position: { x: page.x, y: page.y },
      width: page.width,
      height: page.height,
      style: { width: page.width, height: page.height },
      data: {
        label: (page.title || "Stranica").trim().slice(0, 80) || "Stranica",
        meta: pageKindLabel(page.kind),
      },
      ariaLabel: `${pageKindLabel(page.kind)}: ${page.title}`,
    }));
    // Ghost-ovi: stranice koje čekaju nesting-odobrenje. Crtaju se prigušeno i
    // ne-interaktivno (bez placement dimenzija sa servera, pa fiksne). Id je
    // prefiksiran (`ghost:`) da se ne sudari sa stvarnim čvorom stranice; nisu u
    // `detailById`, pa im klik ne šalje `node:open` (native i tako ignoriše bez `node`).
    const ghostNodes = data.ghosts.map<EmbedFlowNode>((ghost) => ({
      id: `ghost:${ghost.requestId}`,
      type: EMBED_NODE_TYPE,
      position: { x: ghost.x, y: ghost.y },
      width: GHOST_NODE_WIDTH,
      height: GHOST_NODE_HEIGHT,
      style: { width: GHOST_NODE_WIDTH, height: GHOST_NODE_HEIGHT },
      selectable: false,
      focusable: false,
      data: {
        label: (ghost.title || "Stranica").trim().slice(0, 80) || "Stranica",
        meta: pageKindLabel(ghost.kind),
        ghost: true,
      },
      ariaLabel: `Čeka odobrenje — ${pageKindLabel(ghost.kind)}: ${ghost.title}`,
    }));
    return {
      nodes: [...pageNodes, ...ghostNodes],
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

/**
 * Embed ne uvozi desktop CSS module (`connected-canvas.module.css`), pa ono malo što
 * xyflow stock tema pogrešno pogodi ide ovde:
 * - `overflow: visible` da omotač ne seče prsten (`ring`) oko odobrene ideje;
 * - boja ivica kroz token, umesto xyflow default `#b1b1b7` (pravilo `.claude/rules/web.md`:
 *   boje samo kroz tokene iz `globals.css`). Boju tačaka pozadine postavlja `<Background>`.
 */
function EmbedStyles() {
  return (
    <style>{`
      .react-flow__node { overflow: visible; }
      .react-flow__edge-path {
        stroke: color-mix(in oklab, var(--muted-foreground) 45%, transparent);
      }
      /* xyflow stock tema gasi outline na fokusiranom čvoru
         (\`.react-flow__node.selectable:focus-visible { outline: none }\`), pa tab-ovanje
         kroz graf ne bi imalo nikakav vidljiv trag dok se ne pritisne Enter. Ista
         specifičnost + \`--ring\` token kao globalni fokus stil u \`globals.css\`. */
      .react-flow__node.selectable:focus-visible {
        outline: 2px solid var(--ring);
        outline-offset: 3px;
        border-radius: 0.75rem;
      }
    `}</style>
  );
}
