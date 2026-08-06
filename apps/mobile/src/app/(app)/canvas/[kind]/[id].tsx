import { useAuthToken } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, TriangleAlert } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { CanvasRail } from '@/components/canvas/canvas-rail';
import { IdeaCreateSheet } from '@/components/canvas/idea-create-sheet';
import { IdeaNodeSheet, type IdeaDetail } from '@/components/canvas/idea-node-sheet';
import { EmptyState } from '@/components/empty-state';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { canvasKindLabel, embedCanvasUrl, type CanvasKind } from '@/lib/embed-url';
import { useAppTheme, useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, type ColorTokens } from '@/theme/tokens';

const KINDS: readonly CanvasKind[] = ['thoughts', 'ideas', 'area', 'page'];
const webBase = process.env.EXPO_PUBLIC_WEB_URL;

/**
 * Mobilni canvas (M4.3, §9.3): native header + `WebView` nad embed rutom (korak 4)
 * + native akcioni rail. WebView drži pan/zoom/selekciju; native drži header,
 * rail, detalj čvora (bottom sheet) i kreiranje. Swipe-back je isključen na ovoj
 * ruti (`_layout`: `gestureEnabled:false`) da se ne bije sa horizontalnim pan-om —
 * „nazad" ide kroz dugme u headeru.
 */
export default function CanvasScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { scheme } = useAppTheme();
  const token = useAuthToken();
  const params = useLocalSearchParams<{ kind: string; id: string }>();
  const kind = params.kind as CanvasKind;
  const id = params.id;

  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedIdea, setSelectedIdea] = useState<IdeaDetail | null>(null);

  const isIdeas = kind === 'ideas';
  // Detalj čvora se razrešava native (isti `ideas.list` koji WebView crta).
  const ideasData = useQuery(
    api.ideas.list,
    isIdeas && id ? { startupId: id as Id<'startups'> } : 'skip',
  );

  const url = token ? embedCanvasUrl({ kind, id, token, theme: scheme }) : null;

  const postToWeb = useCallback((message: Record<string, unknown>) => {
    webRef.current?.postMessage(JSON.stringify(message));
  }, []);

  // Autoritativni kanal teme: pošalji je čim WebView javi `ready`, pa i na svaku
  // promenu šeme (root ThemeProvider u embed-u inače pobedi query param).
  useEffect(() => {
    postToWeb({ type: 'theme', mode: scheme });
  }, [scheme, postToWeb]);

  const openNode = useCallback(
    (nodeId: string) => {
      if (!isIdeas || !ideasData) return;
      const node = ideasData.nodes.find((n) => n._id === nodeId);
      if (!node) return;
      setSelectedIdea({
        _id: node._id,
        title: node.title,
        text: node.text,
        upvotes: node.upvotes,
        downvotes: node.downvotes,
        userVote: node.userVote,
        author: node.author,
      });
    },
    [isIdeas, ideasData],
  );

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let msg: { type?: string; nodeId?: string };
      try {
        msg = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      if (msg.type === 'ready') postToWeb({ type: 'theme', mode: scheme });
      else if (msg.type === 'node:open' && msg.nodeId) openNode(msg.nodeId);
    },
    [openNode, postToWeb, scheme],
  );

  const reload = () => {
    setFailed(null);
    setLoading(true);
    webRef.current?.reload();
  };

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
        onCreate={isIdeas ? () => setCreateOpen(true) : undefined}
        createLabel="Nova ideja"
      />

      {isIdeas ? (
        <>
          <IdeaCreateSheet
            open={createOpen}
            startupId={id as Id<'startups'>}
            onClose={() => setCreateOpen(false)}
          />
          <IdeaNodeSheet
            idea={selectedIdea}
            startupId={id as Id<'startups'>}
            onClose={() => setSelectedIdea(null)}
          />
        </>
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
