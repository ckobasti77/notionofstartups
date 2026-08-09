import * as WebBrowser from 'expo-web-browser';
import { FileText } from 'lucide-react-native';
import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { EmptyState } from '@/components/empty-state';
import { isEmptyNoteHtml, noteReaderDocument } from '@/lib/note-content';
import { useAppTheme, useThemeColors } from '@/theme/theme-provider';

// Konstantni WebView propovi — van komponente da ne budu nova referenca na svaki
// render (promena reference reloaduje stranicu; docs/mobile/ZA-POPRAVKU.md Z1).
const ORIGIN_WHITELIST = ['*'];

/**
 * Beleška u režimu čitanja. Renderuje **isti HTML** koji je snimljen u bazi, pa
 * prikazuje i ono što mobilni editor ne ume da uređuje (tabele, prilozi, blokovi
 * koda) — zato je ovo, a ne editor u read-only režimu, tačan prikaz tuđe beleške.
 *
 * `javaScriptEnabled={false}`: dokument je tuđi sadržaj i ovde mu ništa ne treba
 * da se izvršava. Linkovi se hvataju u `onShouldStartLoadWithRequest` i otvaraju
 * u sistemskom pregledaču umesto da odvedu WebView sa stranice.
 */
export function NoteReader({
  html,
  emptyDescription = 'Ova beleška još nema sadržaj.',
}: {
  html: string;
  emptyDescription?: string;
}) {
  const colors = useThemeColors();
  const { scheme } = useAppTheme();
  const insets = useSafeAreaInsets();

  const document = useMemo(
    () => noteReaderDocument({ html, colors, scheme, bottomInset: insets.bottom }),
    [html, colors, scheme, insets.bottom],
  );
  // MORA memoizovano — nova referenca `source` znači ponovno učitavanje (Z1).
  const source = useMemo(() => ({ html: document }), [document]);
  const webViewStyle = useMemo(
    () => ({ backgroundColor: colors.background }),
    [colors.background],
  );

  const handleNavigation = useCallback((request: { url: string }) => {
    // Prvi „request" je sam dokument (about:blank / data:), njega puštamo.
    if (!/^https?:/i.test(request.url)) return true;
    void WebBrowser.openBrowserAsync(request.url);
    return false;
  }, []);

  if (isEmptyNoteHtml(html)) {
    return (
      <EmptyState
        icon={<FileText size={40} color={colors.mutedForeground} />}
        title="Prazna beleška"
        description={emptyDescription}
      />
    );
  }

  return (
    <View style={styles.wrap}>
      <WebView
        source={source}
        originWhitelist={ORIGIN_WHITELIST}
        javaScriptEnabled={false}
        onShouldStartLoadWithRequest={handleNavigation}
        style={webViewStyle}
        // Bez ovoga na Androidu tekst poštuje sistemsko skaliranje dva puta.
        textZoom={100}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
});
