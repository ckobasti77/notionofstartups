import { useAuthToken } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter, type ErrorBoundaryProps } from 'expo-router';
import { ChevronLeft, Maximize2, Plus, TriangleAlert } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { CanvasRail, type RailAction } from '@/components/canvas/canvas-rail';
import { IdeaCreateSheet } from '@/components/canvas/idea-create-sheet';
import { IdeaNodeSheet, type IdeaDetail } from '@/components/canvas/idea-node-sheet';
import { PageCreateSheet } from '@/components/canvas/page-create-sheet';
import { ThoughtCreateSheet } from '@/components/canvas/thought-create-sheet';
import { ThoughtNodeSheet, type ThoughtDetail } from '@/components/canvas/thought-node-sheet';
import { EmptyState } from '@/components/empty-state';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { canvasKindLabel, embedCanvasUrl, type CanvasKind } from '@/lib/embed-url';
import { useAppTheme, useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, type ColorTokens } from '@/theme/tokens';

const KINDS: readonly CanvasKind[] = ['thoughts', 'ideas', 'area', 'page'];
const webBase = process.env.EXPO_PUBLIC_WEB_URL;

/**
 * Mobilni canvas (M4.3, §9.3): native header + `WebView` nad embed rutom + native
 * akcioni rail. WebView drži pan/zoom/selekciju; native drži header, rail, detalj
 * čvora (bottom sheet) i kreiranje. Swipe-back je isključen na ovoj ruti (`_layout`:
 * `gestureEnabled:false`) da se ne bije sa horizontalnim pan-om — „nazad" ide kroz
 * dugme u headeru.
 *
 * Auth ide kroz `postMessage` most, ne kroz URL: embed javi `ready`, native mu
 * pošalje token (i osvežava ga na svaku promenu `useAuthToken()`). Detalj čvora
 * stiže uz `node:open`/`selection` — nema drugog `ideas.list` upita ovde.
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
  // Selekcija na kanvasu (menja primarnu akciju rail-a). `selectedNode` je detalj
  // koji embed pošalje uz `selection` kad je izabran baš jedan čvor (oblik zavisi od vrste).
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedNode, setSelectedNode] = useState<unknown>(null);

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

  const postToWeb = useCallback((message: Record<string, unknown>) => {
    webRef.current?.postMessage(JSON.stringify(message));
  }, []);

  // Autoritativni kanal teme: pošalji je na svaku promenu šeme (root ThemeProvider u
  // embed-u inače pobedi početnu temu iz URL-a). Prva se šalje i na `ready`.
  useEffect(() => {
    postToWeb({ type: 'theme', mode: scheme });
  }, [scheme, postToWeb]);

  // Token u embed ide kroz most, ne kroz URL. Pošalji ga čim postoji i na svaki
  // refresh (`useAuthToken` vraća nov token) — embed re-autentikuje bez reload-a.
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

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let msg: { type?: string; nodeId?: string; node?: unknown; ids?: string[] };
      try {
        msg = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      if (msg.type === 'ready') {
        // Embed je montiran i čeka podešavanja: pošalji temu i token.
        postToWeb({ type: 'theme', mode: scheme });
        if (token) postToWeb({ type: 'auth', token });
      } else if (msg.type === 'node:open' && msg.node) {
        // Detalj stiže uz poruku — otvori sheet po vrsti, bez čekanja/upita.
        if (isIdeas) setOpenIdea(msg.node as IdeaDetail);
        else if (isThoughts) setOpenThought(msg.node as ThoughtDetail);
        else if (isPageKind) {
          // area/page čvor je stranica → otvori njen pun native ekran.
          const pageNode = msg.node as { _id?: string };
          if (pageNode._id) openPage(pageNode._id);
        }
      } else if (msg.type === 'selection') {
        const ids = msg.ids ?? [];
        setSelectedNodeIds(ids);
        setSelectedNode(ids.length === 1 ? msg.node ?? null : null);
      }
    },
    [postToWeb, scheme, token, isIdeas, isThoughts, isPageKind, openPage],
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
    primaryAction = hasSingleSelection
      ? { label: 'Otvori misao', icon: openIcon, onPress: () => setOpenThought(selectedNode as ThoughtDetail) }
      : { label: 'Nova misao', icon: newIcon, onPress: () => setCreateOpen(true) };
  } else if (isArea && activeStartupId) {
    // Tap čvora već otvara stranicu (node:open), pa je primarna akcija samo kreiranje.
    primaryAction = { label: 'Nova stranica', icon: newIcon, onPress: () => setCreateOpen(true) };
  } else if (isPage && activeStartupId && parentPage) {
    primaryAction = { label: 'Nova podstranica', icon: newIcon, onPress: () => setCreateOpen(true) };
  } else {
    primaryAction = undefined;
  }

  if (!KINDS.includes(kind)) {
    return <Fallback title="Nepoznat canvas" message={`Vrsta „${kind}" ne postoji.`} colors={colors} onBack={() => router.back()} />;
  }
  if (!token) {
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
      <Header title={canvasKindLabel(kind)} onBack={() => router.back()} colors={colors} />

      <View style={styles.webWrap}>
        <WebView
          ref={webRef}
          source={{ uri: url }}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          onMessage={onMessage}
          onLoadEnd={() => setLoading(false)}
          onError={(e) => setFailed(e.nativeEvent.description || 'Učitavanje nije uspelo.')}
          onHttpError={(e) => setFailed(`Greška ${e.nativeEvent.statusCode}.`)}
          // Ostani na našem web origin-u — embed ne sme da odluta na drugi sajt.
          onShouldStartLoadWithRequest={(request) =>
            request.url.startsWith(webBase) || request.url === url || request.url.startsWith('about:')
          }
          style={{ backgroundColor: colors.background }}
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
      </View>

      <CanvasRail
        onZoomIn={() => postToWeb({ type: 'zoom', direction: 'in' })}
        onZoomOut={() => postToWeb({ type: 'zoom', direction: 'out' })}
        onFit={() => postToWeb({ type: 'fit' })}
        primaryAction={primaryAction}
      />

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
    </View>
  );
}

function Header({
  title,
  onBack,
  colors,
}: {
  title: string;
  onBack: () => void;
  colors: ColorTokens;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.header,
        { paddingTop: insets.top + 6, backgroundColor: colors.background, borderBottomColor: colors.border },
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Nazad"
        onPress={onBack}
        style={({ pressed }) => [styles.back, pressed && { backgroundColor: colors.muted }]}>
        <ChevronLeft size={24} color={colors.foreground} />
      </Pressable>
      <Text numberOfLines={1} style={[styles.headerTitle, { color: colors.foreground }]}>
        {title}
      </Text>
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
    paddingHorizontal: 6,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: fontWeight.semibold,
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
