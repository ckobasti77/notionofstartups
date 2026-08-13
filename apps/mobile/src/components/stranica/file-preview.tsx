import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { Download, FileQuestion, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { Button } from '@/components/ui/button';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { escapeHtml } from '@/lib/html';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, space, text, type ColorTokens } from '@/theme/tokens';

// Konstantni WebView prop — van komponente da ne bude nov niz na svaki render.
const ORIGIN_WHITELIST = ['*'];

export type PreviewFile = {
  name: string;
  /** `null` kad blob više nije u skladištu — pregled tada kaže zašto je prazan. */
  url: string | null;
  /**
   * Vrste koje se prikazuju U APLIKACIJI. Ogledalo web `FileBody`
   * (`apps/web/components/workspace/files/file-viewer-dialog.tsx`): slika, PDF,
   * video i audio. Tabela i dokument idu u sistemski otvarač — ni web ih ne
   * renderuje (`file-viewer-dialog.tsx:97-104`).
   */
  kind: 'image' | 'pdf' | 'video' | 'audio';
};

/**
 * Telo za `WebView` sa jednim `<video>` / `<audio>` elementom.
 *
 * Zašto `source={{ html }}` a ne `source={{ uri }}`: Android WebView na golu
 * `.mp4` adresu vrlo često pokrene PREUZIMANJE fajla umesto plejera (nema
 * handler-a za `Content-Disposition`/tip), pa korisnik ne dobije kontrole. Sa
 * ugrađenim `<video controls>` odluku donosi stranica, ne WebView.
 *
 * URL i naziv idu kroz `escapeHtml` — potpisani Convex URL nosi query string i
 * jedan `"` bi izašao iz atributa.
 */
function mediaDocument({
  kind,
  url,
  name,
  colors,
}: {
  kind: 'video' | 'audio';
  url: string;
  name: string;
  colors: ColorTokens;
}): string {
  const safeUrl = escapeHtml(url);
  const safeName = escapeHtml(name);
  const background = kind === 'video' ? '#000000' : colors.background;
  /**
   * Neuspeh SAMOG medija ne stiže kroz `onError`/`onHttpError` `WebView`-a: dokument
   * je inline HTML, pa za njega nema ni navigacije ni HTTP odgovora koji bi pukao.
   * Bez ovog mosta bi 404 na potpisanom URL-u dao plejer sa kontrolama koje ništa
   * ne puštaju i nula objašnjenja. `<video>` na neuspeh učitavanja diže `error`
   * događaj na elementu, i to je ono što se ovde prosleđuje native strani.
   */
  // `if (...)` umesto `&&` da u atributu ne stoji ampersand koji bi tražio `&amp;`.
  const report = `if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage('media-error')`;
  const element =
    kind === 'video'
      ? `<video src="${safeUrl}" controls playsinline preload="metadata" aria-label="${safeName}" onerror="${report}"></video>`
      : `<audio src="${safeUrl}" controls preload="metadata" aria-label="${safeName}" onerror="${report}"></audio>`;
  return `<!DOCTYPE html>
<html lang="sr"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
<style>
  html, body {
    margin: 0; padding: 0; height: 100%;
    background: ${background};
  }
  body { display: flex; align-items: center; justify-content: center; }
  video { width: 100%; max-height: 100%; background: #000; }
  audio { width: calc(100% - 32px); }
</style>
</head><body>${element}</body></html>`;
}

/**
 * Pregled priloga preko celog ekrana. Slika kroz `expo-image`, PDF/video/audio
 * kroz `WebView`. Dugme u zaglavlju je „Preuzmi" — pandan `<a download>` sa weba
 * (`file-viewer-dialog.tsx:175`); atribut `download` je za cross-origin URL
 * (Convex storage) ionako ignorisan, pa i web samo navigira na potpisanu adresu.
 */
export function FilePreview({ file, onClose }: { file: PreviewFile | null; onClose: () => void }) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();

  /**
   * URL čiji je pregled pukao. Poređenje po URL-u, a ne `boolean` — otvaranje
   * drugog priloga (ili osvežen potpisan URL istog) time samo po sebi resetuje
   * grešku, bez efekta i bez `setState` u renderu.
   */
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  /** Lokalna kopija — narrowing propa ne preživi ulaz u `onPress` zatvaranje. */
  const url = file?.url ?? null;
  const failed = url !== null && failedUrl === url;

  // Memoizovan `source` — nova referenca reloaduje WebView (npr. na promenu teme
  // dok je pregled otvoren). Isti razlog kao na canvas ekranu; ne vraćaj na inline.
  const pdfSource = useMemo(
    () => (file !== null && file.kind === 'pdf' && file.url !== null ? { uri: file.url } : undefined),
    [file],
  );

  // Isti razlog za memoizaciju kao gore; uz to je gradnja HTML-a skuplja od
  // objekta, pa se ne ponavlja na svaki render (npr. dok korisnik pušta video).
  const mediaSource = useMemo(() => {
    if (file === null || file.url === null) return undefined;
    if (file.kind !== 'video' && file.kind !== 'audio') return undefined;
    return { html: mediaDocument({ kind: file.kind, url: file.url, name: file.name, colors }) };
  }, [file, colors]);

  function download(url: string) {
    haptics.tap();
    // Sistemski browser PRVI (obrnuto od `files-panel.tsx`, gde je cilj pregled):
    // preuzimanje je na oba sistema posao sistemskog pregledača, a in-app Custom
    // Tab ume da blokira download.
    void Linking.openURL(url).catch(() => {
      void WebBrowser.openBrowserAsync(url);
    });
  }

  return (
    // Pregled preko celog ekrana zadržava OS „slide" (nije bottom sheet); kad je
    // uključeno „smanji pokret", prikaz se prosto zameni.
    <Modal
      visible={file !== null}
      animationType={reduced ? 'none' : 'slide'}
      onRequestClose={onClose}>
      <View
        style={[
          styles.container,
          { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Zatvori pregled"
            onPress={onClose}
            style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: colors.muted }]}>
            <X size={24} color={colors.foreground} />
          </Pressable>
          <Text numberOfLines={1} style={[styles.title, { color: colors.foreground }]}>
            {file?.name ?? ''}
          </Text>
          {file !== null && url !== null ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Preuzmi ${file.name}`}
              onPress={() => download(url)}
              style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: colors.muted }]}>
              <Download size={22} color={colors.foreground} />
            </Pressable>
          ) : (
            <View style={styles.iconBtn} />
          )}
        </View>

        {file === null ? null : url === null ? (
          // Doslovno web `file-viewer-dialog.tsx:44` — blob je otišao iz skladišta.
          <PreviewNotice colors={colors} message="Fajl više nije dostupan u skladištu." />
        ) : failed ? (
          // Doslovno web `:53`. Na telefonu je čest slučaj HEVC video sa iPhone-a
          // koji Android WebView ne dekodira — izlaz je „Preuzmi" u zaglavlju.
          // „Pokušaj ponovo" postoji jer `onError` okida i prolazna mreža, a bez
          // njega je jedini izlaz zatvoriti i ponovo otvoriti ceo pregled
          // (konvencija repoa: svako greška-stanje nudi ponovni pokušaj).
          <PreviewNotice
            colors={colors}
            message="Pregled nije podržan u ovom uređaju. Preuzmi fajl da bi ga otvorio."
            onRetry={() => setFailedUrl(null)}
          />
        ) : file.kind === 'image' ? (
          <Image
            source={{ uri: url }}
            style={styles.image}
            contentFit="contain"
            transition={150}
            accessibilityLabel={file.name}
            onError={() => setFailedUrl(url)}
          />
        ) : file.kind === 'pdf' ? (
          <WebView
            source={pdfSource}
            style={styles.web}
            originWhitelist={ORIGIN_WHITELIST}
            startInLoadingState
            // Ista dva handlera kao za video: bez njih PDF koji se ne učita
            // (istekao potpisan URL, prekid mreže, WebView bez PDF renderera)
            // ostavlja belu površinu bez ijedne reči objašnjenja.
            onError={() => setFailedUrl(url)}
            onHttpError={() => setFailedUrl(url)}
          />
        ) : (
          <WebView
            source={mediaSource}
            style={[styles.web, file.kind === 'video' && styles.videoWeb]}
            originWhitelist={ORIGIN_WHITELIST}
            startInLoadingState
            // Bez ovoga iOS na `play()` otvara fullscreen native plejer preko
            // celog Modala, pa „Zatvori" ostane nedostupan.
            allowsInlineMediaPlayback
            // Element nema `autoplay`, pa ništa ne krene samo. Zastavica postoji
            // da tap na sistemske kontrole ne bude odbijen kao „bez gesta" —
            // viđeno na starijim Android WebView verzijama.
            mediaPlaybackRequiresUserAction={false}
            allowsFullscreenVideo
            onError={() => setFailedUrl(url)}
            onHttpError={() => setFailedUrl(url)}
            // Jedina poruka koju ova stranica šalje je `media-error` (vidi
            // `mediaDocument`); prop uz to mora da postoji da bi most uopšte bio
            // ubrizgan u dokument.
            onMessage={() => setFailedUrl(url)}
          />
        )}
      </View>
    </Modal>
  );
}

/**
 * Prazno/greška stanje pregleda — isti oblik za oba slučaja (web ima isti).
 * `onRetry` ide samo uz greške koje mogu da prođu na drugi pokušaj; za „blob
 * više nije u skladištu" ponovni pokušaj nema šta da promeni, pa se ne prikazuje.
 */
function PreviewNotice({
  colors,
  message,
  onRetry,
}: {
  colors: ColorTokens;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.notice}>
      <View
        style={[
          styles.noticeCard,
          { borderColor: colors.border, backgroundColor: colors.card },
        ]}>
        <FileQuestion size={32} color={colors.mutedForeground} />
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.noticeText, { color: colors.mutedForeground }]}>
          {message}
        </Text>
        {onRetry === undefined ? null : (
          <Button
            label="Pokušaj ponovo"
            variant="secondary"
            onPress={() => {
              haptics.tap();
              onRetry();
            }}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 6,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: fontWeight.semibold,
  },
  image: {
    flex: 1,
  },
  web: {
    flex: 1,
  },
  videoWeb: {
    backgroundColor: '#000000',
  },
  notice: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space[5],
  },
  noticeCard: {
    alignItems: 'center',
    gap: space[3],
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    paddingHorizontal: space[5],
    paddingVertical: space[6],
  },
  noticeText: {
    ...text.body,
    textAlign: 'center',
  },
});
