import { useAuthToken } from '@convex-dev/auth/react';
import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter, type ErrorBoundaryProps } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import {
  ChevronLeft,
  Ellipsis,
  Maximize2,
  Minimize2,
  Plus,
  Send,
  TriangleAlert,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { CanvasRail, type RailAction } from '@/components/canvas/canvas-rail';
import { ConnectBar } from '@/components/canvas/connect-bar';
import { IdeaCreateSheet } from '@/components/canvas/idea-create-sheet';
import { IdeaNodeSheet, type IdeaDetail } from '@/components/canvas/idea-node-sheet';
import { PageCreateSheet } from '@/components/canvas/page-create-sheet';
import { PageNodeSheet, type PageNodeTarget } from '@/components/canvas/page-node-sheet';
import { ThoughtCreateSheet } from '@/components/canvas/thought-create-sheet';
import { ThoughtNodeSheet, type ThoughtDetail } from '@/components/canvas/thought-node-sheet';
import { EmptyState } from '@/components/empty-state';
import { ThoughtConversionSheet } from '@/components/misli/thought-conversion-sheet';
import { UndoBar } from '@/components/undo-bar';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { canvasKindLabel, embedCanvasUrl, type CanvasKind } from '@/lib/embed-url';
import { haptics } from '@/lib/haptics';
import { pushUndo } from '@/lib/undo';
import { useAppTheme, useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, text, type ColorTokens } from '@/theme/tokens';

const KINDS: readonly CanvasKind[] = ['thoughts', 'ideas', 'area', 'page'];
const webBase = process.env.EXPO_PUBLIC_WEB_URL;
/** Backend `MAX_BULK_ITEMS` — `convertToIdeas` prima najviše 50 misli. */
const MAX_BULK = 50;
/**
 * Prigušenje upisa kamere. Pan prstom stigne kao niz `moveend` događaja; kamera je
 * podešavanje sesije, ne radnja, pa se piše tek kad se ruka smiri.
 */
const VIEWPORT_DEBOUNCE_MS = 800;

/** Scope kanvasa koji embed šalje uz `moved`/`viewport` — native ga ne dohvata sam. */
type CanvasScope = {
  startupId: Id<'startups'>;
  areaId: Id<'startupAreas'>;
  rootPageId: Id<'pages'> | null;
};

/** Kamera koja čeka upis (poslednja pobeđuje). */
type PendingViewport = CanvasScope & { x: number; y: number; zoom: number };

/** „Kartica je pomerena." / „3 kartice su pomerene." / „5 kartica je pomereno." */
function movedLabel(count: number): string {
  if (count === 1) return 'Kartica je pomerena.';
  const rest = count % 100;
  const last = count % 10;
  if (last >= 2 && last <= 4 && (rest < 12 || rest > 14)) return `${count} kartice su pomerene.`;
  return `${count} kartica je pomereno.`;
}

// Konstantni WebView prop — van komponente da ne bude nov niz na svaki render
// (isti razlog kao memoizovan `source` niže: promena reference reloaduje stranicu).
const ORIGIN_WHITELIST = ['*'];

/**
 * Mobilni canvas (M4.3, §9.3): native header + `WebView` nad embed rutom + native
 * akcioni rail. WebView drži pan/zoom/selekciju; native drži header, rail, detalj
 * čvora (bottom sheet) i kreiranje. Swipe-back je isključen na ovoj ruti (`_layout`:
 * `gestureEnabled:false`) da se ne bije sa horizontalnim pan-om — „nazad" ide kroz
 * dugme u headeru.
 *
 * Auth NE ide kroz URL ni kroz `postMessage` handshake: token se injektuje u web
 * kontekst (`window.__DEVOTION_AUTH__`) preko `injectedJavaScriptBeforeContentLoaded`
 * PRE učitavanja stranice, pa ga embed pročita sinhrono na mount-u (nema trke sa
 * startom mosta — vidi §5.2 i ZA-POPRAVKU Z2). Most ostaje samo za nekritično
 * osvežavanje tokena i žive kontrole. Detalj čvora stiže uz `node:open`/`selection`
 * — nema drugog `ideas.list` upita ovde.
 */
export default function CanvasScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { scheme } = useAppTheme();
  const token = useAuthToken();
  const { activeStartupId } = useActiveStartup();
  const params = useLocalSearchParams<{ kind: string; id: string }>();
  const kind = params.kind as CanvasKind;
  const id = params.id;

  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  // Otvoreni detalj po vrsti (bottom sheet na `node:open` / „Otvori" akciju).
  const [openIdea, setOpenIdea] = useState<IdeaDetail | null>(null);
  const [openThought, setOpenThought] = useState<ThoughtDetail | null>(null);
  // Multi-selekcija misli → „U Ideje (N)" (samo id-jevi — `selection` ne nosi detalje).
  const [conversionIds, setConversionIds] = useState<Id<'thoughtNodes'>[] | null>(null);
  // Selekcija na kanvasu (menja primarnu akciju rail-a). `selectedNode` je detalj
  // koji embed pošalje uz `selection` kad je izabran baš jedan čvor (oblik zavisi od vrste).
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedNode, setSelectedNode] = useState<unknown>(null);
  // Kartica nad kojom je otvoren sheet „Akcije kartice" (veze + veličina). Otvara ga
  // dugi pritisak u WebView-u (`node:actions`) ili četvrta ikonica rail-a — dva puta
  // do iste radnje, jer je `contextmenu` u WKWebView-u nepouzdan.
  const [nodeTarget, setNodeTarget] = useState<PageNodeTarget | null>(null);
  // Kartica-izvor dok se bira cilj veze (K3). Native je vlasnik ovog stanja, kao i
  // režima; embed ga saznaje isključivo iz poruke `connect`.
  const [connectSource, setConnectSource] = useState<{ _id: string; title: string } | null>(null);
  // Landscape daje više prostora grafu (maketa §9.3, dugme [⛶]). Rotacija je samo
  // za ovaj ekran — na izlazak se OBAVEZNO vraća portret (cleanup ispod).
  const [landscape, setLandscape] = useState(false);
  // Režim „Uredi raspored" (lanac 4, `docs/mobile/lanac4/REZIM.md`). Native je vlasnik
  // stanja; embed ga saznaje isključivo iz poruke `mode` i pri svakom učitavanju iznova.
  const [editMode, setEditMode] = useState(false);

  const toggleOrientation = useCallback(async () => {
    const next = landscape
      ? ScreenOrientation.OrientationLock.PORTRAIT_UP
      : ScreenOrientation.OrientationLock.LANDSCAPE;
    await ScreenOrientation.lockAsync(next);
    setLandscape((prev) => !prev);
  }, [landscape]);

  // Vrati portret kad se napusti ekran (unmount) — da drugi ekrani, koji su svi
  // portret-only, ne ostanu zaključani u landscape-u ako se izađe iz landscape moda.
  useEffect(() => {
    return () => {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, []);

  const isIdeas = kind === 'ideas';
  const isThoughts = kind === 'thoughts';
  const isArea = kind === 'area';
  const isPage = kind === 'page';
  // area/page čvorovi su stranice — tap ih otvara u punom native ekranu stranice
  // (bogatije od bottom sheet-a), zato node:open ovde navigira umesto da otvara detalj.
  const isPageKind = isArea || isPage;

  const openPage = useCallback(
    (pageId: string) => {
      router.push({ pathname: '/stranica/[id]', params: { id: pageId } });
    },
    [router],
  );

  // „Nova podstranica" na kanvasu stranice traži areaId roditelja — URL nosi samo
  // pageId, pa se dohvata iz dokumenta stranice (isti upit koji ekran stranice koristi).
  const parentPage = useQuery(
    api.pages.get,
    isPage ? { pageId: id as Id<'pages'> } : 'skip',
  );

  // URL je stabilan: token više ne ulazi u njega (išao bi u logove), a tema je samo
  // za prvi paint — dalje promene idu kroz most, pa se WebView ne reloaduje (§5.2).
  const [initialScheme] = useState(scheme);
  const url = useMemo(
    () => embedCanvasUrl({ kind, id, theme: initialScheme }),
    [kind, id, initialScheme],
  );

  // Zamrzni PRVI ne-null token (mutacija ref-a u renderu je sankcionisan React obrazac
  // za lazy-init: idempotentno, StrictMode-safe). Injektovani prop se pravi iz OVOGA, ne
  // iz živog `token`-a: refresh menja `token` (i može trenutno da blesne na null), a
  // injektovani prop MORA da ostane stabilan — svaka promena reference reloaduje WebView.
  const initialTokenRef = useRef<string | null>(null);
  if (initialTokenRef.current === null && token) initialTokenRef.current = token;
  const initialToken = initialTokenRef.current;

  // MORA da bude memoizovan. `react-native-webview` na svaku promenu reference `source`
  // ponovo učitava stranicu. Inline `source={{ uri: url }}` pravi nov objekat na svaki
  // render, a `onLoadEnd` menja `loading` state → render → nov `source` → reload →
  // beskonačna petlja učitavanja (handshake nikad ne stigne do kraja). Ne vraćaj na inline.
  const source = useMemo(() => (url ? { uri: url } : undefined), [url]);

  // Token ide u embed kroz injekciju PRE učitavanja stranice (`window.__DEVOTION_AUTH__`),
  // ne kroz `postMessage` — nema trke sa startom mosta. `JSON.stringify` bezbedno kotira
  // vrednost; `; true;` na kraju da WKWebView ne loguje upozorenje o povratnoj vrednosti.
  // Isto memoizovano i iz ZAMRZNUTIH vrednosti kao `source`: promena reference bi
  // reloadovala WebView. `injectedJavaScriptBeforeContentLoaded` se izvršava SAMO pri
  // učitavanju — zato WebView ne sme da montira dok je ovo `undefined` (guard niže).
  const injectedAuth = useMemo(
    () =>
      initialToken
        ? `window.__DEVOTION_AUTH__ = ${JSON.stringify({ token: initialToken, theme: initialScheme })}; true;`
        : undefined,
    [initialToken, initialScheme],
  );
  // Isti razlog za `style`: inline objekat bi bio nova referenca na svaki render.
  const webViewStyle = useMemo(
    () => ({ backgroundColor: colors.background }),
    [colors.background],
  );

  const postToWeb = useCallback((message: Record<string, unknown>) => {
    if (__DEV__) console.log('[canvas] → poslato:', message.type);
    webRef.current?.postMessage(JSON.stringify(message));
  }, []);

  // Autoritativni kanal za ŽIVU promenu teme: inicijalna tema stiže kroz injekciju, a
  // svaka kasnija promena šeme ide kroz most (root ThemeProvider u embed-u inače pobedi).
  useEffect(() => {
    postToWeb({ type: 'theme', mode: scheme });
  }, [scheme, postToWeb]);

  // Osvežavanje tokena je NEKRITIČAN put: inicijalni token je već ušao kroz injekciju
  // pre učitavanja. Na promenu tokena best-effort pošalji `auth` kroz most (bez intervala,
  // bez ack-a) — embed re-autentikuje u mestu bez reload-a. Ako poruka promaši (most još
  // nije spreman), embed i dalje radi sa injektovanim tokenom; sledeći refresh stiže.
  useEffect(() => {
    if (token) postToWeb({ type: 'auth', token });
  }, [token, postToWeb]);

  // Zaštita od zaglavljenog WebView-a (mreža koja nikad ne javi ni load ni error):
  // posle 20s ponudi „pokušaj ponovo" umesto večnog spinera.
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setFailed('Isteklo vreme učitavanja kanvasa.'), 20000);
    return () => clearTimeout(timer);
  }, [loading]);

  // Uređivanje za sada postoji samo na kanvasu oblasti i stranice (kartice = stranice,
  // upis je `areasV2.movePages`). Ideje i misli dobijaju isti režim u K5.
  const supportsEdit = isPageKind;

  /**
   * Ulazak u biranje cilja veze. Sheet se zatvara (traka i sheet ne smeju da stoje
   * jedno preko drugog), a embed dobija id izvora kroz most — od tog trenutka se u
   * WebView-u ništa ne povlači, izvor nosi pun prsten, a tap na drugu karticu pravi
   * vezu. Vlasnik stanja je native: embed sam iz biranja NIKAD ne izlazi.
   */
  const startConnect = useCallback(
    (page: PageNodeTarget) => {
      setNodeTarget(null);
      setConnectSource({ _id: page._id, title: page.title || 'Stranica bez naslova' });
      postToWeb({ type: 'connect', sourceId: page._id });
      haptics.tap();
      AccessibilityInfo.announceForAccessibility(
        'Izaberi karticu za vezu. Tapni karticu sa kojom se povezuje.',
      );
    },
    [postToWeb],
  );

  const cancelConnect = useCallback(() => {
    if (connectSource === null) return;
    setConnectSource(null);
    postToWeb({ type: 'connect', sourceId: null });
    AccessibilityInfo.announceForAccessibility('Povezivanje je otkazano.');
  }, [connectSource, postToWeb]);

  const toggleEdit = useCallback(() => {
    const next = !editMode;
    setEditMode(next);
    // Izlazak iz režima (i ulazak u njega) uvek gasi biranje: „Gotovo" mora da bude
    // izlaz iz SVAKOG podstanja režima, ne samo iz povlačenja.
    cancelConnect();
    // Poruka ide istim kanalom kao `theme`/`fit`/`zoom` — bez ijednog novog objektnog
    // propa na `<WebView>`, jer bi svaka promena reference reloadovala stranicu (Z1).
    postToWeb({ type: 'mode', value: next ? 'edit' : 'view' });
    haptics.select();
    AccessibilityInfo.announceForAccessibility(
      next
        ? 'Režim uređivanja rasporeda je uključen. Prevuci karticu da je pomeriš.'
        : 'Uređivanje rasporeda je završeno.',
    );
  }, [editMode, postToWeb, cancelConnect]);

  // Kamera se piše iz native-a (ne iz embeda): prigušuje se, nema optimističko stanje,
  // i native je već vlasnik dugmadi koja kameru pomeraju. Scope stiže uz poruku.
  const saveViewport = useMutation(api.areasV2.saveViewport);
  const pendingViewportRef = useRef<PendingViewport | null>(null);
  const viewportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushViewport = useCallback(() => {
    const pending = pendingViewportRef.current;
    pendingViewportRef.current = null;
    if (!pending) return;
    // Tiho: pamćenje pogleda je udobnost, ne radnja korisnika — greška ovde ne sme da
    // prekine rad Alert-om.
    void saveViewport(pending).catch((error: unknown) => {
      if (__DEV__) console.log('[canvas] saveViewport nije uspeo:', error);
    });
  }, [saveViewport]);

  // Poslednji pan pre izlaska sa ekrana se ne sme izgubiti: cleanup flush-uje ono što
  // je ostalo u redu, pa tek onda gasi tajmer.
  useEffect(() => {
    return () => {
      if (viewportTimerRef.current) clearTimeout(viewportTimerRef.current);
      viewportTimerRef.current = null;
      flushViewport();
    };
  }, [flushViewport]);

  /**
   * Osvežavanje veličine u LOKALNIM kopijama detalja čvora (rail i otvoren sheet).
   * Bez ovoga bi sheet posle povlačenja ručke računao ±10% iz zastarele veličine —
   * detalj stiže uz `selection` poruku i embed ga ne šalje ponovo sam od sebe.
   */
  const applyNodeSize = useCallback((pageId: string, width: number, height: number) => {
    // Tip parametra je eksplicitan: stanje je `unknown`, pa `SetStateAction<unknown>`
    // proguta i oblik updater-a i TS ga sam ne izvede.
    setSelectedNode((current: unknown) => {
      const node = current as PageNodeTarget | null;
      if (!node || node._id !== pageId) return current;
      return { ...node, width, height };
    });
    setNodeTarget((current) =>
      current && current._id === pageId ? { ...current, width, height } : current,
    );
  }, []);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let msg: {
        type?: string;
        nodeId?: string;
        node?: unknown;
        ids?: string[];
        startupId?: string;
        areaId?: string;
        rootPageId?: string | null;
        pageId?: string;
        count?: number;
        before?: Array<{ pageId: string; x: number; y: number }>;
        /** `resized`: stanje kartice PRE poteza (ime je drugo od `before` jer je i oblik drugi). */
        previous?: { x: number; y: number; width: number; height: number };
        width?: number;
        height?: number;
        x?: number;
        y?: number;
        zoom?: number;
        message?: string;
        /** `toast`: `error` prekida i traži pažnju; `info` je objašnjenje i ne prekida tok. */
        level?: string;
        /** `connected`: id upravo napravljene veze (za „Poništi"). */
        edgeId?: string;
      };
      try {
        msg = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      if (__DEV__) {
        console.log('[canvas] ← primljeno:', msg.type);
      }
      if (msg.type === 'node:open' && msg.node) {
        // Dodir je bio unutar WebView-a, pa native mora sam da potvrdi da je stigao
        // — inače otvaranje detalja deluje kao da se desilo samo od sebe.
        haptics.tap();
        // Detalj stiže uz poruku — otvori sheet po vrsti, bez čekanja/upita.
        if (isIdeas) setOpenIdea(msg.node as IdeaDetail);
        else if (isThoughts) setOpenThought(msg.node as ThoughtDetail);
        else if (isPageKind) {
          // area/page čvor je stranica → otvori njen pun native ekran.
          const pageNode = msg.node as { _id?: string };
          if (pageNode._id) openPage(pageNode._id);
        }
      } else if (msg.type === 'node:actions' && msg.node) {
        // Dugi pritisak na karticu u režimu → native sheet „Akcije kartice" (veze
        // K3 + veličina K2). Ideje i misli ovu poruku ne šalju.
        haptics.tap();
        if (isPageKind) setNodeTarget(msg.node as PageNodeTarget);
      } else if (msg.type === 'connected' && msg.startupId && msg.areaId && msg.edgeId) {
        // Upis je prošao; linija se u WebView-u pojavila sama (isti Convex klijent).
        // Native ovde samo zatvara biranje i nudi put nazad.
        haptics.success();
        setConnectSource(null);
        postToWeb({ type: 'connect', sourceId: null });
        pushUndo({
          label: 'Kartice su povezane.',
          action: {
            kind: 'pageEdgeConnect',
            startupId: msg.startupId as Id<'startups'>,
            areaId: msg.areaId as Id<'startupAreas'>,
            rootPageId: (msg.rootPageId ?? null) as Id<'pages'> | null,
            edgeId: msg.edgeId as Id<'pageCanvasEdgesV2'>,
          },
        });
        AccessibilityInfo.announceForAccessibility('Kartice su povezane.');
      } else if (msg.type === 'selection') {
        const ids = msg.ids ?? [];
        setSelectedNodeIds(ids);
        setSelectedNode(ids.length === 1 ? msg.node ?? null : null);
      } else if (
        msg.type === 'resized' &&
        msg.startupId &&
        msg.areaId &&
        msg.pageId &&
        msg.previous &&
        typeof msg.width === 'number' &&
        typeof msg.height === 'number'
      ) {
        // Upis je već prošao (embed piše optimistički i sam vraća na grešku). `previous`
        // je iz memorije, ne iz baze — baza u ovom trenutku već drži NOVE dimenzije.
        haptics.success();
        applyNodeSize(msg.pageId, msg.width, msg.height);
        pushUndo({
          label: `Veličina kartice: ${msg.width} × ${msg.height}.`,
          action: {
            kind: 'pageResize',
            startupId: msg.startupId as Id<'startups'>,
            areaId: msg.areaId as Id<'startupAreas'>,
            rootPageId: (msg.rootPageId ?? null) as Id<'pages'> | null,
            pageId: msg.pageId as Id<'pages'>,
            width: msg.previous.width,
            height: msg.previous.height,
            // Ugaona ručka pomera i rub kartice, pa se vraća i pozicija.
            x: msg.previous.x,
            y: msg.previous.y,
          },
        });
      } else if (msg.type === 'moved' && msg.startupId && msg.areaId && msg.before) {
        // Upis je već prošao (embed piše optimistički i sam vraća na grešku); ovde je
        // samo potvrda prstu i put nazad. Koordinate su iz memorije, ne iz baze —
        // baza u ovom trenutku već drži NOVE.
        haptics.success();
        pushUndo({
          label: movedLabel(msg.count ?? msg.before.length),
          action: {
            kind: 'pageMove',
            startupId: msg.startupId as Id<'startups'>,
            areaId: msg.areaId as Id<'startupAreas'>,
            rootPageId: (msg.rootPageId ?? null) as Id<'pages'> | null,
            updates: msg.before.map((move) => ({
              pageId: move.pageId as Id<'pages'>,
              x: move.x,
              y: move.y,
            })),
          },
        });
      } else if (
        msg.type === 'viewport' &&
        msg.startupId &&
        msg.areaId &&
        typeof msg.x === 'number' &&
        typeof msg.y === 'number' &&
        typeof msg.zoom === 'number'
      ) {
        pendingViewportRef.current = {
          startupId: msg.startupId as Id<'startups'>,
          areaId: msg.areaId as Id<'startupAreas'>,
          rootPageId: (msg.rootPageId ?? null) as Id<'pages'> | null,
          x: msg.x,
          y: msg.y,
          zoom: msg.zoom,
        };
        if (viewportTimerRef.current) clearTimeout(viewportTimerRef.current);
        viewportTimerRef.current = setTimeout(flushViewport, VIEWPORT_DEBOUNCE_MS);
      } else if (msg.type === 'toast' && msg.message) {
        // Embed nema toast površinu; serverska poruka („Možete pomerati samo svoje
        // kartice.") mora da se vidi, inače kartica samo neobjašnjivo skoči nazad.
        // `info` je objašnjenje, ne kvar („Ove kartice su već povezane.") — tiša
        // haptika, drugi naslov, i biranje OSTAJE upaljeno.
        if (msg.level === 'info') {
          haptics.warning();
          Alert.alert('Obaveštenje', msg.message);
        } else {
          haptics.error();
          Alert.alert('Greška', msg.message);
        }
      }
    },
    [isIdeas, isThoughts, isPageKind, openPage, flushViewport, applyNodeSize, postToWeb],
  );

  const reload = () => {
    setFailed(null);
    setLoading(true);
    webRef.current?.reload();
  };

  // Izabran baš jedan čvor → „Otvori …" (otvara detalj tog čvora); inače „Novo …".
  // area/page dobijaju svoju primarnu akciju u Slice 2/3.
  const hasSingleSelection = selectedNode !== null && selectedNodeIds.length === 1;
  const openIcon = <Maximize2 size={18} color={colors.primaryForeground} />;
  const newIcon = <Plus size={18} color={colors.primaryForeground} />;
  let primaryAction: RailAction | undefined;
  if (isIdeas) {
    primaryAction = hasSingleSelection
      ? { label: 'Otvori ideju', icon: openIcon, onPress: () => setOpenIdea(selectedNode as IdeaDetail) }
      : { label: 'Nova ideja', icon: newIcon, onPress: () => setCreateOpen(true) };
  } else if (isThoughts) {
    // Trosmerno: jedan čvor → otvori; više čvorova → „U Ideje (N)" (jedina bulk
    // akcija koju read-only embed dozvoljava — selekcija stiže kroz most); inače novo.
    primaryAction = hasSingleSelection
      ? { label: 'Otvori misao', icon: openIcon, onPress: () => setOpenThought(selectedNode as ThoughtDetail) }
      : selectedNodeIds.length > 1
        ? {
            label: `U Ideje (${selectedNodeIds.length})`,
            icon: <Send size={18} color={colors.primaryForeground} />,
            onPress: () => {
              if (selectedNodeIds.length > MAX_BULK) {
                haptics.warning();
                Alert.alert('Previše misli', `Odaberi najviše ${MAX_BULK} misli za slanje u Ideje.`);
                return;
              }
              // Id-jevi iz embeda SU `thoughtNodes` id-jevi (flow node id = doc._id).
              setConversionIds(selectedNodeIds as Id<'thoughtNodes'>[]);
            },
          }
        : { label: 'Nova misao', icon: newIcon, onPress: () => setCreateOpen(true) };
  } else if (isArea && activeStartupId) {
    // Tap čvora već otvara stranicu (node:open), pa je primarna akcija samo kreiranje.
    primaryAction = { label: 'Nova stranica', icon: newIcon, onPress: () => setCreateOpen(true) };
  } else if (isPage && activeStartupId && parentPage) {
    primaryAction = { label: 'Nova podstranica', icon: newIcon, onPress: () => setCreateOpen(true) };
  } else {
    primaryAction = undefined;
  }

  // Kartica izabrana u režimu → četvrta ikonica rail-a otvara „Akcije kartice".
  // Ovo je put koji NE zavisi ni od dugog pritiska (nepouzdan na iOS-u) ni od praga
  // zuma (ispod 0.5 se ručke ne crtaju) — i jedini put za čitač ekrana. U biranju
  // cilja se sklanja: tada je jedini posao tap na drugu karticu.
  const selectedPage =
    isPageKind && hasSingleSelection ? (selectedNode as PageNodeTarget) : null;
  const nodeAction: RailAction | undefined =
    editMode && selectedPage && !connectSource
      ? {
          label: 'Akcije kartice',
          icon: <Ellipsis size={20} color={colors.foreground} />,
          onPress: () => setNodeTarget(selectedPage),
        }
      : undefined;

  if (!KINDS.includes(kind)) {
    return <Fallback title="Nepoznat canvas" message={`Vrsta „${kind}" ne postoji.`} colors={colors} onBack={() => router.back()} />;
  }
  // Gejt na ZAMRZNUTI token, ne na živi `token`: WebView sme da montira tek kad
  // `injectedAuth` ima pravi token (injekcija se izvršava samo pri učitavanju — bez tokena
  // se stranica ne bi oporavila). Živi `token` koji blesne na null tokom refresh-a ovako
  // ne unmount-uje/reloaduje WebView.
  if (!initialToken) {
    return <Fallback title="Potrebna prijava" message="Sesija nije aktivna." colors={colors} onBack={() => router.back()} />;
  }
  if (!webBase || !url) {
    return (
      <Fallback
        title="Canvas nije dostupan"
        message="EXPO_PUBLIC_WEB_URL nije podešen — dodaj web adresu u .env.local (vidi .env.example)."
        colors={colors}
        onBack={() => router.back()}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        title={canvasKindLabel(kind)}
        onBack={() => router.back()}
        colors={colors}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={landscape ? 'Vrati u uspravan prikaz' : 'Rotiraj u položeni prikaz'}
            accessibilityState={{ selected: landscape }}
            onPress={() => {
              haptics.select();
              void toggleOrientation();
            }}
            style={({ pressed }) => [styles.back, pressed && { backgroundColor: colors.muted }]}>
            {landscape ? (
              <Minimize2 size={22} color={colors.foreground} />
            ) : (
              <Maximize2 size={22} color={colors.foreground} />
            )}
          </Pressable>
        }
      />

      <View style={styles.webWrap}>
        <WebView
          ref={webRef}
          source={source}
          // Token je u web kontekstu pre nego što se stranica učita (§5.2). MORA da bude
          // memoizovan iz istog razloga kao `source` — promena reference reloaduje WebView.
          injectedJavaScriptBeforeContentLoaded={injectedAuth}
          originWhitelist={ORIGIN_WHITELIST}
          javaScriptEnabled
          domStorageEnabled
          onMessage={onMessage}
          onLoadEnd={() => {
            setLoading(false);
            // Best-effort one-shot: čim je stranica učitana, embed-ov `message` listener je
            // sigurno zakačen, pa mu pošalji najsvežiji token (zatvara uzak prozor ako se
            // token osvežio tokom učitavanja). Injekcija je već isporučila inicijalni token,
            // pa ovo nije kritično; običan `postMessage` — ne dira `source`/`injectedAuth`,
            // ne može da reloaduje. `!failed` guard sprečava lažni log kad učitavanje padne.
            if (token && !failed) postToWeb({ type: 'auth', token });
            // Sveže učitan embed uvek starta u gledanju (state mu je lokalan), pa mu se
            // upaljen režim mora ponovo javiti — inače posle „Pokušaj ponovo" native
            // pokazuje „Gotovo", a kartice se ne pomeraju.
            if (editMode && !failed) postToWeb({ type: 'mode', value: 'edit' });
            // Biranje cilja se, za razliku od režima, NE obnavlja: sveže učitan embed
            // ne zna izvor, pa bi traka „Izaberi karticu za vezu" tražila tap koji ne
            // bi ništa uradio. Dangling izvor posle „Pokušaj ponovo" je laž.
            cancelConnect();
          }}
          onError={(e) => setFailed(e.nativeEvent.description || 'Učitavanje nije uspelo.')}
          onHttpError={(e) => setFailed(`Greška ${e.nativeEvent.statusCode}.`)}
          // Ostani na našem web origin-u — embed ne sme da odluta na drugi sajt.
          onShouldStartLoadWithRequest={(request) =>
            request.url.startsWith(webBase) || request.url === url || request.url.startsWith('about:')
          }
          style={webViewStyle}
        />

        {loading && !failed ? (
          <View style={[styles.overlay, { backgroundColor: colors.background }]}>
            <ActivityIndicator color={colors.primary} accessibilityLabel="Učitavanje kanvasa" />
          </View>
        ) : null}

        {failed ? (
          <View style={[styles.overlay, { backgroundColor: colors.background }]}>
            <EmptyState
              icon={<TriangleAlert size={40} color={colors.destructive} />}
              title="Canvas se ne može učitati"
              description={failed}
              actionLabel="Pokušaj ponovo"
              onAction={reload}
            />
          </View>
        ) : null}

        {/* Traka za biranje cilja stoji PREKO vrha platna — jedina poruka koja u tom
            trenutku važi, sa izlazom nadohvat prsta. */}
        {connectSource ? (
          <ConnectBar sourceTitle={connectSource.title} onCancel={cancelConnect} />
        ) : null}
      </View>

      <CanvasRail
        onZoomIn={() => postToWeb({ type: 'zoom', direction: 'in' })}
        onZoomOut={() => postToWeb({ type: 'zoom', direction: 'out' })}
        onFit={() => postToWeb({ type: 'fit' })}
        primaryAction={primaryAction}
        nodeAction={nodeAction}
        editMode={editMode}
        onToggleEdit={supportsEdit ? toggleEdit : undefined}
      />

      {/* Traka „Poništi" važi za SVE vrste kanvasa (misli, ideje…): ideja
          arhivirana sa detalja mora imati traku i kad se korisnik vrati ovamo.
          Iznad rail-a (44pt ikonice + 16 paddinga) — ne sme pod dugmad. */}
      <UndoBar bottomOffset={60} />

      {isIdeas ? (
        <>
          <IdeaCreateSheet
            open={createOpen}
            startupId={id as Id<'startups'>}
            onClose={() => setCreateOpen(false)}
          />
          <IdeaNodeSheet
            idea={openIdea}
            startupId={id as Id<'startups'>}
            onClose={() => {
              // Na zatvaranje detalja centriraj taj čvor u grafu (§5.2, `focus`).
              if (openIdea) postToWeb({ type: 'focus', nodeId: openIdea._id });
              setOpenIdea(null);
            }}
          />
        </>
      ) : null}

      {isThoughts ? (
        <>
          <ThoughtCreateSheet
            open={createOpen}
            startupId={id as Id<'startups'>}
            onClose={() => setCreateOpen(false)}
          />
          <ThoughtNodeSheet
            thought={openThought}
            onClose={() => {
              // Na zatvaranje detalja centriraj taj čvor u grafu (§5.2, `focus`).
              if (openThought) postToWeb({ type: 'focus', nodeId: openThought._id });
              setOpenThought(null);
            }}
            onOpenDetail={(nodeId) => {
              setOpenThought(null);
              router.push({ pathname: '/misao/[id]', params: { id: nodeId } });
            }}
          />
          <ThoughtConversionSheet
            open={conversionIds !== null}
            startupId={id as Id<'startups'>}
            nodes={(conversionIds ?? []).map((nodeId) => ({ _id: nodeId }))}
            onClose={() => setConversionIds(null)}
            // Originali se pri konverziji NE arhiviraju, pa bi selekcija ostala i
            // dalje nudila „U Ideje (N)" — slučajan drugi tap pravi duplikate.
            // (Vizuelna selekcija u WebView-u ostaje — most nema poruku za brisanje
            // selekcije; rail se ipak vraća na „Nova misao".)
            onConverted={() => {
              setSelectedNodeIds([]);
              setSelectedNode(null);
            }}
          />
        </>
      ) : null}

      {isArea && activeStartupId ? (
        <PageCreateSheet
          open={createOpen}
          startupId={activeStartupId}
          areaId={id as Id<'startupAreas'>}
          parentPageId={null}
          onClose={() => setCreateOpen(false)}
        />
      ) : null}

      {isPage && activeStartupId && parentPage ? (
        <PageCreateSheet
          open={createOpen}
          startupId={activeStartupId}
          areaId={parentPage.areaId}
          parentPageId={id as Id<'pages'>}
          onClose={() => setCreateOpen(false)}
        />
      ) : null}

      {/* Akcije kartice: veze (K3) + veličina (K2) — samo kanvas oblasti/stranice
          ima kartice stranica. */}
      {isPageKind ? (
        <PageNodeSheet
          page={nodeTarget}
          onClose={() => setNodeTarget(null)}
          onStartConnect={startConnect}
          onApplied={(width, height) => {
            if (nodeTarget) applyNodeSize(nodeTarget._id, width, height);
          }}
        />
      ) : null}
    </View>
  );
}

function Header({
  title,
  onBack,
  colors,
  right,
}: {
  title: string;
  onBack: () => void;
  colors: ColorTokens;
  right?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: insets.top + 6,
          // Bočni insetovi: canvas ekran može da rotira u landscape, gde bezbedna
          // zona ide levo/desno — „Nazad" i naslov ne smeju pod zarez.
          paddingLeft: insets.left + 6,
          paddingRight: insets.right + 6,
          backgroundColor: colors.background,
          borderBottomColor: colors.border,
        },
      ]}>
      {/* Kanvas je JEDINI ekran bez swipe-back gesta (WebView uzima horizontalni
          pan — §9.3), pa je ovo dugme jedini put nazad. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Nazad"
        onPress={() => {
          haptics.tap();
          onBack();
        }}
        style={({ pressed }) => [styles.back, pressed && { backgroundColor: colors.muted }]}>
        <ChevronLeft size={24} color={colors.foreground} />
      </Pressable>
      <Text numberOfLines={1} style={[styles.headerTitle, { color: colors.foreground }]}>
        {title}
      </Text>
      {right ?? null}
    </View>
  );
}

function Fallback({
  title,
  message,
  colors,
  onBack,
}: {
  title: string;
  message: string;
  colors: ColorTokens;
  onBack: () => void;
}) {
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title="Canvas" onBack={onBack} colors={colors} />
      <EmptyState
        icon={<TriangleAlert size={40} color={colors.mutedForeground} />}
        title={title}
        description={message}
      />
    </View>
  );
}

/**
 * Expo-router error boundary za canvas rutu (kao u `ideje.tsx`) — hvata greške u
 * renderu ekrana i nudi „Pokušaj ponovo" umesto pada cele navigacije.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <CanvasError message={error.message} onRetry={retry} />;
}

function CanvasError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title="Canvas" onBack={() => router.back()} colors={colors} />
      <EmptyState
        icon={<TriangleAlert size={40} color={colors.destructive} />}
        title="Canvas se ne može učitati"
        description={message || 'Došlo je do greške pri učitavanju kanvasa.'}
        actionLabel="Pokušaj ponovo"
        onAction={onRetry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    // Bočni padding dolazi inline sa safe-area insetovima (landscape).
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
  },
  // NAMERNO `title`, ne `display`: canvas ekran rotira u landscape i WebView mu je
  // ceo sadržaj — krupno zaglavlje bi mu pojelo vidno polje. Zato i nije
  // `ScreenHeader` (koji ne zna za bočne insete u položenom prikazu).
  headerTitle: {
    flex: 1,
    ...text.title,
    marginRight: 8,
  },
  webWrap: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
