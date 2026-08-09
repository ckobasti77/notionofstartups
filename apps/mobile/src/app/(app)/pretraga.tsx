import { useQuery } from 'convex/react';
import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import {
  Brain,
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
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { Row } from '@/components/ui/row';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SectionHeader } from '@/components/ui/section-header';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { pageKindColor, pageKindMeta, type PageKind } from '@/lib/page-kinds';
import { useThemeColors } from '@/theme/theme-provider';
import { MIN_TOUCH_TARGET, radius, text as textStyles, type ColorTokens } from '@/theme/tokens';

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
      <View onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
        <ScreenHeader
          title="Pretraga"
          onBack={() => router.back()}
          // Polje je glavna kontrola ekrana — deo je zaglavlja, ne treća traka.
          below={
            <View style={[styles.searchBox, { backgroundColor: colors.muted }]}>
              <Search size={18} color={colors.mutedForeground} />
              <TextInput
                value={text}
                onChangeText={setText}
                autoFocus
                accessibilityLabel="Polje za pretragu"
                placeholder="Beleške, zadaci, ideje, poruke…"
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
          }
        />
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
            <Section title="Stranice" count={otherPages.length}>
              {otherPages.map((p) => (
                <PageRow key={p._id} page={p} colors={colors} onPress={() => openPage(p._id, p.kind)} />
              ))}
            </Section>
          ) : null}
          {tasks.length > 0 ? (
            <Section title="Zadaci" count={tasks.length}>
              {tasks.map((p) => (
                <PageRow key={p._id} page={p} colors={colors} onPress={() => openPage(p._id, p.kind)} />
              ))}
            </Section>
          ) : null}
          {ideas.length > 0 ? (
            <Section title="Ideje" count={ideas.length}>
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
            <Section title="Misli" count={thoughts.length}>
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
            <Section title="Poruke" count={msgs.length}>
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
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <SectionHeader title={title} count={count} style={styles.sectionHeader} />
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
    <Row
      style={styles.row}
      icon={
        <View style={[styles.iconChip, { backgroundColor: `${tint}22` }]}>
          <Icon size={18} color={tint} />
        </View>
      }
      title={page.title}
      subtitle={`${page.area?.label ?? 'Oblast'} · ${page.startup?.name ?? 'Startup'}`}
      onPress={onPress}
      showChevron={false}
      accessibilityLabel={`Otvori ${page.title}`}
    />
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
    <Row
      style={styles.row}
      icon={
        <View style={[styles.iconChip, { backgroundColor: `${colors.info}22` }]}>
          <MessageSquareText size={18} color={colors.info} />
        </View>
      }
      title={message.body || 'Prilog'}
      titleNumberOfLines={2}
      subtitle={`${message.channelName}${message.author ? ` · ${message.author.displayName}` : ''}`}
      onPress={onPress}
      showChevron={false}
      accessibilityLabel={`Otvori razgovor ${message.channelName}`}
    />
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
    <Row
      style={styles.row}
      icon={
        <View style={[styles.iconChip, { backgroundColor: `${tint}22` }]}>
          <Icon size={18} color={tint} />
        </View>
      }
      title={primary}
      titleNumberOfLines={title ? 1 : 2}
      subtitle={title && body ? body : undefined}
      onPress={onPress}
      showChevron={false}
      accessibilityLabel={`${primary} — ${openHint}`}
    />
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <PretragaError message={error.message} onRetry={retry} />;
}

function PretragaError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Pretraga" onBack={() => router.back()} />
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
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 12,
    borderRadius: radius.control,
  },
  input: {
    flex: 1,
    height: MIN_TOUCH_TARGET,
    ...textStyles.body,
    paddingVertical: 0,
  },
  clearBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  results: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  section: {
    gap: 2,
  },
  sectionHeader: {
    marginTop: 4,
  },
  row: {
    minHeight: 56,
    paddingHorizontal: 0,
    paddingVertical: 4,
    borderRadius: radius.control,
  },
  iconChip: {
    width: 32,
    height: 32,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
