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
import { ConvexProvider, ConvexReactClient, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/** Vrste kanvasa iz `docs/mobile/00-PLAN.md` §5.2. */
export type CanvasKind = "thoughts" | "ideas" | "area" | "page";
type ThemeMode = "light" | "dark";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

/**
 * Poruka native ljusci. RN `WebView` ubacuje `window.ReactNativeWebView`; kad ga
 * nema (npr. otvoreno u iframe/pregledaču) padamo na `postMessage` roditelju.
 * Protokol: `docs/mobile/00-PLAN.md` §5.2.
 */
function postNative(message: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const payload = JSON.stringify(message);
  const bridge = (window as unknown as { ReactNativeWebView?: { postMessage: (s: string) => void } })
    .ReactNativeWebView;
  if (bridge) bridge.postMessage(payload);
  else window.parent?.postMessage(payload, "*");
}

/**
 * Chrome-less embed kanvasa za mobilni `WebView` (W4.2). Autentikacija ide tokenom
 * iz query parametra — pravi se zaseban `ConvexReactClient` kome se token postavi
 * sinhrono, pre prvog upita, pa `useQuery` odmah radi kao ulogovan korisnik.
 * Ovaj `ConvexProvider` zaseni onaj iz root layout-a (cookie-auth) za ceo podstablo.
 */
export function CanvasEmbed({
  kind,
  id,
  token,
  theme,
}: {
  kind: CanvasKind;
  id: string;
  token: string;
  theme: ThemeMode;
}) {
  const client = useMemo(() => {
    if (!convexUrl) return null;
    const c = new ConvexReactClient(convexUrl);
    // Statičan token: klijent ga šalje uz svaki upit. Sinhrono pre render-a dece.
    void c.setAuth(async () => token);
    return c;
  }, [token]);

  if (!client) {
    return <Center>Konfiguracija nije potpuna (NEXT_PUBLIC_CONVEX_URL).</Center>;
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
  const { fitView } = useReactFlow();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", colorMode === "dark");
  }, [colorMode]);

  // Prijem poruka iz native ljuske: tema i fokus na čvor. iOS isporučuje preko
  // `window`, Android preko `document` — slušamo oba.
  useEffect(() => {
    const handle = (raw: unknown) => {
      if (typeof raw !== "string") return;
      let msg: { type?: string; mode?: string; nodeId?: string };
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (msg.type === "theme" && (msg.mode === "light" || msg.mode === "dark")) {
        setColorMode(msg.mode);
      } else if (msg.type === "focus" && msg.nodeId) {
        void fitView({ nodes: [{ id: msg.nodeId }], duration: 500, maxZoom: 1.4 });
      }
    };
    const onWindow = (e: MessageEvent) => handle(e.data);
    const onDocument = (e: Event) => handle((e as MessageEvent).data);
    window.addEventListener("message", onWindow);
    document.addEventListener("message", onDocument);
    postNative({ type: "ready", kind });
    return () => {
      window.removeEventListener("message", onWindow);
      document.removeEventListener("message", onDocument);
    };
  }, [fitView, kind]);

  if (kind === "ideas") {
    return <IdeasFlow startupId={id as Id<"startups">} colorMode={colorMode} />;
  }
  // thoughts/area/page: infrastruktura je tu, ali dohvat podataka za te kanvase
  // nije još povezan u embed (vidi NOCNI-LOG korak 4).
  return (
    <Center>
      <span className="font-medium">Ovaj kanvas ({kind}) još nije povezan u embed.</span>
      <span className="mt-1 block text-sm text-muted-foreground">
        Kanvas ideja radi; ostali stižu naknadno.
      </span>
    </Center>
  );
}

type IdeaListNode = {
  _id: Id<"ideaNodes">;
  x: number;
  y: number;
  title: string | null;
  text: string;
  parentIdeaId?: Id<"ideaNodes">;
  isApproved: boolean;
};

function IdeasFlow({ startupId, colorMode }: { startupId: Id<"startups">; colorMode: ThemeMode }) {
  const data = useQuery(api.ideas.list, { startupId });

  const { nodes, edges } = useMemo(() => {
    if (!data) return { nodes: [] as Node[], edges: [] as Edge[] };
    const raw = data.nodes as IdeaListNode[];
    const byId = new Map(raw.map((n) => [n._id, n]));
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
      edges: (data.edges as { _id: string; nodeAId: string; nodeBId: string }[]).map((edge) => ({
        id: edge._id,
        source: edge.nodeAId,
        target: edge.nodeBId,
      })),
    };
  }, [data]);

  if (data === undefined) return <Center>Učitavanje kanvasa…</Center>;

  return (
    <div className="fixed inset-0 bg-background">
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
        onNodeClick={(_, node) => postNative({ type: "node:open", nodeId: node.id })}
        onSelectionChange={({ nodes: selected }) =>
          postNative({ type: "selection", ids: selected.map((n) => n.id) })
        }
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
      {nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="text-sm text-muted-foreground">Prazan kanvas ideja.</span>
        </div>
      ) : null}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 grid place-items-center bg-background px-6 text-center text-foreground">
      <div>{children}</div>
    </div>
  );
}

/** Krupnije touch mete za ReactFlow kontrole (pan/zoom bez miša). */
function EmbedStyles() {
  return (
    <style>{`
      .react-flow__controls-button { width: 2.5rem; height: 2.5rem; }
      .react-flow__controls-button svg { max-width: 1.1rem; max-height: 1.1rem; }
      .embed-node--approved { box-shadow: 0 0 0 2px var(--color-primary, #4a42d8); }
    `}</style>
  );
}
