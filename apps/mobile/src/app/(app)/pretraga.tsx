import { useQuery } from 'convex/react';
import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import {
  Brain,
  ChevronLeft,
  Lightbulb,
  MessageSquareText,
  Search,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { pageKindColor, pageKindMeta, type PageKind } from '@/lib/page-kinds';
import { useThemeColors } from '@/theme/theme-provider';
import { fontSize, fontWeight, MIN_TOUCH_TARGET, radius, type ColorTokens } from '@/theme/tokens';

const MIN_CHARS = 2;
const DEBOUNCE_MS = 300;

/**
 * Pretraga preko celog ekrana (spec §M3.4). Otvara se iz ikonice u `AppHeader`.
 * Pet grupa: „Stranice" i „Zadaci" iz `search.pages` (po `kind`), „Ideje" i
 * „Misli" iz `search.ideasAndThoughts`, „Poruke" iz `chat.searchMessages`.
 * Debounce na unosu, autofokus, dva prazna stanja (pre kucanja / bez rezultata).
 *
 * Navigacija je na nivou sekcije (nema deep-linka do čvora): ideja → lista
 * `/ideje`, misao → kanvas misli. Napomena: embed misli još nije povezan, pa tap
 * na misao trenutno sleti na „nije povezan" placeholder (vidi NOCNI-LOG).
 */
export default function PretragaScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeStartupId } = useActiveStartup();

  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');
  // Visina headera (sa poljem za pretragu) — offset za `KeyboardAvoidingView`,
  // pošto KAV pokriva samo telo ispod headera (isti obrazac kao `razgovor`).
  const [headerHeight, setHeaderHeight] = useState(0);
  const trimmed = text.trim();

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed]);

  const ready = debounced.length >= MIN_CHARS && activeStartupId !== null && debounced === trimmed;

  const pages = useQuery(
    api.search.pages,
    ready ? { query: debounced, startupId: activeStartupId, limit: 30 } : 'skip',
  );
  const messages = useQuery(
    api.chat.searchMessages,
    ready ? { startupId: activeStartupId, term: debounced } : 'skip',
  );
  const nodes = useQuery(
    api.search.ideasAndThoughts,
    ready ? { query: debounced, startupId: activeStartupId, limit: 30 } : 'skip',
  );

  const { tasks, otherPages } = useMemo(() => {
    const list = pages ?? [];
    return {
      tasks: list.filter((p) => p.kind === 'task'),
      otherPages: list.filter((p) => p.kind !== 'task'),
    };
  }, [pages]);
  const msgs = messages ?? [];
  const ideas = nodes?.ideas ?? [];
  const thoughts = nodes?.thoughts ?? [];

  // Dok debounce traje (`ready` još false) ili upiti stižu → spiner. Bez ovoga
  // bi se između kucanja i rezultata nakratko video „Nema rezultata".
  // (Grana se čita tek kad je `trimmed >= MIN_CHARS`, pa prazan unos ide na prompt.)
  const loading =
    !ready || pages === undefined || messages === undefined || nodes === undefined;
  const total =
    otherPages.length + tasks.length + ideas.length + thoughts.length + msgs.length;

  const openPage = (id: Id<'pages'>, kind: PageKind) => {
    if (kind === 'task') router.push({ pathname: '/zadatak/[id]', params: { id } });
    else router.push({ pathname: '/stranica/[id]', params: { id } });
  };
  const openChannel = (id: Id<'chatChannels'>) =>
    router.push({ pathname: '/razgovor/[id]', params: { id } });
  // Nema deep-linka do čvora (ruta prima startupId, ne node id): ideja vodi na
  // native listu ideja, misao na kanvas misli (embed misli je još placeholder).
  const openIdeas = () => router.push({ pathname: '/ideje' });
  const openThoughts = () => {
    if (activeStartupId === null) return;
    router.push({
      pathname: '/canvas/[kind]/[id]',
      params: { kind: 'thoughts', id: activeStartupId },
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
        style={[
          styles.header,
          { paddingTop: insets.top + 6, backgroundColor: colors.background, borderBottomColor: colors.border },
        ]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Nazad"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: colors.muted }]}>
          <ChevronLeft size={24} color={colors.foreground} />
        </Pressable>
        <View style={[styles.searchBox, { backgroundColor: colors.muted }]}>
          <Search size={18} color={colors.mutedForeground} />
          <TextInput
            value={text}
            onChangeText={setText}
            autoFocus
            accessibilityLabel="Polje za pretragu"
            placeholder="Pretraži beleške, zadatke, ideje…"
            placeholderTextColor={colors.mutedForeground}
            selectionColor={colors.primary}
            returnKeyType="search"
            style={[styles.input, { color: colors.foreground }]}
          />
          {text.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Obriši pretragu"
              onPress={() => setText('')}
              style={styles.clearBtn}>
              <X size={18} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.body}
        // Telo se skuplja kad se tastatura otvori, pa poslednji rezultati ostaju
        // iznad nje. `padding` na oba OS-a: Expo SDK 57 edge-to-edge razbija
        // Android `adjustResize` (isto kao `razgovor`); offset je visina headera.
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}>
        {trimmed.length < MIN_CHARS ? (
        <EmptyState
          icon={<Search size={40} color={colors.mutedForeground} />}
          title="Pronađi ono što ti treba"
          description="Unesi bar dva slova. Pretražujemo stranice, zadatke, ideje, misli i poruke ovog startupa."
        />
      ) : activeStartupId === null ? (
        // Bez izabranog startupa pretraga nema opseg — jasna poruka umesto
        // večitog spinera (rn-review). Startup se bira iz headera.
        <EmptyState
          icon={<Search size={40} color={colors.mutedForeground} />}
          title="Izaberi startup"
          description="Pretraga radi u okviru jednog startupa. Izaberi ga iz zaglavlja pa pokušaj ponovo."
        />
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} accessibilityLabel="Pretražujem" />
        </View>
      ) : total === 0 ? (
        <EmptyState
          icon={<Search size={40} color={colors.mutedForeground} />}
          title="Nema rezultata"
          description={`Ništa ne odgovara upitu „${trimmed}". Probaj kraći izraz.`}
        />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.results, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag">
          {otherPages.length > 0 ? (
            <Section title="Stranice" colors={colors}>
              {otherPages.map((p) => (
                <PageRow key={p._id} page={p} colors={colors} onPress={() => openPage(p._id, p.kind)} />
              ))}
            </Section>
          ) : null}
          {tasks.length > 0 ? (
            <Section title="Zadaci" colors={colors}>
              {tasks.map((p) => (
                <PageRow key={p._id} page={p} colors={colors} onPress={() => openPage(p._id, p.kind)} />
              ))}
            </Section>
          ) : null}
          {ideas.length > 0 ? (
            <Section title="Ideje" colors={colors}>
              {ideas.map((n) => (
                <NodeRow
                  key={n._id}
                  node={n}
                  tint={colors.warning}
                  icon={Lightbulb}
                  openHint="otvori listu ideja"
                  colors={colors}
                  onPress={openIdeas}
                />
              ))}
            </Section>
          ) : null}
          {thoughts.length > 0 ? (
            <Section title="Misli" colors={colors}>
              {thoughts.map((n) => (
                <NodeRow
                  key={n._id}
                  node={n}
                  tint={colors.primary}
                  icon={Brain}
                  openHint="otvori kanvas misli"
                  colors={colors}
                  onPress={openThoughts}
                />
              ))}
            </Section>
          ) : null}
          {msgs.length > 0 ? (
            <Section title="Poruke" colors={colors}>
              {msgs.map((m) => (
                <MessageRow key={m._id} message={m} colors={colors} onPress={() => openChannel(m.channelId)} />
              ))}
            </Section>
          ) : null}
        </ScrollView>
      )}
      </KeyboardAvoidingView>
    </View>
  );
}

type PageResult = {
  _id: Id<'pages'>;
  kind: PageKind;
  title: string;
  area: { label: string } | null;
  startup: { name: string } | null;
};

function Section({
  title,
  colors,
  children,
}: {
  title: string;
  colors: ColorTokens;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function PageRow({
  page,
  colors,
  onPress,
}: {
  page: PageResult;
  colors: ColorTokens;
  onPress: () => void;
}) {
  const Icon = pageKindMeta(page.kind).icon;
  const tint = pageKindColor(colors, page.kind);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Otvori ${page.title}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.muted }]}>
      <View style={[styles.iconChip, { backgroundColor: `${tint}22` }]}>
        <Icon size={18} color={tint} />
      </View>
      <View style={styles.rowBody}>
        <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.foreground }]}>
          {page.title}
        </Text>
        <Text numberOfLines={1} style={[styles.rowSub, { color: colors.mutedForeground }]}>
          {page.area?.label ?? 'Oblast'} · {page.startup?.name ?? 'Startup'}
        </Text>
      </View>
    </Pressable>
  );
}

function MessageRow({
  message,
  colors,
  onPress,
}: {
  message: { body: string; channelName: string; author: { displayName: string } | null };
  colors: ColorTokens;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Otvori razgovor ${message.channelName}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.muted }]}>
      <View style={[styles.iconChip, { backgroundColor: `${colors.info}22` }]}>
        <MessageSquareText size={18} color={colors.info} />
      </View>
      <View style={styles.rowBody}>
        <Text numberOfLines={2} style={[styles.rowTitle, { color: colors.foreground }]}>
          {message.body || 'Prilog'}
        </Text>
        <Text numberOfLines={1} style={[styles.rowSub, { color: colors.mutedForeground }]}>
          {message.channelName}
          {message.author ? ` · ${message.author.displayName}` : ''}
        </Text>
      </View>
    </Pressable>
  );
}

function NodeRow({
  node,
  tint,
  icon: Icon,
  openHint,
  colors,
  onPress,
}: {
  node: { title: string | null; text: string };
  tint: string;
  icon: LucideIcon;
  // Tap ne vodi do čvora nego do sekcije — label imenuje ODREDIŠTE (kao
  // MessageRow: „Otvori razgovor …"), da ekran-čitač ne obeća deep-link.
  openHint: string;
  colors: ColorTokens;
  onPress: () => void;
}) {
  const title = node.title?.trim();
  const body = node.text.trim();
  // Naslov je opcion — kad ga nema, tekst čvora nosi primarni red (2 reda kao
  // MessageRow, jer je tada sadržaj a ne kratak naslov).
  const primary = title || body || 'Bez naslova';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${primary} — ${openHint}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.muted }]}>
      <View style={[styles.iconChip, { backgroundColor: `${tint}22` }]}>
        <Icon size={18} color={tint} />
      </View>
      <View style={styles.rowBody}>
        <Text numberOfLines={title ? 1 : 2} style={[styles.rowTitle, { color: colors.foreground }]}>
          {primary}
        </Text>
        {title && body ? (
          <Text numberOfLines={1} style={[styles.rowSub, { color: colors.mutedForeground }]}>
            {body}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <PretragaError message={error.message} onRetry={retry} />;
}

function PretragaError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: colors.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Nazad"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: colors.muted }]}>
          <ChevronLeft size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.errorTitle, { color: colors.foreground }]}>Pretraga</Text>
      </View>
      <EmptyState
        icon={<TriangleAlert size={40} color={colors.destructive} />}
        title="Pretraga ne radi"
        description={message || 'Došlo je do greške pri pretrazi.'}
        actionLabel="Pokušaj ponovo"
        onAction={onRetry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 6,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 12,
    marginRight: 8,
    borderRadius: radius.lg,
  },
  input: {
    flex: 1,
    height: MIN_TOUCH_TARGET,
    fontSize: fontSize.base,
    paddingVertical: 0,
  },
  clearBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: fontWeight.semibold,
  },
  results: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  section: {
    marginTop: 12,
    gap: 2,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginLeft: 6,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 6,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  iconChip: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: fontWeight.medium,
  },
  rowSub: {
    fontSize: 16,
  },
});
