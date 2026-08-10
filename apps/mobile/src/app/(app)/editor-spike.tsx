import { useRouter } from 'expo-router';
import { ChevronLeft, TriangleAlert } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { EmptyState } from '@/components/empty-state';
import { embedNoteUrl } from '@/lib/embed-url';
import { useAppTheme, useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius } from '@/theme/tokens';

/**
 * MERNI PROTOTIP editora (Faza 3, §5.1) — NIJE finalni ekran. Hostuje PRAVI editor
 * (`RichTextEditor`) u `react-native-webview`-u preko embed rute `/embed/note/probe`,
 * da se na PRAVOM telefonu izmeri cena Tiptap-a u WebView-u PRE nego što se izgradi pun
 * editor (auth + autosave):
 *
 *   • otvori → prvi mogući unos  (prag < 1.5s; HUD u samoj stranici čita `ready`)
 *   • keystroke → glyph          (prag: neprimetno; meri se 240fps kamerom)
 *   • kašnjenje na ~2000 reči i da li tastatura prekriva kursor
 *
 * Auth NIJE potreban: probe grana embed-a (`pageId === 'probe'`) renderuje editor sa
 * lokalnim ~2000 reči, bez Convexa. Za razliku od pređašnjeg tentap prototipa, ovo meri
 * BAŠ onu arhitekturu koja se šalje (embed web editora u WebView-u).
 *
 * Briše se (zajedno sa ulazom u „Više" tabu i rutom u `_layout.tsx`) čim merni gejt
 * padne — vidi plan fajl i `docs/mobile/ZA-POPRAVKU.md`.
 */
const webBase = process.env.EXPO_PUBLIC_WEB_URL;

// Konstantni WebView prop — van komponente da ne bude nov niz na svaki render
// (isti razlog kao memoizovan `source`: promena reference reloaduje stranicu; ZA-POPRAVKU Z1).
const ORIGIN_WHITELIST = ['*'];

export default function EditorProbeScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { scheme } = useAppTheme();

  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);

  // Tema je samo za prvi paint (probe je i tako ignoriše); URL ostaje stabilan.
  const [initialScheme] = useState(scheme);
  const url = useMemo(
    () => embedNoteUrl({ pageId: 'probe', theme: initialScheme }),
    [initialScheme],
  );
  // MORA memoizovano — svaka promena reference `source` reloaduje WebView (ZA-POPRAVKU Z1).
  const source = useMemo(() => (url ? { uri: url } : undefined), [url]);
  const webViewStyle = useMemo(
    () => ({ backgroundColor: colors.background }),
    [colors.background],
  );

  // Zaštita od zaglavljenog WebView-a: posle 20s ponudi „pokušaj ponovo".
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setFailed('Isteklo vreme učitavanja.'), 20000);
    return () => clearTimeout(timer);
  }, [loading]);

  const reload = () => {
    setFailed(null);
    setLoading(true);
    webRef.current?.reload();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingBottom: insets.bottom }]}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 6, borderBottomColor: colors.border },
        ]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Nazad"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.back, pressed && { backgroundColor: colors.muted }]}>
          <ChevronLeft size={24} color={colors.foreground} />
        </Pressable>
        <Text numberOfLines={1} style={[styles.headerTitle, { color: colors.foreground }]}>
          Editor proba — merenje
        </Text>
      </View>

      <View style={styles.webWrap}>
        {!webBase || !url ? (
          <EmptyState
            icon={<TriangleAlert size={40} color={colors.mutedForeground} />}
            title="Proba nije dostupna"
            description="EXPO_PUBLIC_WEB_URL nije podešen — dodaj web adresu u .env.local (vidi .env.example)."
          />
        ) : (
          <>
            <WebView
              ref={webRef}
              source={source}
              originWhitelist={ORIGIN_WHITELIST}
              javaScriptEnabled
              domStorageEnabled
              onLoadEnd={() => setLoading(false)}
              onError={(e) => setFailed(e.nativeEvent.description || 'Učitavanje nije uspelo.')}
              onHttpError={(e) => setFailed(`Greška ${e.nativeEvent.statusCode}.`)}
              onShouldStartLoadWithRequest={(request) =>
                request.url.startsWith(webBase) ||
                request.url === url ||
                request.url.startsWith('about:')
              }
              style={webViewStyle}
            />

            {loading && !failed ? (
              <View style={[styles.overlay, { backgroundColor: colors.background }]}>
                <ActivityIndicator color={colors.primary} accessibilityLabel="Učitavanje" />
              </View>
            ) : null}

            {failed ? (
              <View style={[styles.overlay, { backgroundColor: colors.background }]}>
                <EmptyState
                  icon={<TriangleAlert size={40} color={colors.destructive} />}
                  title="Proba se ne može učitati"
                  description={failed}
                  actionLabel="Pokušaj ponovo"
                  onAction={reload}
                />
              </View>
            ) : null}
          </>
        )}
      </View>
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
    borderRadius: radius.md,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: fontWeight.semibold,
    marginRight: 8,
  },
  webWrap: { flex: 1 },
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
