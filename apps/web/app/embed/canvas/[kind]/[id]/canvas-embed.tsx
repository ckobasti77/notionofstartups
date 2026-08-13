"use client";

import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  useStore,
  type Edge,
  type OnMove,
  type OnNodeDrag,
  type Viewport,
  type XYPosition,
} from "@xyflow/react";
import {
  ConvexProvider,
  ConvexReactClient,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

// Jedini dozvoljen uvoz iz `components/workspace/` u embed (K4): modul je čist TS
// (nula uvoza, nula React-a) i desktop ga koristi NEPROMENJENOG. Kopija orbit
// matematike bi se vremenom razišla sa desktopom, a premeštanje modula bi diralo
// desktop fajlove bez ijedne funkcionalne dobiti (`faza-k4.md` §1).
import {
  taskCheckpointNodeId,
  taskCheckpointNodeMetrics,
  taskCheckpointOrbitPosition,
  taskCheckpointOrdinal,
} from "@/components/workspace/canvases/task-checkpoint-layout";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
// Apsolutno ↔ relativno za ugnježdene čvorove (`ZA-POPRAVKU.md` §9). Kanvas ideja i
// misli crta ravno, a baza čuva poziciju relativno na roditelja — prevod je ovde, sa
// testom (`canvas-nesting.test.ts`), jer je greška u njemu tiha.
import {
  absolutePositions,
  storedMovesFor,
  type NestedNode,
} from "@/lib/canvas-nesting";
import { pageKindLabel } from "@/lib/page-kinds";
import { cn } from "@/lib/utils";

import {
  EMBED_NODE_HEIGHT,
  EMBED_NODE_TYPE,
  EMBED_NODE_TYPES,
  EMBED_NODE_WIDTH,
  EmbedResizeContext,
  embedNodeColor,
  type EmbedFlowNode,
  type EmbedResizeApi,
  type EmbedResizeBox,
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
  // Režim „Uredi raspored" (protokol: `docs/mobile/lanac4/REZIM.md`). Vlasnik stanja je
  // native rail — ovde je samo odjek poslednje `mode` poruke. Podrazumevano je gledanje,
  // pa reload WebView-a uvek pada na sigurnu stranu (native ga ponovo upali u `onLoadEnd`).
  const [editMode, setEditMode] = useState(false);
  // Biranje cilja za vezu (K3): id KARTICE-IZVORA koju je native izabrao kroz sheet
  // („Poveži sa…"), ili `null` kad se ne bira. Vlasnik stanja je native — ovde je,
  // kao i `editMode`, samo odjek poslednje `connect` poruke. Povlačenje niti sa
  // handle tačkice ostaje isključeno zauvek (`nodesConnectable={false}`): tačkica je
  // ~8 px i prstom se ne pogađa, pa vezu pravi tap na cilj.
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
  /**
   * Koji zadatak trenutno pokazuje svoje korake na kanvasu OBLASTI (desktop parnjak:
   * `expandedTaskId`, `area-canvas-view.tsx:354`). Vlasnik je native (sheet kartice →
   * „Prikaži korake"); na kanvasu SAMOG zadatka je nebitan — tamo su koraci uvek
   * vidljivi. Kao i `mode`, native ga ponovo pošalje posle `onLoadEnd`.
   */
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
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

  // Prijem view-poruka iz native ljuske (protokol §5.2: mode/theme/focus/zoom/fit).
  // Refresh tokena (`auth`) sluša poseban listener u `CanvasEmbed`; oba koegzistiraju
  // i svaki ignoriše tuđe tipove. iOS isporučuje preko `window`, Android `document`.
  useEffect(() => {
    const handle = (raw: unknown) => {
      if (typeof raw !== "string") return;
      let msg: {
        type?: string;
        mode?: string;
        value?: string;
        nodeId?: string;
        direction?: string;
        sourceId?: string | null;
        taskPageId?: string | null;
      };
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (msg.type === "mode") {
        // Nepoznata vrednost = gledanje: režim se pali samo eksplicitno.
        setEditMode(msg.value === "edit");
      } else if (msg.type === "connect") {
        // `sourceId: null` je izlazak iz biranja („Otkaži", uspeh, izlazak iz režima).
        setConnectSourceId(msg.sourceId ?? null);
      } else if (msg.type === "checkpoints") {
        // `taskPageId: null` je „Sakrij korake". Ovo je čist PRIKAZ — ne piše ništa.
        setExpandedTaskId(msg.taskPageId ?? null);
      } else if (msg.type === "theme" && (msg.mode === "light" || msg.mode === "dark")) {
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

  // `editMode` i `connectSourceId` idu svim vrstama. Od K5 sve četiri imaju i
  // handlere (pomeranje, veličina, veze), pa režim više nigde nije inertan
  // (pravilo 7 iz `REZIM.md` — „K5 dodaje samo handler").
  if (kind === "ideas") {
    return (
      <IdeasFlow
        startupId={id as Id<"startups">}
        colorMode={colorMode}
        editMode={editMode}
        connectSourceId={connectSourceId}
      />
    );
  }
  if (kind === "thoughts") {
    return (
      <ThoughtsFlow
        startupId={id as Id<"startups">}
        colorMode={colorMode}
        editMode={editMode}
        connectSourceId={connectSourceId}
      />
    );
  }
  // `expandedTaskId` dobijaju SAMO oblast i stranica — koraci vise o kartici zadatka,
  // koje na kanvasima ideja i misli nema.
  if (kind === "area") {
    return (
      <AreaFlow
        areaId={id as Id<"startupAreas">}
        colorMode={colorMode}
        editMode={editMode}
        connectSourceId={connectSourceId}
        expandedTaskId={expandedTaskId}
      />
    );
  }
  // Preostaje "page" (page.tsx validira `kind`, pa su sve četiri vrste pokrivene).
  return (
    <PageFlow
      pageId={id as Id<"pages">}
      colorMode={colorMode}
      editMode={editMode}
      connectSourceId={connectSourceId}
      expandedTaskId={expandedTaskId}
    />
  );
}

/** Jedan pomeraj čvora — generički (`id`, ne `pageId`) da isti potpis služi i K5. */
type NodeMove = { id: string; x: number; y: number };

/**
 * Ono što je prst upravo postavio, a upis još nije potvrdio: pozicija (potez) i/ili
 * dimenzije (promena veličine). Ugaona ručka menja oboje odjednom.
 */
type NodeOverride = { position?: XYPosition; width?: number; height?: number };

/** Prag zuma ispod kog se ručke za veličinu ne crtaju — vidi `zoomAllowsHandles`. */
const HANDLE_MIN_ZOOM = 0.5;

/**
 * Posle ovoliko ms gest se smatra mrtvim i kapija „živi upit ne gazi prst" se sama
 * otključava. NIJE kozmetika: dugi pritisak NA RUČKU otvori native sheet, Android tada
 * prestane da isporučuje dodir WebView-u i `touchend` NIKAD ne stigne do stranice — bez
 * ovog ventila kanvas trajno prestane da prima žive izmene (viđeno na emulatoru:
 * kartica je na ekranu ostala 288×196 dok je u bazi bila 259×176). Vrednost je znatno
 * veća od svakog stvarnog poteza prstom, pa ne može da prekine gest koji traje.
 */
const GESTURE_STALE_MS = 8_000;

/**
 * Preuzimanje svežih čvorova iz živog upita bez gubitka lokalnog stanja: selekcija se
 * prenosi iz tekućeg stanja (upit je ne zna), a `overrides` gura pozicije i dimenzije
 * koje je korisnik upravo postavio prstom preko dolaznog snimka (upis još nije stigao).
 */
function adoptIncoming(
  incoming: EmbedFlowNode[],
  current: EmbedFlowNode[],
  overrides?: Map<string, NodeOverride>,
): EmbedFlowNode[] {
  const selectedIds = new Set(current.filter((node) => node.selected).map((node) => node.id));
  return incoming.map((node) => {
    const override = overrides?.get(node.id);
    const selected = selectedIds.has(node.id);
    if (!override && !selected) return node;
    const next = { ...node };
    if (selected) next.selected = true;
    if (override?.position) next.position = override.position;
    if (override?.width !== undefined && override?.height !== undefined) {
      // I `width/height` I `style`: prvo pobeđuje u renderu (`getNodeInlineStyleDimensions`),
      // ali `style` ostaje izvor za `fitView` granice pre nego što xyflow izmeri DOM —
      // razilaženje to dvoje bi dalo pogrešno uklapanje.
      next.width = override.width;
      next.height = override.height;
      next.style = { ...next.style, width: override.width, height: override.height };
    }
    return next;
  });
}

/**
 * Zajednički ReactFlow za embed (deljen između sve četiri vrste kanvasa). Čvorovi/ivice
 * su već izračunati (apsolutne pozicije); ovde su prikaz, most i — u režimu „Uredi
 * raspored" — povlačenje. `detailById` nosi detalj čvora koji se prosleđuje native ljusci
 * uz `node:open`/`selection` (bez drugog upita). Vrednost je proizvoljna — samo se
 * JSON-serializuje.
 *
 * Bez `onMoveNodes` je režim inertan (`canEdit`), pa vrsta kanvasa koja još nema upis
 * pozicije ne dobija ni povlačive čvorove ni vizuelni znak koji bi lagao.
 */
function EmbedFlow({
  nodes,
  edges,
  detailById,
  colorMode,
  ariaLabel,
  emptyLabel,
  emptyPending = false,
  editMode = false,
  connectSourceId = null,
  onConnectNodes,
  onMoveNodes,
  onResizeNode,
  initialViewport = null,
  onUserViewport,
}: {
  nodes: EmbedFlowNode[];
  edges: Edge[];
  detailById: Map<string, unknown>;
  colorMode: ThemeMode;
  ariaLabel: string;
  emptyLabel: string;
  /**
   * Deo čvorova još stiže DRUGIM upitom (koraci zadatka, K4) — prazno stanje se dotle
   * ne crta. Bez toga kanvas zadatka bez podstranica na tren kaže „nema ničega", pa
   * se oblačići pojave preko te poruke.
   */
  emptyPending?: boolean;
  /** Režim „Uredi raspored" iz native rail-a (`{type:"mode"}`). */
  editMode?: boolean;
  /** Kartica-izvor dok se bira cilj veze (`{type:"connect"}`), inače `null`. */
  connectSourceId?: string | null;
  /**
   * Upis nove veze (tap na cilj). Bez njega je biranje inertno — isti obrazac kao
   * `canEdit`/`canResize`: vrsta kanvasa bez upisa ne dobija ni oznaku izvora koja
   * bi obećala radnju koje nema.
   */
  onConnectNodes?: (sourceId: string, targetId: string) => Promise<void>;
  /** Upis poteza. Odbijeno obećanje vraća kartice na `before` (rollback je ovde). */
  onMoveNodes?: (before: NodeMove[], after: NodeMove[]) => Promise<void>;
  /**
   * Upis nove veličine kartice. Bez njega se ručke ne crtaju (isti obrazac inertnosti
   * kao `canEdit`) — vrsta kanvasa bez upisa ne sme da dobije kontrolu koja ne radi.
   * Odbijeno obećanje vraća karticu na `before`.
   */
  onResizeNode?: (nodeId: string, before: EmbedResizeBox, after: EmbedResizeBox) => Promise<void>;
  /** Zapamćena kamera; kad postoji, početni `fitView` se preskače. */
  initialViewport?: Viewport | null;
  /** Kamera koju je pomerio KORISNIK (programske promene su već odsečene). */
  onUserViewport?: (viewport: Viewport) => void;
}) {
  const { fitView } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const didFitRef = useRef(false);

  // Povlačenje traži lokalno stanje čvorova (xyflow u kontrolisanom režimu ne pomera
  // ništa sam). Dolazni snimak iz živog upita se USRED poteza ne primenjuje nego pamti
  // — inače kartica „pobegne" ispod prsta na prvu tuđu (ili našu) izmenu.
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<EmbedFlowNode>(nodes);
  const draggingRef = useRef(false);
  const pendingRef = useRef<EmbedFlowNode[] | null>(null);
  const preDragRef = useRef<Map<string, XYPosition>>(new Map());
  // Kad je gest počeo — vidi `GESTURE_STALE_MS`. Kapija se sama otključava, jer
  // „potez je gotov" nije uvek događaj koji stigne do stranice.
  const gestureStartedAtRef = useRef(0);

  const canEdit = editMode && !!onMoveNodes;
  const canResize = editMode && !!onResizeNode;
  /**
   * Bira se cilj veze. Dok traje, kanvas se ponaša drukčije nego u ostatku režima:
   * ništa se ne povlači i ne menja veličinu, jer bi svaka od te dve mete pojela tap
   * kojim se cilj bira (§4 P1/P2 plana K3).
   */
  const connecting = !!connectSourceId && !!onConnectNodes;
  /**
   * Native sloj je preuzeo ekran (sheet iz dugog pritiska), pa se ručke odmontiraju:
   * `d3-drag` za dodir sluša na SAMOM elementu ručke, pa gest umire zajedno sa njom.
   * Ovo je treći i poslednji sloj odbrane od Z7 — bez njega dodir koji je počeo na
   * ručki a završio „u vazduhu" može da bude nastavljen sledećim dodirom po platnu
   * i napiše promenu veličine koju korisnik nije tražio (`ZA-POPRAVKU.md` Z7).
   */
  /**
   * Pamti se KLJUČ stanja u kom je odmontiranje zatraženo, ne go boolean: promena
   * režima ili ulazak/izlazak iz biranja tako sama poništava odmontiranje (izvedeno
   * stanje), bez efekta koji sinhrono zove `setState` i pravi kaskadni render.
   */
  const gateKey = `${editMode ? "edit" : "view"}:${connectSourceId ?? ""}`;
  const [suspendedKey, setSuspendedKey] = useState<string | null>(null);
  const handlesSuspended = suspendedKey === gateKey;

  /**
   * Otključavanje BEZ poruke iz native-a: prvi `touchstart` koji ponovo stigne do
   * stranice znači da je native sheet zatvoren i da dodir opet pripada WebView-u.
   * `setTimeout(0)` je obavezan — bez njega bi listener uhvatio baš onaj dodir koji
   * je sheet i otvorio, pa bi se ručke vratile pre nego što native sloj preuzme ekran.
   *
   * `capture: true` NIJE kozmetika: `d3-zoom` na svom `touchstart` handleru zove
   * `stopImmediatePropagation()` (`nopropagation` u `d3-zoom`), pa dodir koji je počeo
   * nad platnom NIKAD ne dobubla do `window`-a. U bubble fazi su ručke ostajale
   * odmontirane zauvek (izmereno na emulatoru: posle jednog dugog pritiska nijedna
   * ručka se više nije crtala do reload-a). Capture faza ide PRE targeta, pa je
   * nijedan handler ispod ne može preseći.
   */
  useEffect(() => {
    if (!handlesSuspended) return;
    const resume = () => setSuspendedKey(null);
    const options = { once: true, passive: true, capture: true } as const;
    const arm = setTimeout(() => {
      window.addEventListener("touchstart", resume, options);
    }, 0);
    return () => {
      clearTimeout(arm);
      window.removeEventListener("touchstart", resume, options);
    };
  }, [handlesSuspended]);

  /**
   * Prag zuma ispod kog se ručke ne crtaju. Na `minZoom={0.15}` je kartica od 288 px
   * na ekranu ~43 px — četiri mete od 44pt bi je potpuno prekrile i onemogućile i sam
   * izbor. Selektor vraća BOOLEAN, pa se `EmbedFlow` rerenderuje samo kad se prag
   * pređe, a ne na svaki frejm pinča. Ispod praga put do veličine i dalje postoji:
   * native rail → „Veličina kartice" → ±10%.
   */
  const zoomAllowsHandles = useStore((state) => state.transform[2] >= HANDLE_MIN_ZOOM);

  useEffect(() => {
    if (draggingRef.current) {
      if (Date.now() - gestureStartedAtRef.current < GESTURE_STALE_MS) {
        pendingRef.current = nodes;
        return;
      }
      // Gest je „umro" bez završnog događaja (vidi `GESTURE_STALE_MS`) — kapija se
      // otključava, jer je zamrznut kanvas gori ishod od kartice koja skoči.
      draggingRef.current = false;
      pendingRef.current = null;
    }
    // Funkcijski updater (ne gola vrednost): selekcija se čita iz tekućeg stanja, pa
    // živa izmena podataka ne poništava ono što je korisnik izabrao.
    setFlowNodes((current) => adoptIncoming(nodes, current));
  }, [nodes, setFlowNodes]);

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

  const handleNodeDragStart = useCallback<OnNodeDrag<EmbedFlowNode>>((_event, _node, dragged) => {
    draggingRef.current = true;
    gestureStartedAtRef.current = Date.now();
    preDragRef.current = new Map(
      dragged.map((node) => [node.id, { x: node.position.x, y: node.position.y }]),
    );
  }, []);

  /**
   * Kraj poteza = JEDAN upis (ne po frejmu). Pišu se samo čvorovi kojima se zaokružena
   * pozicija stvarno promenila — uz `nodeDragThreshold` to isključuje da drhtaj prsta
   * pošalje mutaciju koju vidi ceo tim.
   */
  const handleNodeDragStop = useCallback<OnNodeDrag<EmbedFlowNode>>(
    (_event, _node, dragged) => {
      draggingRef.current = false;
      const started = preDragRef.current;
      preDragRef.current = new Map();
      const pending = pendingRef.current;
      pendingRef.current = null;

      const before: NodeMove[] = [];
      const after: NodeMove[] = [];
      for (const node of dragged) {
        const start = started.get(node.id);
        if (!start) continue;
        const from = { id: node.id, x: Math.round(start.x), y: Math.round(start.y) };
        const to = { id: node.id, x: Math.round(node.position.x), y: Math.round(node.position.y) };
        if (from.x === to.x && from.y === to.y) continue;
        before.push(from);
        after.push(to);
      }

      if (after.length === 0) {
        if (pending) setFlowNodes((current) => adoptIncoming(pending, current));
        return;
      }

      // Odloženi snimak se primenjuje tek sada, i to SA našim pozicijama preko njega:
      // upis još nije stigao, pa bi ga sirov snimak vratio na staro mesto.
      const moved = new Map<string, NodeOverride>(
        after.map((move) => [move.id, { position: { x: move.x, y: move.y } }]),
      );
      if (pending) setFlowNodes((current) => adoptIncoming(pending, current, moved));

      void onMoveNodes?.(before, after).catch(() => {
        // Poruku greške je već prikazao pozivalac (native `Alert`); ovde samo vraćamo
        // kartice tamo gde su bile pre poteza.
        const rollback = new Map(before.map((move) => [move.id, { x: move.x, y: move.y }]));
        setFlowNodes((current) =>
          current.map((node) => {
            const previous = rollback.get(node.id);
            return previous ? { ...node, position: previous } : node;
          }),
        );
      });
    },
    [onMoveNodes, setFlowNodes],
  );

  /**
   * Spuštanje gate-a „živi upit ne gazi prst" i primena onoga što je usred poteza
   * stiglo. Deljeno između kraja promene veličine i stražara ispod.
   */
  const releaseGesture = useCallback(() => {
    draggingRef.current = false;
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) setFlowNodes((current) => adoptIncoming(pending, current));
  }, [setFlowNodes]);

  /**
   * Stražar za prekinut gest veličine. xyflow zove `onResizeEnd` SAMO ako je potez
   * zaista promenio dimenziju (`resizeDetected` u `XYResizer`), a `onResizeStart` se
   * okida već na dodir. Dodir ručke bez pomeraja bi zato ostavio `draggingRef`
   * podignut — i živi upit bi od tog trenutka bio trajno zamrznut. Slušamo baš
   * `mouseup`/`touchend` (iste događaje koje koristi d3-drag), ne `pointerup` — taj na
   * dodir stiže PRE `touchend`-a i pregazio bi našu novu veličinu starim snimkom.
   *
   * K3 popravka: listeneri su u **capture** fazi, a posao se odlaže na sledeći task.
   * U bubble fazi stražar za dodir nikad nije radio — `d3-drag.touchended` zove
   * `nopropagation()` (`stopImmediatePropagation`) na elementu ručke, pa `touchend`
   * ne dobubla do `window`-a; gate je do sada otključavao samo `GESTURE_STALE_MS`
   * posle 8 s (K2 REVIZIJA §6.3). Capture faza ide PRE svih handlera ispod, a
   * `setTimeout(0)` vraća redosled na mesto: kad se posao izvrši, `onResizeEnd` je
   * već upisao novu veličinu, pa je ne možemo pregaziti starim snimkom.
   */
  const resizeWatchdogRef = useRef<(() => void) | null>(null);

  const disarmResizeWatchdog = useCallback(() => {
    resizeWatchdogRef.current?.();
    resizeWatchdogRef.current = null;
  }, []);

  const handleResizeStart = useCallback(() => {
    draggingRef.current = true;
    gestureStartedAtRef.current = Date.now();
    disarmResizeWatchdog();
    // Uslov je „nema više aktivnih dodira", ne „stigao je bilo koji touchend":
    // drugi prst spušten usred poteza (pokušaj pinča) bi inače otključao kapiju
    // ranije i dolazni snimak bi trgnuo karticu do kraja poteza (K2 REVIZIJA §6.3).
    const finish = (event: Event) => {
      if (event.type.startsWith("touch") && (event as TouchEvent).touches.length > 0) return;
      setTimeout(() => {
        disarmResizeWatchdog();
        releaseGesture();
      }, 0);
    };
    const events = ["mouseup", "touchend", "touchcancel"] as const;
    const options = { capture: true } as const;
    events.forEach((name) => window.addEventListener(name, finish, options));
    resizeWatchdogRef.current = () => {
      events.forEach((name) => window.removeEventListener(name, finish, options));
    };
  }, [disarmResizeWatchdog, releaseGesture]);

  useEffect(() => disarmResizeWatchdog, [disarmResizeWatchdog]);

  /**
   * Kraj poteza ručkom = JEDAN upis. Isti oblik kao `handleNodeDragStop`: poređenje
   * ZAOKRUŽENIH vrednosti (drhtaj prsta nije izmena), odloženi snimak se primenjuje
   * sa našom veličinom preko njega, a odbijeno obećanje vraća karticu na `before`
   * (poruku greške prikazuje pozivalac).
   */
  const handleResizeEnd = useCallback(
    (nodeId: string, before: EmbedResizeBox, after: EmbedResizeBox) => {
      disarmResizeWatchdog();
      draggingRef.current = false;
      const pending = pendingRef.current;
      pendingRef.current = null;

      const round = (box: EmbedResizeBox): EmbedResizeBox => ({
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
      });
      const from = round(before);
      const to = round(after);
      if (
        from.width === to.width &&
        from.height === to.height &&
        from.x === to.x &&
        from.y === to.y
      ) {
        if (pending) setFlowNodes((current) => adoptIncoming(pending, current));
        return;
      }

      const override = new Map<string, NodeOverride>([
        [nodeId, { position: { x: to.x, y: to.y }, width: to.width, height: to.height }],
      ]);
      if (pending) setFlowNodes((current) => adoptIncoming(pending, current, override));

      void onResizeNode?.(nodeId, from, to).catch(() => {
        setFlowNodes((current) =>
          current.map((node) =>
            node.id === nodeId
              ? {
                  ...node,
                  position: { x: from.x, y: from.y },
                  width: from.width,
                  height: from.height,
                  style: { ...node.style, width: from.width, height: from.height },
                }
              : node,
          ),
        );
      });
    },
    [disarmResizeWatchdog, onResizeNode, setFlowNodes],
  );

  // Vrednost konteksta MORA da bude memoizovana: nov objekat na svaki render bi
  // prezidao sve čvorove (svaki `EmbedNodeCard` je potrošač).
  const resizeApi = useMemo<EmbedResizeApi>(
    () => ({
      // `!connecting`: ugaone mete od 44pt bi u biranju pojele tap kojim se bira cilj
      // (§4 P2). `!handlesSuspended`: native sheet je preuzeo ekran (Z7).
      enabled: canResize && zoomAllowsHandles && !connecting && !handlesSuspended,
      onStart: handleResizeStart,
      onEnd: handleResizeEnd,
    }),
    [canResize, zoomAllowsHandles, connecting, handlesSuspended, handleResizeStart, handleResizeEnd],
  );

  /**
   * Tap na cilj = veza. Ovo je ceo „gest" povezivanja na telefonu: nit sa handle
   * tačkice se ne povlači (tačkica je ~8 px), pa se izvor bira u native sheet-u, a
   * cilj običnim tapom. `connectBusyRef` je zaštita od duplog tapa — server na
   * postojeći par vraća isti `_id`, ali dva paralelna poziva bi dala dve trake
   * „Poništi" od kojih druga ne bi imala šta da poništi.
   */
  const connectBusyRef = useRef(false);

  const handleConnectPick = useCallback(
    (_event: React.MouseEvent, node: EmbedFlowNode) => {
      if (!connectSourceId || !onConnectNodes || connectBusyRef.current) return;
      if (node.data.ghost) {
        postNative({
          type: "toast",
          level: "info",
          message: "Kartica čeka odobrenje i ne može da se poveže.",
        });
        return;
      }
      if (node.id === connectSourceId) {
        postNative({ type: "toast", level: "info", message: "Izaberi drugu karticu." });
        return;
      }
      connectBusyRef.current = true;
      void onConnectNodes(connectSourceId, node.id).finally(() => {
        connectBusyRef.current = false;
      });
    },
    [connectSourceId, onConnectNodes],
  );

  /**
   * Dugi pritisak na karticu (Android WebView ga isporučuje kao `contextmenu`) otvara
   * native sheet sa akcijama nad čvorom. `preventDefault` gasi sistemski „izaberi
   * tekst" meni koji bi inače pojeo gest. Nije JEDINI put do sheet-a — ista radnja
   * stoji i u native rail-u, jer je `contextmenu` na WKWebView-u nepouzdan.
   */
  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: EmbedFlowNode) => {
      event.preventDefault();
      // Dugi pritisak može da počne i NA RUČKI (ona sedi u uglu kartice). Native sheet
      // koji se sada otvara preuzima dodir, pa stranica završni `touchend` više neće
      // videti — gest se zato zatvara ovde, odmah i deterministički. Vremenski ventil
      // (`GESTURE_STALE_MS`) ostaje kao mreža za slučajeve koje ne znamo.
      disarmResizeWatchdog();
      releaseGesture();
      // …a ručke se uz to i ODMONTIRAJU: `d3-drag` za dodir sluša na samom elementu
      // ručke, pa gest koji je počeo na njoj umire zajedno sa čvorom. Time je Z7
      // zatvoren i za slučaj kad `touchend` nikad ne stigne (K2 REVIZIJA §6).
      setSuspendedKey(gateKey);
      if (node.data.ghost) return;
      const detail = detailById.get(node.id);
      if (!detail) return;
      postNative({ type: "node:actions", nodeId: node.id, node: detail });
    },
    [detailById, disarmResizeWatchdog, gateKey, releaseGesture],
  );

  // Poslednja PRIJAVLJENA kamera (već zaokružena). Kreće od zapamćene vrednosti da ni
  // prvi dodir posle otvaranja ne prijavi ono što u bazi već piše.
  const lastViewportRef = useRef<Viewport | null>(initialViewport);

  const handleMoveEnd = useCallback<OnMove>(
    (event, viewport) => {
      // Običan tap po platnu je za `d3-zoom` pun start→end ciklus sa pravim događajem,
      // pa bi bez provere ispod svaki dodir slao upis iste vrednosti (viđeno na emulatoru).
      const rounded: Viewport = {
        x: Math.round(viewport.x),
        y: Math.round(viewport.y),
        zoom: Number(viewport.zoom.toFixed(2)),
      };
      // `sourceEvent === null` znači programsku promenu kamere (početni fit, `fit` i
      // `zoom` iz native rail-a) — kamera se pamti samo kad ju je korisnik pomerio.
      // Vrednost se ipak UPISUJE u ref: bez toga bi prvi sledeći tap (npr. odmah posle
      // `[⌖]`, ili prvi tap na kanvasu bez zapamćene kamere, gde je `last` još `null`)
      // prijavio programsku kameru kao korisnikovu i time zauvek ugasio auto-`fitView`
      // — na oba klijenta istog korisnika (K1 REVIZIJA §6a).
      if (event === null) {
        lastViewportRef.current = rounded;
        return;
      }
      const last = lastViewportRef.current;
      if (last && last.x === rounded.x && last.y === rounded.y && last.zoom === rounded.zoom) {
        return;
      }
      lastViewportRef.current = rounded;
      onUserViewport?.(rounded);
    },
    [onUserViewport],
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
  // Zapamćena kamera pobeđuje: bez ovog izlaza bi `saveViewport` pisao u tabelu koju
  // niko ne čita jer bi je fit svaki put pregazio.
  useEffect(() => {
    if (initialViewport) return;
    if (!nodesInitialized || didFitRef.current || nodes.length === 0) return;
    didFitRef.current = true;
    void fitView({ padding: 0.2, maxZoom: 1.2, duration: motionDuration(300) });
  }, [nodesInitialized, nodes.length, fitView, initialViewport]);

  return (
    // `role="application"` + ime idu na sam `<ReactFlow>` (koji ga i tako postavlja i
    // prima fokus/tastaturu), ne na omotač — inače dupli `role="application"` bez imena.
    <div className={cn("fixed inset-0 bg-background", canEdit && "embed-edit", connecting && "embed-connect")}>
      <EmbedStyles />
      {/* Izvor mora da se vidi, a nov prop u `data` bi prezidao SVE čvorove. xyflow
          već stavlja `data-id` na omotač čvora, pa je oznaka jedno CSS pravilo.
          Ide POSLE `EmbedStyles` — ista specifičnost, pobeđuje kasnije pravilo. */}
      {connecting && connectSourceId ? (
        <style>{`
          .embed-connect .react-flow__node[data-id=${JSON.stringify(connectSourceId)}] {
            outline: 3px solid var(--primary);
            outline-offset: 4px;
            border-radius: 0.75rem;
          }
        `}</style>
      ) : null}
      {/* Provajder obavija ceo graf: ručke se renderuju unutar komponente čvora
          (`embed-node.tsx`), a odluka i upis su ovde. */}
      <EmbedResizeContext.Provider value={resizeApi}>
        <ReactFlow<EmbedFlowNode, Edge>
          nodes={flowNodes}
          edges={edges}
          onNodesChange={onNodesChange}
          nodeTypes={EMBED_NODE_TYPES}
          colorMode={colorMode}
          aria-label={ariaLabel}
          ariaLabelConfig={SERBIAN_ARIA_LABELS}
          fitView={!initialViewport}
          fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
          defaultViewport={initialViewport ?? undefined}
          minZoom={0.15}
          maxZoom={2}
          // Povlačenje se pali SAMO u režimu. Čvor koji nije naš nosi `draggable:false` i
          // ostaje nepomičan i tada (backend bi ga ionako odbio). U biranju cilja se gasi
          // i za svoje kartice: povlačivom čvoru xyflow dodaje `nopan`, pa bi dodir na
          // njemu bio potez umesto tapa kojim se bira cilj (§4 P1).
          nodesDraggable={canEdit && !connecting}
          // Prst uvek malo zadrhti: bez praga bi i običan tap ušao u potez.
          nodeDragThreshold={5}
          nodesConnectable={false}
          elementsSelectable
          panOnDrag
          zoomOnPinch
          zoomOnScroll
          panOnScroll={false}
          proOptions={{ hideAttribution: true }}
          onNodeDragStart={handleNodeDragStart}
          onNodeDragStop={handleNodeDragStop}
          onMoveEnd={handleMoveEnd}
          // U biranju tap PRAVI vezu; u ostatku režima BIRA karticu (ne otvara je) —
          // inače bi isti dodir imao dva ishoda; van režima otvara čvor.
          onNodeClick={connecting ? handleConnectPick : canEdit ? undefined : handleNodeClick}
          // Van režima dugi pritisak ne sme ništa da otvori (kanvas je tada za gledanje),
          // a u biranju bi otvorio sheet preko trake koja traži tap na cilj.
          onNodeContextMenu={canEdit && !connecting ? handleNodeContextMenu : undefined}
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
      </EmbedResizeContext.Provider>
      {nodes.length === 0 && !emptyPending ? (
        <div
          role="status"
          className="pointer-events-none absolute inset-0 grid place-items-center"
        >
          <span className="text-sm text-muted-foreground">{emptyLabel}</span>
        </div>
      ) : null}
      {/* Znak režima MORA da bude u WebView-u, a ne samo na native dugmetu: ovo je
          površina po kojoj se prevlači, pa se na njoj i vidi da su potezi trajni.
          Obod + pilula su `pointer-events-none` — ne smeju da pojedu ni jedan dodir. */}
      {canEdit ? (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-primary"
          />
          {/* U biranju cilja pilula NESTAJE: poruku tada nosi native traka iznad
              WebView-a, na istom mestu — dva sloja iste poruke se ne slažu. */}
          {connecting ? null : (
            <div
              role="status"
              className="pointer-events-none absolute inset-x-0 top-3 flex justify-center"
            >
              <span className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground shadow-sm">
                Uređivanje rasporeda
              </span>
            </div>
          )}
        </>
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

/**
 * Sused čvora na kanvasu ideja/misli. Isti oblik kao `PageNodeEdgeDetail` (mobilni
 * `NodeEdgeRow`), pa native koristi ISTU deljenu sekciju „Veze" — bez trećeg oblika.
 */
type SimpleEdgeDetail = {
  _id: string;
  kind: "canvas";
  otherId: string;
  otherTitle: string;
  label: string | null;
  canDelete: boolean;
  canRequestDeletion: boolean;
};

/**
 * Koliko čvorova sme u jedan potez. Broj je desktopov („Pomeraj najviše 50 ideja
 * odjednom." / „…50 izabranih misli odjednom.") i poklapa se sa serverskim
 * `MAX_BULK_ITEMS` za `thoughts.moveNodes`. Prekoračenje se ne seče tiho nego
 * odbija — kao na desktopu.
 */
const MAX_NESTED_MOVE_UPDATES = 50;

/**
 * Detalj ideje koji embed šalje native ljusci. Prvi deo je `IdeaDetail` (mobilni
 * `idea-node-sheet.tsx` — glasanje i tekst), ostalo je ono što traži sheet „Akcije
 * ideje" (K5): veličina, veze i scope. Sve ide uz jednu poruku, pa native ne radi
 * drugi upit.
 */
type IdeaNodeDetail = {
  /** Diskriminator — native po njemu bira sheet, ne pogađa po vrsti kanvasa (K4). */
  nodeKind: "idea";
  _id: Id<"ideaNodes">;
  title: string | null;
  text: string;
  upvotes: number;
  downvotes: number;
  userVote: "up" | "down" | null;
  author: { displayName: string } | null;
  startupId: Id<"startups">;
  /** STORED (relativne) koordinate — `updateLayout` prima baš njih. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Da li kartica ima RUČNU veličinu — od toga zavisi tačan inverz „Poništi". */
  manuallySized: boolean;
  canResize: boolean;
  canConnect: boolean;
  nodeCount: number;
  edges: SimpleEdgeDetail[];
};

function IdeasFlow({
  startupId,
  colorMode,
  editMode,
  connectSourceId,
}: {
  startupId: Id<"startups">;
  colorMode: ThemeMode;
  editMode: boolean;
  connectSourceId: string | null;
}) {
  const data = useQuery(api.ideas.list, { startupId });
  if (data === undefined) return <Center>Učitavanje kanvasa…</Center>;
  // Podela na upit i prikaz nije kozmetika: `initialViewport` se ZAMRZAVA na mount-u
  // (xyflow `defaultViewport` čita samo pri inicijalizaciji), pa komponenta koja ga
  // čita sme da se montira tek kad podaci postoje.
  return (
    <IdeasCanvasView
      data={data}
      startupId={startupId}
      colorMode={colorMode}
      editMode={editMode}
      connectSourceId={connectSourceId}
    />
  );
}

function IdeasCanvasView({
  data,
  startupId,
  colorMode,
  editMode,
  connectSourceId,
}: {
  data: FunctionReturnType<typeof api.ideas.list>;
  startupId: Id<"startups">;
  colorMode: ThemeMode;
  editMode: boolean;
  connectSourceId: string | null;
}) {
  const updatePositions = useMutation(api.ideas.updatePositions);
  const updateLayout = useMutation(api.ideas.updateLayout);
  const connectIdeas = useMutation(api.ideas.connect);

  /** Zapamćena kamera; `canvasState` bez `_id` je rezerva sa servera, ne upis. */
  const [initialViewport] = useState<Viewport | null>(() =>
    "_id" in data.canvasState
      ? { x: data.canvasState.x, y: data.canvasState.y, zoom: data.canvasState.zoom }
      : null,
  );

  const rawById = useMemo(
    () => new Map(data.nodes.map((node) => [node._id as string, node])),
    [data.nodes],
  );
  /** Ono što baza stvarno drži: pozicija ugnježdene ideje je RELATIVNA na roditelja. */
  const nested = useMemo<NestedNode[]>(
    () =>
      data.nodes.map((node) => ({
        id: node._id as string,
        x: node.x,
        y: node.y,
        parentId: (node.parentIdeaId as string | undefined) ?? null,
      })),
    [data.nodes],
  );

  /**
   * Upis poteza. `after` iz `EmbedFlow` nosi APSOLUTNE pozicije sa platna, a
   * `updatePositions` očekuje ono što baza drži — prevod radi `storedMovesFor`
   * (`lib/canvas-nesting.ts`). Bez njega bi svaka ugnježdena ideja tiho sletela na
   * poziciju uvećanu za offset roditelja (`ZA-POPRAVKU.md` §9).
   */
  const handleMoveNodes = useCallback(
    async (_before: NodeMove[], after: NodeMove[]) => {
      const writes = storedMovesFor(after, nested);
      if (writes.length === 0) return;
      if (writes.length > MAX_NESTED_MOVE_UPDATES) {
        postNative({
          type: "toast",
          level: "error",
          message: `Pomeraj najviše ${MAX_NESTED_MOVE_UPDATES} ideja odjednom.`,
        });
        throw new Error("Previše ideja u jednom potezu.");
      }
      // Koordinate od PRE poteza čita se iz podataka (STORED oblik), ne iz `_before`
      // — taj je apsolutan, pa bi „Poništi" upisao pogrešnu vrednost.
      const previous = writes.flatMap((move) => {
        const node = rawById.get(move.id);
        return node === undefined
          ? []
          : [{ id: move.id, x: Math.round(node.x), y: Math.round(node.y) }];
      });
      try {
        await updatePositions({
          startupId,
          updates: writes.map((move) => ({
            id: move.id as Id<"ideaNodes">,
            x: move.x,
            y: move.y,
          })),
        });
        postNative({
          type: "moved",
          canvas: "ideas",
          startupId,
          count: writes.length,
          moves: previous,
        });
      } catch (error) {
        postNative({
          type: "toast",
          level: "error",
          message: error instanceof Error ? error.message : "Pozicija nije sačuvana.",
        });
        throw error;
      }
    },
    [nested, rawById, startupId, updatePositions],
  );

  /**
   * Upis nove veličine. `updateLayout` traži i `x`/`y` (server ih prima zajedno),
   * pa ugaona ručka koja pomeri gornji/levi rub mora da pošalje i prevedenu poziciju.
   */
  const handleResizeNode = useCallback(
    async (nodeId: string, _before: EmbedResizeBox, after: EmbedResizeBox) => {
      const node = rawById.get(nodeId);
      if (node === undefined) return;
      const absoluteById = absolutePositions(nested);
      const parentId = nested.find((item) => item.id === nodeId)?.parentId ?? null;
      const parent = parentId === null ? null : absoluteById.get(parentId) ?? null;
      const x = Math.round(after.x - (parent?.x ?? 0));
      const y = Math.round(after.y - (parent?.y ?? 0));
      try {
        await updateLayout({
          startupId,
          ideaId: nodeId as Id<"ideaNodes">,
          x,
          y,
          width: after.width,
          height: after.height,
        });
        postNative({
          type: "resized",
          canvas: "ideas",
          startupId,
          id: nodeId,
          width: after.width,
          height: after.height,
          previous: {
            x: Math.round(node.x),
            y: Math.round(node.y),
            width: node.width ?? EMBED_NODE_WIDTH,
            height: node.height ?? EMBED_NODE_HEIGHT,
          },
          // Kartica koja PRE poteza nije imala ručnu veličinu se ne vraća samo
          // dimenzijama — inače ostaje ručno dimenzionisana zauvek (isto pravilo
          // kao `checkpointResize` u K4).
          manuallySized: node.width != null && node.height != null,
        });
      } catch (error) {
        postNative({
          type: "toast",
          level: "error",
          message:
            error instanceof Error ? error.message : "Veličina ideje nije sačuvana.",
        });
        throw error;
      }
    },
    [nested, rawById, startupId, updateLayout],
  );

  const pairs = useMemo(
    () => new Set(data.edges.map((edge) => pairKey(edge.nodeAId, edge.nodeBId))),
    [data.edges],
  );

  const handleConnectNodes = useCallback(
    async (sourceId: string, targetId: string) => {
      if (pairs.has(pairKey(sourceId, targetId))) {
        postNative({
          type: "toast",
          level: "info",
          message: "Ove ideje su već povezane.",
        });
        return;
      }
      try {
        const edgeId = await connectIdeas({
          startupId,
          nodeAId: sourceId as Id<"ideaNodes">,
          nodeBId: targetId as Id<"ideaNodes">,
        });
        postNative({ type: "connected", canvas: "ideas", startupId, edgeId });
      } catch (error) {
        postNative({
          type: "toast",
          level: "error",
          message: error instanceof Error ? error.message : "Veza nije sačuvana.",
        });
      }
    },
    [connectIdeas, pairs, startupId],
  );

  const handleUserViewport = useCallback(
    (viewport: Viewport) => {
      postNative({
        type: "viewport",
        canvas: "ideas",
        startupId,
        x: viewport.x,
        y: viewport.y,
        zoom: viewport.zoom,
      });
    },
    [startupId],
  );

  const { nodes, edges, detailById } = useMemo(() => {
    const raw = data.nodes;
    const absolute = absolutePositions(nested);
    const titleOf = (node: IdeaListNode) =>
      (node.title ?? node.text ?? "Ideja").trim().slice(0, 80) || "Ideja";
    const titleById = new Map(raw.map((node) => [node._id as string, titleOf(node)]));

    // Susedi po čvoru — računaju se JEDNOM za ceo graf, pa native sheet dobija
    // gotovu listu uz `node:actions`/`selection` (bez drugog upita, kao u K3).
    const edgesByNode = new Map<string, SimpleEdgeDetail[]>();
    const addNeighbour = (own: string, item: SimpleEdgeDetail) => {
      const list = edgesByNode.get(own);
      if (list) list.push(item);
      else edgesByNode.set(own, [item]);
    };
    for (const edge of data.edges) {
      const add = (own: string, other: string) => {
        addNeighbour(own, {
          _id: edge._id,
          kind: "canvas",
          otherId: other,
          otherTitle: titleById.get(other) ?? "Ideja",
          label: edge.label,
          canDelete: edge.canDeleteDirectly,
          canRequestDeletion: edge.canRequestDeletion,
        });
      };
      add(edge.nodeAId as string, edge.nodeBId as string);
      add(edge.nodeBId as string, edge.nodeAId as string);
    }

    const detailById = new Map<string, IdeaNodeDetail>(
      raw.map((node) => [
        node._id as string,
        {
          nodeKind: "idea",
          _id: node._id,
          title: node.title,
          text: node.text,
          upvotes: node.upvotes,
          downvotes: node.downvotes,
          userVote: node.userVote,
          author: node.author ? { displayName: node.author.displayName } : null,
          startupId,
          x: Math.round(node.x),
          y: Math.round(node.y),
          width: node.width ?? EMBED_NODE_WIDTH,
          height: node.height ?? EMBED_NODE_HEIGHT,
          manuallySized: node.width != null && node.height != null,
          canResize: node.canResize,
          // Server traži da si autor BAR JEDNE od dve kartice
          // (`ideas.connect`: „Vezu možete napraviti samo ako posedujete bar
          // jednu karticu."). Izvor koji je tvoj uvek prolazi, pa se bira taj
          // uslov — obrnuto bi zavisilo od cilja i davalo grešku posle tapa.
          canConnect: node.canEdit,
          nodeCount: raw.length,
          edges: edgesByNode.get(node._id as string) ?? [],
        } satisfies IdeaNodeDetail,
      ]),
    );

    return {
      nodes: raw.map<EmbedFlowNode>((node) => ({
        id: node._id,
        type: EMBED_NODE_TYPE,
        position: absolute.get(node._id as string) ?? { x: node.x, y: node.y },
        // Veličina ide i u čvor i u `style` — vidi `embed-node.tsx` (granice za `fitView`
        // moraju da postoje pre nego što xyflow izmeri DOM).
        width: node.width ?? EMBED_NODE_WIDTH,
        height: node.height ?? EMBED_NODE_HEIGHT,
        style: { width: node.width ?? EMBED_NODE_WIDTH, height: node.height ?? EMBED_NODE_HEIGHT },
        data: {
          label: titleOf(node),
          meta: `${node.upvotes} za · ${node.downvotes} protiv`,
          accent: node.isApproved,
          // Ručke dobija samo autor — server bi tuđu ideju ionako odbio.
          canResize: node.canResize,
          color: embedNodeColor(node.color),
        },
        ariaLabel: `Ideja: ${node.title ?? node.text}`,
      })),
      edges: data.edges.map((edge) => ({
        id: edge._id,
        source: edge.nodeAId,
        target: edge.nodeBId,
        label: edge.label ?? undefined,
      })),
      detailById: detailById as Map<string, unknown>,
    };
  }, [data.edges, data.nodes, nested, startupId]);

  return (
    <EmbedFlow
      nodes={nodes}
      edges={edges}
      detailById={detailById}
      colorMode={colorMode}
      editMode={editMode}
      connectSourceId={connectSourceId}
      onConnectNodes={handleConnectNodes}
      onMoveNodes={handleMoveNodes}
      onResizeNode={handleResizeNode}
      initialViewport={initialViewport}
      onUserViewport={handleUserViewport}
      ariaLabel="Kanvas ideja"
      emptyLabel="Prazan kanvas ideja."
    />
  );
}

/**
 * Detalj misli koji embed šalje native ljusci. Prvi deo je `ThoughtDetail` (mobilni
 * `thought-node-sheet.tsx`), ostalo je ono što traži sheet „Akcije misli" (K5).
 */
type ThoughtNodeDetail = {
  nodeKind: "thought";
  _id: Id<"thoughtNodes">;
  title: string | null;
  text: string;
  color: string;
  isParent: boolean;
  startupId: Id<"startups">;
  /** STORED (relativne) koordinate — `updateNodeLayout` prima baš njih. */
  x: number;
  y: number;
  width: number;
  height: number;
  manuallySized: boolean;
  canResize: boolean;
  canConnect: boolean;
  nodeCount: number;
  edges: SimpleEdgeDetail[];
};

type ThoughtListNode = FunctionReturnType<typeof api.thoughts.listNodes>["page"][number];
type ThoughtListEdge = FunctionReturnType<typeof api.thoughts.listEdges>["page"][number];

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
  editMode,
  connectSourceId,
}: {
  startupId: Id<"startups">;
  colorMode: ThemeMode;
  editMode: boolean;
  connectSourceId: string | null;
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

  const canvas = useQuery(api.thoughts.getCanvas, { startupId });

  useEffect(() => {
    if (nodeStatus === "CanLoadMore") loadMoreNodes(THOUGHT_NODE_PAGE);
  }, [nodeStatus, loadMoreNodes]);
  useEffect(() => {
    if (edgeStatus === "CanLoadMore") loadMoreEdges(THOUGHT_EDGE_PAGE);
  }, [edgeStatus, loadMoreEdges]);

  // Renderuj tek kad su i čvorovi i ivice do kraja učitani. `listNodes`/`listEdges`
  // pagira po `updatedAt` (ne po hijerarhiji), pa roditelj ugnježdene misli nije
  // garantovano stigao pre deteta — prerani render bi čvor privremeno crtao na
  // relativnoj poziciji, a ivice bez oba kraja. Auto-load do iscrpljenja je brz.
  if (nodeStatus !== "Exhausted" || edgeStatus !== "Exhausted" || canvas === undefined) {
    return <Center>Učitavanje kanvasa…</Center>;
  }

  return (
    <ThoughtsCanvasView
      startupId={startupId}
      nodeResults={nodeResults}
      edgeResults={edgeResults}
      canvas={canvas}
      colorMode={colorMode}
      editMode={editMode}
      connectSourceId={connectSourceId}
    />
  );
}

function ThoughtsCanvasView({
  startupId,
  nodeResults,
  edgeResults,
  canvas,
  colorMode,
  editMode,
  connectSourceId,
}: {
  startupId: Id<"startups">;
  nodeResults: ThoughtListNode[];
  edgeResults: ThoughtListEdge[];
  canvas: FunctionReturnType<typeof api.thoughts.getCanvas>;
  colorMode: ThemeMode;
  editMode: boolean;
  connectSourceId: string | null;
}) {
  const moveNodes = useMutation(api.thoughts.moveNodes);
  const updateNodeLayout = useMutation(api.thoughts.updateNodeLayout);
  const createEdge = useMutation(api.thoughts.createEdge);

  const [initialViewport] = useState<Viewport | null>(() =>
    canvas === null ? null : { x: canvas.x, y: canvas.y, zoom: canvas.zoom },
  );

  const rawById = useMemo(
    () => new Map(nodeResults.map((node) => [node._id as string, node])),
    [nodeResults],
  );
  /** Ono što baza drži: pozicija ugnježdene misli je RELATIVNA na roditelja. */
  const nested = useMemo<NestedNode[]>(
    () =>
      nodeResults.map((node) => ({
        id: node._id as string,
        x: node.x,
        y: node.y,
        parentId: (node.parentThoughtId as string | undefined) ?? null,
      })),
    [nodeResults],
  );

  const handleMoveNodes = useCallback(
    async (_before: NodeMove[], after: NodeMove[]) => {
      const writes = storedMovesFor(after, nested);
      if (writes.length === 0) return;
      if (writes.length > MAX_NESTED_MOVE_UPDATES) {
        postNative({
          type: "toast",
          level: "error",
          message: `Pomeraj najviše ${MAX_NESTED_MOVE_UPDATES} misli odjednom.`,
        });
        throw new Error("Previše misli u jednom potezu.");
      }
      const previous = writes.flatMap((move) => {
        const node = rawById.get(move.id);
        return node === undefined
          ? []
          : [{ id: move.id, x: Math.round(node.x), y: Math.round(node.y) }];
      });
      try {
        await moveNodes({
          moves: writes.map((move) => ({
            nodeId: move.id as Id<"thoughtNodes">,
            x: move.x,
            y: move.y,
          })),
        });
        postNative({
          type: "moved",
          canvas: "thoughts",
          startupId,
          count: writes.length,
          moves: previous,
        });
      } catch (error) {
        postNative({
          type: "toast",
          level: "error",
          message: error instanceof Error ? error.message : "Pozicija nije sačuvana.",
        });
        throw error;
      }
    },
    [moveNodes, nested, rawById, startupId],
  );

  const handleResizeNode = useCallback(
    async (nodeId: string, _before: EmbedResizeBox, after: EmbedResizeBox) => {
      const node = rawById.get(nodeId);
      if (node === undefined) return;
      const absoluteById = absolutePositions(nested);
      const parentId = nested.find((item) => item.id === nodeId)?.parentId ?? null;
      const parent = parentId === null ? null : absoluteById.get(parentId) ?? null;
      try {
        await updateNodeLayout({
          nodeId: nodeId as Id<"thoughtNodes">,
          x: Math.round(after.x - (parent?.x ?? 0)),
          y: Math.round(after.y - (parent?.y ?? 0)),
          width: after.width,
          height: after.height,
        });
        postNative({
          type: "resized",
          canvas: "thoughts",
          startupId,
          id: nodeId,
          width: after.width,
          height: after.height,
          previous: {
            x: Math.round(node.x),
            y: Math.round(node.y),
            width: node.width ?? EMBED_NODE_WIDTH,
            height: node.height ?? EMBED_NODE_HEIGHT,
          },
          manuallySized: node.width != null && node.height != null,
        });
      } catch (error) {
        postNative({
          type: "toast",
          level: "error",
          message:
            error instanceof Error ? error.message : "Veličina misli nije sačuvana.",
        });
        throw error;
      }
    },
    [nested, rawById, startupId, updateNodeLayout],
  );

  const pairs = useMemo(
    () => new Set(edgeResults.map((edge) => pairKey(edge.nodeAId, edge.nodeBId))),
    [edgeResults],
  );

  const handleConnectNodes = useCallback(
    async (sourceId: string, targetId: string) => {
      if (pairs.has(pairKey(sourceId, targetId))) {
        postNative({
          type: "toast",
          level: "info",
          message: "Ove misli su već povezane.",
        });
        return;
      }
      try {
        const edgeId = await createEdge({
          startupId,
          nodeAId: sourceId as Id<"thoughtNodes">,
          nodeBId: targetId as Id<"thoughtNodes">,
        });
        postNative({ type: "connected", canvas: "thoughts", startupId, edgeId });
      } catch (error) {
        postNative({
          type: "toast",
          level: "error",
          message: error instanceof Error ? error.message : "Veza nije sačuvana.",
        });
      }
    },
    [createEdge, pairs, startupId],
  );

  const handleUserViewport = useCallback(
    (viewport: Viewport) => {
      postNative({
        type: "viewport",
        canvas: "thoughts",
        startupId,
        x: viewport.x,
        y: viewport.y,
        zoom: viewport.zoom,
      });
    },
    [startupId],
  );

  const { nodes, edges, detailById } = useMemo(() => {
    const raw = nodeResults;
    const absolute = absolutePositions(nested);
    const titleOf = (node: ThoughtListNode) =>
      (node.title ?? node.text ?? "Misao").trim().slice(0, 80) || "Misao";
    const titleById = new Map(raw.map((node) => [node._id as string, titleOf(node)]));

    const edgesByNode = new Map<string, SimpleEdgeDetail[]>();
    const addNeighbour = (own: string, item: SimpleEdgeDetail) => {
      const list = edgesByNode.get(own);
      if (list) list.push(item);
      else edgesByNode.set(own, [item]);
    };
    for (const edge of edgeResults) {
      const add = (own: string, other: string) => {
        addNeighbour(own, {
          _id: edge._id,
          kind: "canvas",
          otherId: other,
          otherTitle: titleById.get(other) ?? "Misao",
          label: edge.label,
          // Misli su privatne po vlasniku (`thoughts.listNodes` filtrira
          // `ownerProfileId`), pa je sve na ovom platnu tvoje: veza se raskida
          // direktno i glasanja o brisanju nema.
          canDelete: true,
          canRequestDeletion: false,
        });
      };
      add(edge.nodeAId as string, edge.nodeBId as string);
      add(edge.nodeBId as string, edge.nodeAId as string);
    }

    const detailById = new Map<string, ThoughtNodeDetail>(
      raw.map((node) => [
        node._id as string,
        {
          nodeKind: "thought",
          _id: node._id,
          title: node.title,
          text: node.text,
          color: node.color,
          isParent: node.isParent ?? false,
          startupId,
          x: Math.round(node.x),
          y: Math.round(node.y),
          width: node.width ?? EMBED_NODE_WIDTH,
          height: node.height ?? EMBED_NODE_HEIGHT,
          manuallySized: node.width != null && node.height != null,
          canResize: true,
          canConnect: true,
          nodeCount: raw.length,
          edges: edgesByNode.get(node._id as string) ?? [],
        } satisfies ThoughtNodeDetail,
      ]),
    );

    return {
      nodes: raw.map<EmbedFlowNode>((node) => ({
        id: node._id,
        type: EMBED_NODE_TYPE,
        position: absolute.get(node._id as string) ?? { x: node.x, y: node.y },
        width: node.width ?? EMBED_NODE_WIDTH,
        height: node.height ?? EMBED_NODE_HEIGHT,
        style: { width: node.width ?? EMBED_NODE_WIDTH, height: node.height ?? EMBED_NODE_HEIGHT },
        data: {
          label: titleOf(node),
          meta: node.isParent ? "Roditeljska misao" : undefined,
          // Sve misli na platnu su vlasnikove, pa ručke dobija svaka.
          canResize: true,
          color: embedNodeColor(node.color),
        },
        ariaLabel: `${node.isParent ? "Roditeljska misao" : "Misao"}: ${node.title ?? node.text}`,
      })),
      edges: edgeResults.map((edge) => ({
        id: edge._id,
        source: edge.nodeAId,
        target: edge.nodeBId,
        label: edge.label ?? undefined,
      })) as Edge[],
      detailById: detailById as Map<string, unknown>,
    };
  }, [edgeResults, nested, nodeResults, startupId]);

  return (
    <EmbedFlow
      nodes={nodes}
      edges={edges}
      detailById={detailById}
      colorMode={colorMode}
      editMode={editMode}
      connectSourceId={connectSourceId}
      onConnectNodes={handleConnectNodes}
      onMoveNodes={handleMoveNodes}
      onResizeNode={handleResizeNode}
      initialViewport={initialViewport}
      onUserViewport={handleUserViewport}
      ariaLabel="Kanvas misli"
      emptyLabel="Prazan kanvas misli."
    />
  );
}

/** Payload je isti za oblast i stranicu (`canvasPayloadValidator`) — jedan render put. */
type PageCanvasData = FunctionReturnType<typeof api.areasV2.getAreaCanvasByArea>;

/**
 * Kraj checkpoint veze — isti oblik kao serverski `taskCheckpointCanvasEndpointValidator`
 * (`taskCheckpointCanvasEdges.connect`). Veza sme da spoji korak sa korakom ILI korak
 * sa karticom, ali nikad karticu sa karticom (to je `connectPages`).
 */
type CheckpointEndpoint =
  | { kind: "page"; id: Id<"pages"> }
  | { kind: "task_checkpoint"; id: Id<"taskCheckpoints"> };

/** Prefiks id-a čvora koraka na platnu — `taskCheckpointNodeId` ga i pravi. */
const CHECKPOINT_NODE_PREFIX = "checkpoint:";

function isCheckpointNodeId(nodeId: string): boolean {
  return nodeId.startsWith(CHECKPOINT_NODE_PREFIX);
}

/** Id čvora na platnu iz serverskog endpointa (kartica = go pageId, korak = prefiks). */
function checkpointEndpointNodeId(endpoint: CheckpointEndpoint): string {
  return endpoint.kind === "page" ? endpoint.id : taskCheckpointNodeId(endpoint.id);
}

/** Obrnut smer — id čvora sa platna u endpoint koji server očekuje. */
function checkpointEndpointFromNodeId(nodeId: string): CheckpointEndpoint {
  return isCheckpointNodeId(nodeId)
    ? {
        kind: "task_checkpoint",
        id: nodeId.slice(CHECKPOINT_NODE_PREFIX.length) as Id<"taskCheckpoints">,
      }
    : { kind: "page", id: nodeId as Id<"pages"> };
}

function checkpointIdFromNodeId(nodeId: string): Id<"taskCheckpoints"> {
  return nodeId.slice(CHECKPOINT_NODE_PREFIX.length) as Id<"taskCheckpoints">;
}

/**
 * Jedan sused čvora u native sheet-u „Akcije kartice" / „Akcije koraka" — canvas veza,
 * relacija stranica ili checkpoint veza. Relacija je tu samo da se VIDI (uklanja se na
 * ekranu stranice, `relations-section.tsx`): na kanvasu je linija 1–2 px koju prst ne
 * pogađa, pa je imenovana lista jedini čitljiv prikaz onoga što je povezano.
 */
type PageNodeEdgeDetail = {
  _id: string;
  kind: "canvas" | "relation" | "checkpoint";
  /** Id ČVORA druge strane: pageId za karticu, `checkpoint:<id>` za korak. */
  otherId: string;
  otherTitle: string;
  label: string | null;
  canDelete: boolean;
  canRequestDeletion: boolean;
  /**
   * Samo za `checkpoint`: „Poništi" raskida pravi NOVU vezu (arhivirana se ne
   * oživljava), a `connect` traži endpointe — ne id-jeve čvorova.
   */
  endpoints?: { source: CheckpointEndpoint; target: CheckpointEndpoint };
};

/**
 * Detalj page-čvora koji embed šalje native ljusci uz `node:open` / `selection` /
 * `node:actions` (na mobilnom otvara ekran stranice, odnosno sheet „Akcije kartice").
 * Nosi scope, trenutnu veličinu I susede, pa native za ceo sheet ne mora nijedan
 * drugi upit — isti princip kao u K2.
 */
type PageNodeDetail = {
  /** Diskriminator: native ne pogađa oblik nego grana po njemu (K4). */
  nodeKind: "page";
  _id: Id<"pages">;
  title: string;
  kind: string;
  canResize: boolean;
  width: number;
  height: number;
  startupId: Id<"startups">;
  areaId: Id<"startupAreas">;
  rootPageId: Id<"pages"> | null;
  /**
   * Sme li OVAJ korisnik da povuče vezu iz ove kartice. Isti uslov kao `canMove`
   * (autor kartice) jer server traži da veza dodiruje MOJU karticu
   * (`areasV2.ts` `connectPages` — „Vezu možete praviti samo od ili ka svojoj kartici.").
   */
  canConnect: boolean;
  /**
   * Broj čvorova na kanvasu (kartice + prikazani koraci) — ispod 2 nema koga da se
   * poveže. Sa checkpointima na platnu jedina kartica više nije nužno usamljena, zato
   * `nodeCount`, a ne `pageCount`.
   */
  nodeCount: number;
  /** Broj koraka zadatka — puni red „Prikaži korake (N)" u native sheet-u. */
  checkpointTotal: number;
  edges: PageNodeEdgeDetail[];
};

/**
 * Detalj checkpoint čvora (K4). Native iz njega otvara sheet „Akcije koraka" —
 * SAMO razmeštaj i veze; tekst, završenost, lančanje, brisanje i glasanje ostaju na
 * detalju zadatka (`components/zadatak/task-checkpoint-list.tsx`) i ne dupliraju se.
 */
type CheckpointNodeDetail = {
  nodeKind: "checkpoint";
  _id: Id<"taskCheckpoints">;
  nodeId: string;
  taskPageId: Id<"pages">;
  ordinal: number;
  text: string;
  completed: boolean;
  locked: boolean;
  /** Autor ZADATKA — isti uslov i za razmeštaj i za veze (`assertOwner`). */
  canMove: boolean;
  /** Placement već nosi `width`/`height` → „Poništi" bira tačan inverz (§4 P5). */
  manuallySized: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  startupId: Id<"startups">;
  areaId: Id<"startupAreas">;
  rootPageId: Id<"pages"> | null;
  nodeCount: number;
  edges: PageNodeEdgeDetail[];
};

/** Ključ para nezavisan od smera — isti oblik kao serverski `pairKey`. */
function pairKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}

// Ghost-ovi ne nose placement dimenzije sa servera (samo x/y), pa dobijaju fiksnu
// veličinu — usklađenu sa podrazumevanom karticom stranice da se ne izdvajaju oblikom.
const GHOST_NODE_WIDTH = 288;
const GHOST_NODE_HEIGHT = 196;

/** `MAX_BATCH_LAYOUT_UPDATES` iz `areasV2.ts` — preko toga mutacija baca grešku. */
const MAX_MOVE_UPDATES = 100;

/**
 * Zajednički prikaz za kanvas oblasti i stranice — payload je identičan, razlikuje se
 * samo upit (resolver po `areaId` vs `pageId`) i prazna poruka. Pozicije stranica su
 * već izračunate na serveru (placement ili grid fallback), pa se koriste direktno.
 *
 * NAMERNO IZOSTAVLJENO iz preglednog embeda (§5.2 — mobilni canvas je pregled/
 * navigacija/dodavanje, ne moderacija; izuzeci se zapisuju):
 * - `truncated` — baner „nije sve prikazano" se ne prikazuje.
 * - `kind` ivica — sve ivice se crtaju istom linijom (bez vizuelne razlike
 *   canvas/relacija/checkpoint); desktop to ima, embed pojednostavljuje. `label`
 *   se OD P4 crta (`edge.label`) — checkpoint ivice ga nemaju pa ostaju bez teksta.
 *
 * `checkpointEdges` se OD K4 crtaju — zajedno sa oblačićima koraka zadatka koji je
 * „razvijen" (native sheet kartice → „Prikaži korake"), odnosno uvek na kanvasu samog
 * zadatka. Suština koraka ostaje native na detalju zadatka; kanvas dodaje samo
 * razmeštaj i vezu (`docs/mobile/lanac4/planovi/faza-k4.md`).
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
  editMode,
  connectSourceId,
  expandedTaskId,
}: {
  data: PageCanvasData;
  colorMode: ThemeMode;
  ariaLabel: string;
  emptyLabel: string;
  editMode: boolean;
  connectSourceId: string | null;
  /** Zadatak čije korake native traži da se prikažu (`{type:"checkpoints"}`). */
  expandedTaskId: string | null;
}) {
  const movePages = useMutation(api.areasV2.movePages);
  const resizePage = useMutation(api.areasV2.resizePage);
  const connectPages = useMutation(api.areasV2.connectPages);
  const saveCheckpointPlacement = useMutation(api.taskCheckpoints.saveCanvasPlacement);
  const connectCheckpointEdge = useMutation(api.taskCheckpointCanvasEdges.connect);
  const { fitView } = useReactFlow();
  const { startupId, areaId, rootPageId } = data.scope;

  /** Kanvas SAMOG zadatka — tu su koraci uvek vidljivi (desktop `:380–393`). */
  const ownTaskPageId = data.scope.pageKind === "task" ? (rootPageId as string | null) : null;
  const pageIds = useMemo(
    () => new Set(data.pages.map((page) => page._id as string)),
    [data.pages],
  );
  /**
   * Guard koji desktop nema, a embedu je neophodan: `listForTask` BACA ako
   * `canvasRootPageId` nije ni sam zadatak ni njegov roditelj (`taskCheckpoints.ts:137`),
   * a izuzetak upita u Convex React-u ruši celo podstablo — dakle ceo kanvas. Zato se
   * upit zove SAMO za zadatak koji je stvarno na ovom platnu (§4 P3).
   */
  const visibleTaskId =
    ownTaskPageId ?? (expandedTaskId && pageIds.has(expandedTaskId) ? expandedTaskId : null);
  const checkpoints = useQuery(
    api.taskCheckpoints.listForTask,
    visibleTaskId === null
      ? "skip"
      : { taskPageId: visibleTaskId as Id<"pages">, canvasRootPageId: rootPageId },
  );
  // Zamrznuto na mount-u: `defaultViewport` i `fitView` xyflow čita samo pri inicijalizaciji,
  // a `data.viewport.persisted` postaje `true` čim se prvi pan sačuva — tada se vrednost
  // više ne sme menjati pod već otvorenim kanvasom.
  const [initialViewport] = useState<Viewport | null>(() =>
    data.viewport.persisted
      ? { x: data.viewport.x, y: data.viewport.y, zoom: data.viewport.zoom }
      : null,
  );

  /**
   * Upis poteza. Batch se seče na serverski limit; native dobija `moved` sa PRETHODNIM
   * koordinatama, pa traka „Poništi" ne mora ništa da čita iz baze. Greška ide native
   * `Alert`-u (embed nema toast površinu) i baca se dalje da `EmbedFlow` vrati kartice.
   *
   * K4: isti potez može da nosi i kartice i korake (mešano je moguće samo sa spoljnom
   * tastaturom, kroz multi-selekciju). Kartice idu u JEDAN `movePages`, koraci u N ×
   * `saveCanvasPlacement` — server prima jedan po pozivu — ali se šalje **jedna**
   * poruka `moved` sa oba niza: traka „Poništi" ima jedan slot, pa dva `postNative`
   * poziva ne smeju da nastanu. `saveCanvasPlacement` se zove BEZ `width`/`height`:
   * `patch` bez tih polja ih ne briše, pa potez ne sme da poništi ručnu veličinu.
   */
  const handleMoveNodes = useCallback(
    async (before: NodeMove[], after: NodeMove[]) => {
      const checkpointMoves = after.filter((move) => isCheckpointNodeId(move.id));
      const pageMoves = after
        .filter((move) => !isCheckpointNodeId(move.id))
        .slice(0, MAX_MOVE_UPDATES);
      const pageIdsMoved = new Set(pageMoves.map((move) => move.id));
      const checkpointIdsMoved = new Set(checkpointMoves.map((move) => move.id));
      const previousPages = before
        .filter((move) => pageIdsMoved.has(move.id))
        .map((move) => ({ pageId: move.id as Id<"pages">, x: move.x, y: move.y }));
      const previousCheckpoints = before
        .filter((move) => checkpointIdsMoved.has(move.id))
        .map((move) => ({
          checkpointId: checkpointIdFromNodeId(move.id),
          x: move.x,
          y: move.y,
        }));
      try {
        if (pageMoves.length > 0) {
          await movePages({
            startupId,
            areaId,
            rootPageId,
            updates: pageMoves.map((move) => ({
              pageId: move.id as Id<"pages">,
              x: move.x,
              y: move.y,
            })),
          });
        }
        for (const move of checkpointMoves) {
          await saveCheckpointPlacement({
            checkpointId: checkpointIdFromNodeId(move.id),
            canvasRootPageId: rootPageId,
            x: move.x,
            y: move.y,
          });
        }
        postNative({
          type: "moved",
          startupId,
          areaId,
          rootPageId,
          count: pageMoves.length,
          before: previousPages,
          checkpoints: previousCheckpoints,
        });
      } catch (error) {
        postNative({
          type: "toast",
          level: "error",
          message: error instanceof Error ? error.message : "Pozicija nije sačuvana.",
        });
        throw error;
      }
    },
    [areaId, movePages, rootPageId, saveCheckpointPlacement, startupId],
  );

  /**
   * Upis nove veličine — blizanac `handleMoveNodes`. `x`/`y` idu UVEK zajedno (server
   * odbija jedno bez drugog, `areasV2.ts:2425`): ugaona ručka pomera gornji/levi rub,
   * pa je pozicija deo istog poteza. Native uz `resized` dobija i staru veličinu (za
   * „Poništi") i novu (da sheet posle povlačenja računa ±10% iz tačne vrednosti).
   */
  const handleResizeNode = useCallback(
    async (pageId: string, before: EmbedResizeBox, after: EmbedResizeBox) => {
      try {
        await resizePage({
          startupId,
          areaId,
          rootPageId,
          pageId: pageId as Id<"pages">,
          width: after.width,
          height: after.height,
          x: after.x,
          y: after.y,
        });
        postNative({
          type: "resized",
          startupId,
          areaId,
          rootPageId,
          pageId,
          width: after.width,
          height: after.height,
          previous: before,
        });
      } catch (error) {
        postNative({
          type: "toast",
          level: "error",
          message:
            error instanceof Error ? error.message : "Veličina kartice nije sačuvana.",
        });
        throw error;
      }
    },
    [areaId, resizePage, rootPageId, startupId],
  );

  /**
   * Kamera se ne piše odavde nego se prijavljuje native ljusci: ona je prigušuje (800 ms)
   * i ona je vlasnik dugmadi koja kameru pomeraju. Vrednost je već zaokružena u
   * `EmbedFlow` (isto zaokruživanje kao desktop) — tamo je i provera „da li se uopšte
   * promenila", pa ovde stiže samo stvarna promena.
   */
  const handleUserViewport = useCallback(
    (viewport: Viewport) => {
      postNative({
        type: "viewport",
        startupId,
        areaId,
        rootPageId,
        x: viewport.x,
        y: viewport.y,
        zoom: viewport.zoom,
      });
    },
    [areaId, rootPageId, startupId],
  );

  /**
   * Postojeći parovi — SAMO canvas veze. Relacija ne blokira canvas vezu (isto
   * pravilo kao desktop, `area-canvas-view.tsx` `alreadyConnected`): to su dve
   * različite vrste odnosa i server ih drži u različitim tabelama.
   */
  const canvasPairs = useMemo(
    () => new Set(data.edges.map((edge) => pairKey(edge.source, edge.target))),
    [data.edges],
  );

  /**
   * Postojeći checkpoint parovi — ZASEBAN `Set`. Preklapanja sa `canvasPairs` nema:
   * checkpoint veza uvek ima bar jedan korak, a page-veza nijedan.
   */
  const checkpointPairs = useMemo(
    () =>
      new Set(
        data.checkpointEdges.map((edge) =>
          pairKey(checkpointEndpointNodeId(edge.source), checkpointEndpointNodeId(edge.target)),
        ),
      ),
    [data.checkpointEdges],
  );

  /**
   * Upis nove veze. Duplikat se hvata NA KLIJENTU i mutacija se tada ne zove (zahtev
   * zadatka) — server bi na postojeći par vratio isti `_id`, pa bi „Poništi" ponudio
   * brisanje veze koju korisnik nije napravio.
   *
   * Bez optimističke ivice: Convex razrešava mutaciju tek kad je pretplata ISTOG
   * klijenta osvežena, pa se linija pojavi u istom trenutku. Lokalno stanje ivica bi
   * uvelo drugi izvor istine bez ijedne dobiti (čvorovi ga imaju samo zbog poteza).
   *
   * Greška NE gasi biranje — vlasnik režima je native; poruka objasni, „Otkaži" je
   * nadohvat prsta.
   */
  const handleConnectNodes = useCallback(
    async (sourceId: string, targetId: string) => {
      // Par koji dodiruje korak ide u drugu tabelu i drugu mutaciju (K4). Kartica ↔
      // kartica ostaje `connectPages`; server bi vezu bez ijednog koraka ionako odbio
      // („Ova veza mora sadržati najmanje jedan checkpoint.").
      if (isCheckpointNodeId(sourceId) || isCheckpointNodeId(targetId)) {
        if (checkpointPairs.has(pairKey(sourceId, targetId))) {
          postNative({
            type: "toast",
            level: "info",
            message: "Ove stavke su već povezane.",
          });
          return;
        }
        try {
          const edgeId = await connectCheckpointEdge({
            startupId,
            areaId,
            rootPageId,
            source: checkpointEndpointFromNodeId(sourceId),
            target: checkpointEndpointFromNodeId(targetId),
          });
          postNative({
            type: "connected",
            edgeKind: "checkpoint",
            startupId,
            areaId,
            rootPageId,
            edgeId,
          });
        } catch (error) {
          postNative({
            type: "toast",
            level: "error",
            message: error instanceof Error ? error.message : "Veza koraka nije sačuvana.",
          });
        }
        return;
      }
      if (canvasPairs.has(pairKey(sourceId, targetId))) {
        postNative({
          type: "toast",
          level: "info",
          message: "Ove kartice su već povezane.",
        });
        return;
      }
      try {
        const edgeId = await connectPages({
          startupId,
          areaId,
          rootPageId,
          sourcePageId: sourceId as Id<"pages">,
          targetPageId: targetId as Id<"pages">,
        });
        postNative({ type: "connected", edgeKind: "page", startupId, areaId, rootPageId, edgeId });
      } catch (error) {
        postNative({
          type: "toast",
          level: "error",
          message: error instanceof Error ? error.message : "Veza nije sačuvana.",
        });
      }
    },
    [
      areaId,
      canvasPairs,
      checkpointPairs,
      connectCheckpointEdge,
      connectPages,
      rootPageId,
      startupId,
    ],
  );

  const { nodes, edges, detailById } = useMemo(() => {
    /**
     * Oblačići koraka. Ista formula kao desktop (`area-canvas-view.tsx:489–570`), sa
     * jednom razlikom: `canResize` se NIKAD ne postavlja, pa ručke ne postoje (§5).
     * `checkpoints === undefined` ne blokira kanvas — kartice se crtaju odmah, a
     * oblačići doskoče (isto kao desktop).
     */
    const checkpointRows = checkpoints ?? [];
    const taskNode =
      visibleTaskId === null
        ? undefined
        : data.pages.find((page) => (page._id as string) === visibleTaskId);
    const showCheckpoints =
      visibleTaskId !== null &&
      checkpoints !== undefined &&
      (ownTaskPageId !== null || taskNode !== undefined);
    const center =
      ownTaskPageId !== null || taskNode === undefined
        ? { x: 0, y: 0 }
        : { x: taskNode.x + taskNode.width / 2, y: taskNode.y + taskNode.height / 2 };
    // Isti fallback kao desktop (`:525`) kad kartice zadatka nema na platnu.
    const exclusion =
      taskNode === undefined
        ? { width: 176, height: 136 }
        : { width: taskNode.width, height: taskNode.height };

    const checkpointNodes: EmbedFlowNode[] = showCheckpoints
      ? checkpointRows.map((checkpoint, index) => {
          const metrics = taskCheckpointNodeMetrics(checkpoint.text);
          const ordinal = taskCheckpointOrdinal(checkpoint.ordinal, index);
          const width = checkpoint.placement?.width ?? metrics.width;
          const height = checkpoint.placement?.height ?? metrics.height;
          const position = checkpoint.placement
            ? { x: checkpoint.placement.x, y: checkpoint.placement.y }
            : taskCheckpointOrbitPosition({ index, center, node: metrics, exclusion });
          return {
            id: taskCheckpointNodeId(checkpoint._id),
            type: EMBED_NODE_TYPE,
            position,
            width,
            height,
            style: { width, height },
            // Isto pravilo kao kartica: tuđi korak backend odbija, pa se ne sme ni
            // pomerati pod prstom.
            draggable: checkpoint.canMove ? undefined : false,
            data: {
              variant: "checkpoint" as const,
              label: checkpoint.text.trim().slice(0, 80) || "Korak",
              meta: `Korak ${ordinal} · ${
                checkpoint.completed
                  ? "Završen"
                  : checkpoint.locked
                    ? `Čeka korak ${checkpoint.blockedByOrdinal}`
                    : "Otvoren"
              }`,
            },
            ariaLabel: `Checkpoint broj ${ordinal}: ${checkpoint.text}.`,
          };
        })
      : [];

    // Naslov druge strane veze: kartice iz payload-a, koraci iz rednog broja.
    const titleById = new Map(data.pages.map((page) => [page._id as string, page.title]));
    const checkpointTitleByNodeId = new Map<string, string>();
    if (showCheckpoints) {
      checkpointRows.forEach((checkpoint, index) => {
        checkpointTitleByNodeId.set(
          taskCheckpointNodeId(checkpoint._id),
          `Korak ${taskCheckpointOrdinal(checkpoint.ordinal, index)}`,
        );
      });
    }
    const titleForNode = (nodeId: string) =>
      checkpointTitleByNodeId.get(nodeId) ??
      titleById.get(nodeId) ??
      (isCheckpointNodeId(nodeId) ? "Korak" : "Stranica bez naslova");

    // Ivice koraka ulaze u graf samo kad su OBA kraja na platnu (desktop `:616–652`).
    const visibleNodeIds = new Set<string>([
      ...data.pages.map((page) => page._id as string),
      ...checkpointNodes.map((node) => node.id),
    ]);
    const checkpointEdges = data.checkpointEdges
      .map((edge) => ({
        edge,
        sourceNodeId: checkpointEndpointNodeId(edge.source),
        targetNodeId: checkpointEndpointNodeId(edge.target),
      }))
      .filter(
        ({ sourceNodeId, targetNodeId }) =>
          visibleNodeIds.has(sourceNodeId) && visibleNodeIds.has(targetNodeId),
      );

    // Susedi po ČVORU — računaju se JEDNOM za ceo graf, pa native sheet dobija gotovu
    // listu uz `node:actions`/`selection` (bez drugog upita, kao u K2/K3).
    const edgesByNode = new Map<string, PageNodeEdgeDetail[]>();
    const addNeighbour = (own: string, item: PageNodeEdgeDetail) => {
      const list = edgesByNode.get(own);
      if (list) list.push(item);
      else edgesByNode.set(own, [item]);
    };
    for (const edge of [...data.edges, ...data.relations]) {
      const add = (own: string, other: string) => {
        addNeighbour(own, {
          _id: edge._id,
          kind: edge.kind,
          otherId: other,
          otherTitle: titleForNode(other),
          label: edge.label,
          canDelete: edge.canDelete,
          canRequestDeletion: edge.canRequestDeletion,
        });
      };
      add(edge.source, edge.target);
      add(edge.target, edge.source);
    }
    for (const { edge, sourceNodeId, targetNodeId } of checkpointEdges) {
      const add = (own: string, other: string) => {
        addNeighbour(own, {
          _id: edge._id,
          kind: "checkpoint",
          otherId: other,
          otherTitle: titleForNode(other),
          label: null,
          canDelete: edge.canDelete,
          canRequestDeletion: edge.canRequestDeletion,
          // „Poništi" raskida pravi NOVU vezu, pa mu trebaju endpointi (ne id-jevi čvorova).
          endpoints: { source: edge.source, target: edge.target },
        });
      };
      add(sourceNodeId, targetNodeId);
      add(targetNodeId, sourceNodeId);
    }

    const nodeCount = data.pages.length + checkpointNodes.length;
    const detailById = new Map<string, unknown>(
      data.pages.map((page) => [
        page._id as string,
        {
          nodeKind: "page",
          _id: page._id,
          title: page.title,
          kind: page.kind,
          canResize: page.canResize,
          width: page.width,
          height: page.height,
          startupId: data.scope.startupId,
          areaId: data.scope.areaId,
          rootPageId: data.scope.rootPageId,
          canConnect: page.canMove,
          nodeCount,
          checkpointTotal: page.checkpointTotal,
          edges: edgesByNode.get(page._id as string) ?? [],
        } satisfies PageNodeDetail,
      ]),
    );
    if (showCheckpoints && visibleTaskId !== null) {
      checkpointRows.forEach((checkpoint, index) => {
        const nodeId = taskCheckpointNodeId(checkpoint._id);
        const flowNode = checkpointNodes[index];
        detailById.set(nodeId, {
          nodeKind: "checkpoint",
          _id: checkpoint._id,
          nodeId,
          taskPageId: visibleTaskId as Id<"pages">,
          ordinal: taskCheckpointOrdinal(checkpoint.ordinal, index),
          text: checkpoint.text,
          completed: checkpoint.completed,
          locked: checkpoint.locked,
          canMove: checkpoint.canMove,
          manuallySized:
            checkpoint.placement?.width != null && checkpoint.placement?.height != null,
          x: Math.round(flowNode.position.x),
          y: Math.round(flowNode.position.y),
          width: flowNode.width ?? 0,
          height: flowNode.height ?? 0,
          startupId: data.scope.startupId,
          areaId: data.scope.areaId,
          rootPageId: data.scope.rootPageId,
          nodeCount,
          edges: edgesByNode.get(nodeId) ?? [],
        } satisfies CheckpointNodeDetail);
      });
    }
    // Stranice nose stvarne dimenzije sa servera (placement ili podrazumevane), pa se
    // koriste one — layout ostaje isti kao na desktopu.
    const pageNodes = data.pages.map<EmbedFlowNode>((page) => ({
      id: page._id,
      type: EMBED_NODE_TYPE,
      position: { x: page.x, y: page.y },
      width: page.width,
      height: page.height,
      style: { width: page.width, height: page.height },
      // `undefined` prepušta odluku globalnom `nodesDraggable` (tj. režimu), a `false`
      // je tvrdo NE: tuđu karticu backend ionako odbija (`Možete pomerati samo svoje
      // kartice.`), pa se ne sme ni pomerati pod prstom.
      draggable: page.canMove ? undefined : false,
      data: {
        label: (page.title || "Stranica").trim().slice(0, 80) || "Stranica",
        meta: pageKindLabel(page.kind),
        // Ručke za veličinu dobija samo autor kartice — server bi tuđu ionako odbio.
        canResize: page.canResize,
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
      // Ghost nije stranica na kanvasu nego zahtev — `movePages` za njega ne postoji.
      draggable: false,
      data: {
        label: (ghost.title || "Stranica").trim().slice(0, 80) || "Stranica",
        meta: pageKindLabel(ghost.kind),
        ghost: true,
      },
      ariaLabel: `Čeka odobrenje — ${pageKindLabel(ghost.kind)}: ${ghost.title}`,
    }));
    return {
      nodes: [...pageNodes, ...ghostNodes, ...checkpointNodes],
      // Canvas ivice + relacije stranica dele isti oblik (source/target po id-u stranice).
      // `data.kind` se ČUVA (vizuelno i dalje ne razlikujemo linije): po njemu se u
      // sheet-u zna šta se sme raskinuti odavde, a šta se uklanja na ekranu stranice.
      edges: [
        ...[...data.edges, ...data.relations].map((edge) => ({
          id: edge._id,
          source: edge.source,
          target: edge.target,
          label: edge.label ?? undefined,
          data: { kind: edge.kind },
        })),
        // Prefiks u id-u ivice: checkpoint veze su druga tabela, pa se ni slučajno ne
        // sudaraju sa page-ivicom istog id-a. Checkpoint veze nemaju naziv
        // (`visibleCheckpointEdgeValidator` nema `label`), pa ostaju bez teksta.
        ...checkpointEdges.map(({ edge, sourceNodeId, targetNodeId }) => ({
          id: `checkpoint:${edge._id}`,
          source: sourceNodeId,
          target: targetNodeId,
          data: { kind: "checkpoint" },
        })),
      ] as Edge[],
      detailById,
    };
  }, [checkpoints, data, ownTaskPageId, visibleTaskId]);

  /**
   * Uklapanje posle „Prikaži korake" (desktop parnjak: `checkpointFitKeyRef`,
   * `area-canvas-view.tsx:677–717`). Bez njega se oblačići pojave van vidnog polja —
   * orbit ide oko kartice, a kamera je tamo gde je bila.
   *
   * Na kanvasu SAMOG zadatka sa zapamćenom kamerom se NE uklapa: koraci su tu od
   * početka, a fit bi pregazio pogled koji je korisnik sam sačuvao (`saveViewport`).
   */
  const checkpointFitKeyRef = useRef("");
  useEffect(() => {
    if (visibleTaskId === null || checkpoints === undefined || checkpoints.length === 0) {
      checkpointFitKeyRef.current = "";
      return;
    }
    const fitKey = `${rootPageId ?? "root"}:${visibleTaskId}:${checkpoints.length}`;
    if (checkpointFitKeyRef.current === fitKey) return;
    checkpointFitKeyRef.current = fitKey;
    if (ownTaskPageId !== null && initialViewport) return;
    const targets = [
      ...checkpoints.map((checkpoint) => ({ id: taskCheckpointNodeId(checkpoint._id) })),
      ...(pageIds.has(visibleTaskId) ? [{ id: visibleTaskId }] : []),
    ];
    // Odloženo na sledeći task: čvorovi koji su upravo dodati u graf još nisu izmereni,
    // pa bi sinhroni `fitView` računao granice bez njih.
    const timer = window.setTimeout(() => {
      void fitView({
        nodes: targets,
        padding: 0.22,
        maxZoom: 1.15,
        duration: motionDuration(260),
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [checkpoints, fitView, initialViewport, ownTaskPageId, pageIds, rootPageId, visibleTaskId]);

  return (
    <EmbedFlow
      nodes={nodes}
      edges={edges}
      detailById={detailById}
      colorMode={colorMode}
      ariaLabel={ariaLabel}
      emptyLabel={emptyLabel}
      // Kanvas zadatka bez podstranica: prazno stanje čeka da koraci stignu.
      emptyPending={visibleTaskId !== null && checkpoints === undefined}
      editMode={editMode}
      connectSourceId={connectSourceId}
      onConnectNodes={handleConnectNodes}
      onMoveNodes={handleMoveNodes}
      onResizeNode={handleResizeNode}
      initialViewport={initialViewport}
      onUserViewport={handleUserViewport}
    />
  );
}

/** Kanvas oblasti u embed-u — resolver po `areaId` (`rootPageId: null`). */
function AreaFlow({
  areaId,
  colorMode,
  editMode,
  connectSourceId,
  expandedTaskId,
}: {
  areaId: Id<"startupAreas">;
  colorMode: ThemeMode;
  editMode: boolean;
  connectSourceId: string | null;
  expandedTaskId: string | null;
}) {
  const data = useQuery(api.areasV2.getAreaCanvasByArea, { areaId });
  if (data === undefined) return <Center>Učitavanje kanvasa…</Center>;
  return (
    <PageCanvasView
      data={data}
      colorMode={colorMode}
      editMode={editMode}
      connectSourceId={connectSourceId}
      expandedTaskId={expandedTaskId}
      ariaLabel="Kanvas oblasti"
      emptyLabel="Prazan kanvas oblasti."
    />
  );
}

/** Kanvas stranice u embed-u — resolver po `pageId` (`rootPageId: pageId`). */
function PageFlow({
  pageId,
  colorMode,
  editMode,
  connectSourceId,
  expandedTaskId,
}: {
  pageId: Id<"pages">;
  colorMode: ThemeMode;
  editMode: boolean;
  connectSourceId: string | null;
  expandedTaskId: string | null;
}) {
  const data = useQuery(api.areasV2.getPageCanvasByPage, { pageId });
  if (data === undefined) return <Center>Učitavanje kanvasa…</Center>;
  // Kanvas zadatka nosi korake, ne samo podstranice — prazno stanje i ime prikaza to
  // moraju da kažu, inače zadatak bez podstranica izgleda kao pogrešan ekran.
  const isTask = data.scope.pageKind === "task";
  return (
    <PageCanvasView
      data={data}
      colorMode={colorMode}
      editMode={editMode}
      connectSourceId={connectSourceId}
      expandedTaskId={expandedTaskId}
      ariaLabel={isTask ? "Kanvas zadatka" : "Kanvas stranice"}
      emptyLabel={
        isTask ? "Zadatak nema korake ni podstranice." : "Prazan kanvas stranice."
      }
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
      /* Režim „Uredi raspored": isprekidan obod obeležava tačno ono što se sme povući.
         Klasu \`draggable\` xyflow sam stavlja na čvor koji je povlačiv, pa tuđa kartica
         (\`draggable:false\`, backend je ionako odbija) ostaje bez oznake — bez ijedne
         izmene u \`embed-node.tsx\` i bez novog polja u \`data\` koje bi rerenderovalo
         sve čvorove. */
      .embed-edit .react-flow__node.draggable {
        outline: 2px dashed color-mix(in oklab, var(--primary) 55%, transparent);
        outline-offset: 4px;
        border-radius: 0.75rem;
      }
      /* Izabrana kartica ≠ samo povlačiva: puna linija je znak da su sada vidljive i
         ručke za veličinu. Pravilo mora da stoji POSLE \`draggable\` (ista specifičnost)
         i menja samo stil linije — boju, širinu i odmak nasleđuje od njega. */
      .embed-edit .react-flow__node.selected {
        outline-style: solid;
      }
      /* Biranje cilja za vezu: u tom stanju se ništa ne povlači, pa ni jedna kartica
         nema xyflow klasu \`draggable\` — ostalo bi samo \`outline-style: solid\` iz
         pravila iznad, a to je (bez širine i boje) sivi \`medium\` obod koji ništa ne
         znači. Gasi se ovde; izvor svoj puni prsten dobija iz dinamičkog pravila po
         \`data-id\`, koje stoji POSLE ovog bloka. */
      .embed-connect .react-flow__node.selected {
        outline: none;
      }
      .embed-connect .react-flow__node {
        cursor: pointer;
      }
      /* Dugi pritisak (put do native sheet-a) ne sme da postane „izaberi tekst" ni da
         otvori sistemski meni nad karticom. */
      .embed-edit .react-flow__node {
        -webkit-user-select: none;
        user-select: none;
        -webkit-touch-callout: none;
      }
      /* Checkpoint oblačić (K4): da se na prvi pogled razlikuje od kartice stranice.
         Samo leva ivica — oblačić je mali (164 × 110), pa svaki jači okvir jede
         prostor tekstu koraka. */
      .react-flow__node .embed-checkpoint {
        border-left-width: 3px;
        border-left-color: var(--primary);
      }
      /* Vidljivi deo ručke: 16 px tačka u meti od 44pt (\`HANDLE_STYLE\` u
         \`embed-node.tsx\`). Meta se ne smanjuje — smanjuje se samo ono što se vidi. */
      .embed-resize-dot {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: var(--primary);
        border: 2px solid var(--background);
        box-shadow: 0 1px 3px rgb(0 0 0 / 0.35);
      }
      /* Boja čvora (P4) — tačka pored naslova. Vrednosti su PRESLIKANE iz desktop
         \`connected-canvas.module.css\` (\`--node-accent\` po boji); embed ne uvozi taj
         modul (šest pravila bi povuklo ceo desktop stylesheet sa \`:global\` pravilima). */
      .embed-node-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        flex: none;
        background: var(--node-accent, var(--muted-foreground));
      }
      .embed-node-dot[data-node-color="neutral"] { --node-accent: oklch(0.58 0.025 266); }
      .embed-node-dot[data-node-color="violet"] { --node-accent: oklch(0.57 0.2 294); }
      .embed-node-dot[data-node-color="blue"] { --node-accent: oklch(0.58 0.17 249); }
      .embed-node-dot[data-node-color="green"] { --node-accent: oklch(0.57 0.14 155); }
      .embed-node-dot[data-node-color="amber"] { --node-accent: oklch(0.68 0.16 78); }
      .embed-node-dot[data-node-color="rose"] { --node-accent: oklch(0.61 0.19 18); }
      /* Oznaka veze (P4, C5) — xyflow crta \`label\` kroz \`EdgeText\` (\`<text>\` +
         pozadinski \`<rect>\`); stock boje su van naše palete. */
      .react-flow__edge-text {
        fill: var(--foreground);
        font-size: 11px;
      }
      .react-flow__edge-textbg {
        fill: var(--background);
      }
    `}</style>
  );
}
