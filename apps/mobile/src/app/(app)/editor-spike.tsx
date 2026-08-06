import {
  RichText,
  useBridgeState,
  useEditorBridge,
} from '@10play/tentap-editor';
import { useRouter } from 'expo-router';
import {
  Bold,
  ChevronLeft,
  Italic,
  List,
  ListOrdered,
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, type ColorTokens } from '@/theme/tokens';

/**
 * MERNI PROTOTIP editora (Faza 3, §5.1) — NIJE finalni ekran. Postoji samo da se
 * na PRAVOM telefonu izmeri cena `@10play/tentap-editor` (Tiptap u WebView-u) PRE
 * ulaganja u pun editor sa tabelama i custom node-ovima:
 *
 *   • cold mount → editor-ready  (prag < 1.5s, warm < 500ms)
 *   • keystroke → glyph          (prag: neprimetno, ~50ms — meri se 240fps kamerom)
 *
 * Namerno je STOCK tentap (`TenTapStartKit`): samo bold/italic/liste, bez custom
 * bundla, bez Convexa, bez autosave-a. Sadržaj je lokalni string. Ovo je best-case
 * (donja granica) — pun editor dodaje JS težinu pa će start biti nešto sporiji.
 *
 * Briše se (zajedno sa ulazom u „Više" tabu i rutom u `_layout.tsx`) čim odluka
 * padne. Plan i merni recept: docs/mobile + plan fajl.
 */

const INITIAL_CONTENT =
  '<h2>Merni prototip</h2><p>Kucaj ovde da izmeriš latenciju. Snimi ekran 240fps kamerom drugog telefona i izbroj frejmove od dodira do slova.</p><ul><li>Cold: ubij aplikaciju iz pozadine pa uđi ponovo.</li><li>Warm: vrati se nazad pa ponovo otvori ovaj ekran.</li></ul>';

function formatMs(value: number | null): string {
  return value === null ? '—' : `${value} ms`;
}

export default function EditorSpikeScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // t0 na mount ekrana; sve delte se mere u odnosu na ovaj trenutak. Remount
  // (nazad → ponovo, ili cold start) resetuje merenje — to je namerno.
  const mountAtRef = useRef<number>(Date.now());
  const [domLoadedMs, setDomLoadedMs] = useState<number | null>(null);
  const [readyMs, setReadyMs] = useState<number | null>(null);
  const [keystrokes, setKeystrokes] = useState(0);

  const editor = useEditorBridge({
    autofocus: false,
    // WebView sadržaj se skroluje iznad tastature na iOS-u; toolbar diže KeyboardAvoidingView.
    avoidIosKeyboard: true,
    initialContent: INITIAL_CONTENT,
    onChange: () => setKeystrokes((count) => count + 1),
  });
  const editorState = useBridgeState(editor);

  // „editor-ready" = prvi put kad `isReady` iz core bridge-a postane true.
  useEffect(() => {
    if (editorState.isReady && readyMs === null) {
      setReadyMs(Date.now() - mountAtRef.current);
    }
  }, [editorState.isReady, readyMs]);

  const readyWithinBudget = readyMs !== null && readyMs < 1500;

  const toolbarActions = [
    { key: 'bold', label: 'Podebljano', Icon: Bold, active: editorState.isBoldActive, onPress: () => editor.toggleBold() },
    { key: 'italic', label: 'Kurziv', Icon: Italic, active: editorState.isItalicActive, onPress: () => editor.toggleItalic() },
    { key: 'bullet', label: 'Lista', Icon: List, active: editorState.isBulletListActive, onPress: () => editor.toggleBulletList() },
    { key: 'ordered', label: 'Numerisana lista', Icon: ListOrdered, active: editorState.isOrderedListActive, onPress: () => editor.toggleOrderedList() },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Editor spike — merenje</Text>
      </View>

      {/* Merni panel — čita se direktno na uređaju */}
      <View style={[styles.stats, { borderBottomColor: colors.border }]}>
        <Stat label="DOM load" value={formatMs(domLoadedMs)} colors={colors} />
        <Stat
          label="Editor ready"
          value={formatMs(readyMs)}
          colors={colors}
          tone={readyMs === null ? 'muted' : readyWithinBudget ? 'success' : 'destructive'}
        />
        <Stat label="Kucanja" value={String(keystrokes)} colors={colors} />
        <Stat label="isReady" value={editorState.isReady ? 'da' : 'ne'} colors={colors} />
      </View>

      {/* Editor + toolbar iznad tastature.
          iOS: behavior="padding". Android: default (undefined) — oslanja se na resize
          windowing. Ako toolbar bude prekriven na jeftinom Androidu, to je merni podatak
          → tada se u app.json dodaje `android.softwareKeyboardLayoutMode`. */}
      <KeyboardAvoidingView
        style={styles.editorArea}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <RichText
          editor={editor}
          style={[styles.rich, { backgroundColor: colors.background }]}
          // DOM učitan (WebView) — proxy za „cold mount → prazan editor na ekranu".
          onLoadEnd={() => {
            setDomLoadedMs((current) =>
              current === null ? Date.now() - mountAtRef.current : current,
            );
          }}
        />
        <View
          style={[
            styles.toolbar,
            {
              backgroundColor: colors.card,
              borderTopColor: colors.border,
              paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
            },
          ]}>
          {toolbarActions.map(({ key, label, Icon, active, onPress }) => (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected: active }}
              onPress={onPress}
              style={({ pressed }) => [
                styles.toolbarButton,
                active && { backgroundColor: colors.accent },
                pressed && { backgroundColor: colors.muted },
              ]}>
              <Icon size={20} color={active ? colors.primary : colors.foreground} />
            </Pressable>
          ))}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function Stat({
  label,
  value,
  colors,
  tone = 'default',
}: {
  label: string;
  value: string;
  colors: ColorTokens;
  tone?: 'default' | 'muted' | 'success' | 'destructive';
}) {
  const valueColor =
    tone === 'success'
      ? colors.success
      : tone === 'destructive'
        ? colors.destructive
        : tone === 'muted'
          ? colors.mutedForeground
          : colors.foreground;
  return (
    <View style={styles.stat}>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.statValue, { color: valueColor }]}>{value}</Text>
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
  stats: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stat: {
    flex: 1,
    gap: 2,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statValue: {
    fontSize: 15,
    fontWeight: fontWeight.bold,
    fontVariant: ['tabular-nums'],
  },
  editorArea: {
    flex: 1,
  },
  rich: {
    flex: 1,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  toolbarButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
});
