import { useRouter } from 'expo-router';
import {
  Bell,
  CalendarClock,
  Check,
  ChevronLeft,
  Clock,
  Flame,
  FolderClosed,
  Inbox,
  Menu,
  MessageCircle,
  Monitor,
  Moon,
  Plus,
  Star,
  Sun,
  type LucideIcon,
} from 'lucide-react-native';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DueChip } from '@/components/me/due-chip';
import { ElsewhereHint } from '@/components/me/elsewhere-hint';
import { MeHeader } from '@/components/me/me-header';
import { buildMyDay, STATUS_DENIED_REASON } from '@/components/me/my-day/my-day-model';
import { SummaryCard } from '@/components/me/my-day/my-day-view';
import { MyDaySummaryChips } from '@/components/me/my-day/summary-chips';
import { PlanDaySheet } from '@/components/me/plan-day-sheet';
import { QuickAddSheet } from '@/components/me/quick-add-sheet';
import { RokPlanSheet } from '@/components/me/rok-plan-sheet';
import { RowActionsSheet, type RowActionsTarget } from '@/components/me/row-actions-sheet';
import { MeSectionHeader } from '@/components/me/section-header';
import { StartupChip } from '@/components/me/startup-chip';
import { TaskRow } from '@/components/me/task-row';
import { TaskMetaSheet, type TaskMetaView } from '@/components/zadatak/task-meta-sheet';
import {
  KATALOG_QUICK_ADD_STARTUPS,
  KATALOG_STARTUPS,
  katalogDueDates,
  katalogOverview,
  katalogRows,
} from '@/components/me/__fixtures__';
import {
  buildPlanDay,
  EMPTY_TASK_FILTERS,
  hubGroups,
  type HubChannel,
  type InboxScope,
  type InboxSegment,
  type TaskFilters,
  type TaskRowModel,
} from '@devotion/shared';
import { CircleDot, Flag } from 'lucide-react-native';
import { MetaChip } from '@/components/me/meta-chip';
import {
  katalogInboxCounts,
  katalogInboxItems,
  katalogInboxPending,
  KATALOG_INBOX_STARTUPS,
} from '@/components/me/inbox/__fixtures__';
import {
  InboxRow,
  InboxView,
  PendingRow,
  type InboxFeedState,
  type InboxItemModel,
} from '@/components/me/inbox/inbox-view';
import { TaskFiltersSheet } from '@/components/me/tasks/task-filters-sheet';
import {
  KATALOG_CHAT_ME,
  KATALOG_CHAT_PEOPLE,
  katalogHubInput,
  katalogHubRows,
} from '@/components/me/chat/__fixtures__';
import { HubActionsSheet } from '@/components/me/chat/hub-actions-sheet';
import { toggleHubCollapsed } from '@/components/me/chat/hub-model';
import { HubGroupHeader, HubRow } from '@/components/me/chat/hub-row';
import { ChatHubView, type HubListState } from '@/components/me/chat/hub-view';
import { GroupSettingsSheet, NewDmSheet, NewGroupSheet } from '@/components/me/chat/people-sheets';
import {
  MoveToStartupStep,
  PanelError,
  PanelGone,
  PanelLoading,
  PanelPlace,
  TextBlockField,
  TitleField,
} from '@/components/me/task-panel-parts';
import { PokretK19Katalog } from '@/components/katalog/pokret-k19';
import { DatePickerSheet } from '@/components/ui/date-picker-sheet';
import {
  AnimatedCheck,
  NumberRoll,
  PressableScale,
  ProgressRing,
  SwipeRow,
  swipeAccessibilityActions,
  TabIcon,
  type SwipeAction,
} from '@/components/motion';

import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  EmptyState,
  FAB,
  Input,
  Pill,
  Row,
  SectionHeader,
  Skeleton,
} from '@/components/ui';
import { useAppTheme, type ThemePreference } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, spacing, text, type ColorTokens } from '@/theme/tokens';

const noop = () => {};

/** Stanje feed-a Inboxa u katalogu: filtrira fixture po segmentu i opsegu. */
function katalogInboxFeed(
  mode: 'ready' | 'loading' | 'empty' | 'error',
  items: ReadonlyArray<InboxItemModel>,
  segment: InboxSegment,
  scope: InboxScope,
  retry: () => void,
): InboxFeedState {
  if (mode === 'loading') return { status: 'loading' };
  if (mode === 'error') return { status: 'error', retry };
  const visible =
    mode === 'empty'
      ? []
      : items.filter((entry) => {
          if (segment === 'unread' && entry.readAt !== null) return false;
          if (scope.kind === 'personal') return entry.startupId === null;
          if (scope.kind === 'startup') return entry.startupId === scope.startupId;
          return true;
        });
  return { status: 'ready', items: visible, canLoadMore: false, loadingMore: false, onLoadMore: noop };
}

/** Stanje huba Poruka u katalogu (K16). */
function katalogHubState(
  mode: 'ready' | 'loading' | 'empty' | 'error',
  hub: ReturnType<typeof katalogHubInput>,
  retry: () => void,
): HubListState {
  if (mode === 'loading') return { status: 'loading' };
  if (mode === 'error') return { status: 'error', retry };
  if (mode === 'empty') return { status: 'ready', input: { personal: [], startups: [] }, capped: false };
  return { status: 'ready', input: hub, capped: hub.capped };
}

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Svetlo', icon: Sun },
  { value: 'dark', label: 'Tamno', icon: Moon },
  { value: 'system', label: 'Sistemsko', icon: Monitor },
];

const AVATAR_NAMES = ['Marko Jovanović', 'Ana Anić', 'Petar Petrović', 'Jelena Kovač', 'Nikola Ilić'];

/** Pokret (K09): koraci za brojač i prsten, ikonice tab bara. */
const ROLL_STEPS = [7, 12, 100] as const;
const RING_STEPS = [0, 0.43, 1] as const;
const TAB_DEMO_ICONS: readonly LucideIcon[] = [Sun, FolderClosed, MessageCircle, Inbox, Menu];
const TAB_DEMO_LABELS = ['Danas', 'Prostor', 'Poruke', 'Inbox', 'Više'] as const;

/**
 * Dev-only katalog dizajn tokena i primitiva. Dostupan iz taba „Više" samo kad je
 * `__DEV__`. Prikazuje sve primitive, varijante i stanja; prekidač teme na vrhu
 * menja globalnu temu pa se sve prerenderuje u izabranoj (svetla/tamna/sistemska).
 */
export default function DizajnKatalogScreen() {
  const { preference, setPreference, colors } = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [toggleOn, setToggleOn] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  // Pokret (K09)
  const [demoNow] = useState(() => Date.now());
  const [checkSmall, setCheckSmall] = useState(false);
  const [checkLarge, setCheckLarge] = useState(true);
  const [rollIndex, setRollIndex] = useState(0);
  const [ringIndex, setRingIndex] = useState(1);
  const [tabFocus, setTabFocus] = useState(0);
  const [swipeLog, setSwipeLog] = useState<string | null>(null);
  const [rowsDone, setRowsDone] = useState<ReadonlySet<string>>(() => new Set(['task:katalog-5']));
  // Moj dan (K12)
  const [actionsTarget, setActionsTarget] = useState<RowActionsTarget | null>(null);
  const [rokRow, setRokRow] = useState<TaskRowModel | null>(null);
  const [k12Log, setK12Log] = useState<string | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [k13Filters, setK13Filters] = useState<TaskFilters>(EMPTY_TASK_FILTERS);
  const [k13FiltersOpen, setK13FiltersOpen] = useState(false);
  const [k13DateOpen, setK13DateOpen] = useState(false);
  const [k13Due, setK13Due] = useState<number | null>(null);
  const [k13Move, setK13Move] = useState(false);
  const [k13Log, setK13Log] = useState<string | null>(null);
  // Zadaci u startupu (K18)
  const [k18Target, setK18Target] = useState<RowActionsTarget | null>(null);
  const [k18Meta, setK18Meta] = useState<TaskMetaView | null>(null);
  const [k18Log, setK18Log] = useState<string | null>(null);
  // Inbox (K14)
  const [k14Segment, setK14Segment] = useState<InboxSegment>('all');
  const [k14Scope, setK14Scope] = useState<InboxScope>({ kind: 'all' });
  const [k14Items, setK14Items] = useState<InboxItemModel[]>(() => katalogInboxItems(Date.now()));
  const [k14Mode, setK14Mode] = useState<'ready' | 'loading' | 'empty' | 'error'>('ready');
  const [k14Log, setK14Log] = useState<string | null>(null);
  // Poruke (K16)
  const [k16Rows] = useState(() => katalogHubRows(Date.now()));
  const [k16Hub] = useState(() => katalogHubInput(Date.now()));
  const [k16Mode, setK16Mode] = useState<'ready' | 'loading' | 'empty' | 'error'>('ready');
  const [k16Query, setK16Query] = useState('');
  const [k16Collapsed, setK16Collapsed] = useState<Set<string>>(() => new Set());
  const [k16Actions, setK16Actions] = useState<HubChannel | null>(null);
  const [k16DmOpen, setK16DmOpen] = useState(false);
  const [k16GroupOpen, setK16GroupOpen] = useState(false);
  const [k16Settings, setK16Settings] = useState<'owner' | 'member' | null>(null);
  const [k16Log, setK16Log] = useState<string | null>(null);
  const [sectionCount, setSectionCount] = useState(3);
  const [sectionCollapsed, setSectionCollapsed] = useState(true);
  const [k12Overview] = useState(() => katalogOverview(Date.now()));
  const k12Model = buildMyDay(k12Overview, demoNow);
  const k12Plan = buildPlanDay(k12Overview, demoNow);

  if (!__DEV__) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="Dizajn katalog" onBack={() => router.back()} colors={colors} />
        <EmptyState
          icon={<Inbox size={40} color={colors.mutedForeground} />}
          title="Samo za razvoj"
          description="Katalog je dostupan isključivo u dev buildu."
        />
      </View>
    );
  }

  const topBorder = { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title="Dizajn katalog" onBack={() => router.back()} colors={colors} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}>
          {/* Prekidač teme */}
        <View style={styles.themeRow}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Tema</Text>
          <View style={[styles.segmented, { backgroundColor: colors.muted }]}>
            {THEME_OPTIONS.map((option) => {
              const active = preference === option.value;
              const Icon = option.icon;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setPreference(option.value)}
                  style={[
                    styles.segment,
                    active && { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}>
                  <Icon size={18} color={active ? colors.foreground : colors.mutedForeground} />
                  <Text
                    style={[
                      styles.segmentLabel,
                      { color: active ? colors.foreground : colors.mutedForeground },
                    ]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ── Boje ── */}
        <SectionHeader title="Boje" />
        <Card>
          <View style={styles.swatchWrap}>
            {[
              { name: 'background', value: colors.background },
              { name: 'surface', value: colors.surface },
              { name: 'surfaceRaised', value: colors.surfaceRaised },
              { name: 'border', value: colors.border },
              { name: 'foreground', value: colors.foreground },
              { name: 'muted · tekst', value: colors.mutedForeground },
              { name: 'subtle', value: colors.subtle },
              { name: 'accent (primary)', value: colors.primary },
              { name: 'success', value: colors.success },
              { name: 'warning', value: colors.warning },
              { name: 'danger', value: colors.danger },
              { name: 'info', value: colors.info },
            ].map((sw) => (
              <View key={sw.name} style={styles.swatch}>
                <View
                  style={[styles.swatchChip, { backgroundColor: sw.value, borderColor: colors.border }]}
                />
                <Text numberOfLines={1} style={[styles.swatchName, { color: colors.foreground }]}>
                  {sw.name}
                </Text>
                <Text style={[styles.swatchHex, { color: colors.subtle }]}>{sw.value}</Text>
              </View>
            ))}
          </View>
        </Card>

        {/* ── Tipografija ── */}
        <SectionHeader title="Tipografija" />
        <Card style={styles.typeCard}>
          <Text style={[text.display, { color: colors.foreground }]}>Display 28</Text>
          <Text style={[text.title, { color: colors.foreground }]}>Title 20</Text>
          <Text style={[text.body, { color: colors.foreground }]}>
            Body 16 — sve što se čita u interfejsu.
          </Text>
          <Text style={[text.meta, { color: colors.subtle }]}>META 13 — BADGE, VREME, BROJAČI</Text>
        </Card>

        {/* ── Dugmad ── */}
        <SectionHeader title="Dugmad" />
        <Caption text="Varijante" colors={colors} />
        <View style={styles.rowWrap}>
          <Button label="Default" onPress={noop} />
          <Button label="Secondary" variant="secondary" onPress={noop} />
          <Button label="Ghost" variant="ghost" onPress={noop} />
          <Button label="Destructive" variant="destructive" onPress={noop} />
        </View>
        <Caption text="Veličine (sm · md · lg)" colors={colors} />
        <View style={styles.rowWrap}>
          <Button label="sm" size="sm" onPress={noop} />
          <Button label="md" size="md" onPress={noop} />
          <Button label="lg" size="lg" onPress={noop} />
        </View>
        <Caption text="Stanja i ikonica" colors={colors} />
        <View style={styles.rowWrap}>
          <Button label="Loading" loading onPress={noop} />
          <Button label="Disabled" disabled onPress={noop} />
          <Button
            label="Sa ikonicom"
            icon={<Plus size={18} color={colors.primaryForeground} />}
            onPress={noop}
          />
        </View>
        <Button label="Full width" fullWidth onPress={noop} style={styles.fullBtn} />

        {/* ── Pilule ── */}
        <SectionHeader title="Pilule" />
        <View style={styles.rowWrap}>
          <Pill label="neutral" />
          <Pill label="accent" tone="accent" />
          <Pill label="success" tone="success" icon={Check} />
          <Pill label="warning" tone="warning" icon={Clock} />
          <Pill label="danger" tone="danger" icon={Flame} />
          <Pill label="dodirljiv" tone="accent" onPress={noop} />
        </View>

        {/* ── Badge ── */}
        <SectionHeader title="Badge" />
        <View style={styles.rowWrap}>
          <Badge label="default" />
          <Badge label="secondary" variant="secondary" />
          <Badge label="destructive" variant="destructive" />
          <Badge label="success" variant="success" />
          <Badge label="outline" variant="outline" />
        </View>

        {/* ── Kartica ── */}
        <SectionHeader title="Kartica" />
        <Card>
          <CardHeader>
            <CardTitle>Naslov kartice</CardTitle>
            <CardDescription>Opis — sekundarni tekst ispod naslova.</CardDescription>
          </CardHeader>
          <CardContent>
            <Text style={[text.body, { color: colors.foreground }]}>
              Sadržaj kartice. Kartice se odvajaju bojom površine i 1px ivicom — bez senke.
            </Text>
          </CardContent>
          <CardFooter>
            <Button label="Akcija" size="sm" onPress={noop} />
            <Button label="Otkaži" variant="ghost" size="sm" onPress={noop} />
          </CardFooter>
        </Card>

        {/* ── Redovi ── */}
        <SectionHeader title="Redovi" />
        <Card style={styles.rowsCard}>
          <Row icon={<Bell size={20} color={colors.foreground} />} title="Navigacija" onPress={noop} />
          <Row
            title="Vrednost"
            value="Detalj"
            variant="value"
            onPress={noop}
            style={topBorder}
          />
          <Row
            title="Prekidač"
            variant="toggle"
            checked={toggleOn}
            onToggle={setToggleOn}
            style={topBorder}
          />
          <Row
            icon={<Star size={20} color={colors.foreground} />}
            title="Sa podnaslovom"
            subtitle="Sekundarni tekst reda"
            onPress={noop}
            style={topBorder}
          />
          <Row
            disabled
            title="Onemogućen"
            value={<Pill label="uskoro" />}
            style={topBorder}
          />
        </Card>

        {/* ── Naslovi sekcija ── */}
        <SectionHeader title="Naslovi sekcija" />
        <Card style={styles.typeCard}>
          <SectionHeader title="Podrazumevano" />
          <SectionHeader title="Sa brojačem" count={4} />
          <SectionHeader title="Prekoračeno" count={2} tone="danger" />
          <SectionHeader
            title="Sklopivo"
            count={7}
            collapsible
            collapsed={collapsed}
            onToggle={() => setCollapsed((v) => !v)}
          />
        </Card>

        {/* ── Avatari ── */}
        <SectionHeader title="Avatari" />
        <Caption text="Boja izvedena iz imena (deterministički hash)" colors={colors} />
        <View style={styles.rowWrap}>
          {AVATAR_NAMES.map((name) => (
            <Avatar key={name} name={name} />
          ))}
        </View>
        <Caption text="Veličine (24 · 40 · 56)" colors={colors} />
        <View style={styles.avatarSizes}>
          <Avatar name="Marko Jovanović" size={24} />
          <Avatar name="Marko Jovanović" size={40} />
          <Avatar name="Marko Jovanović" size={56} />
        </View>

        {/* ── Polja ── */}
        <SectionHeader title="Polja za unos" />
        <View style={styles.fields}>
          <Input placeholder="Unesi tekst" />
          <Input placeholder="Nevalidno polje" invalid defaultValue="Greška" />
        </View>

        {/* ── Skeleton ── */}
        <SectionHeader title="Skeleton (učitavanje)" />
        <Card style={styles.typeCard}>
          <Skeleton width="70%" height={20} />
          <Skeleton width="100%" height={14} />
          <Skeleton width="45%" height={14} />
        </Card>

        {/* ── Prazno stanje ── */}
        <SectionHeader title="Prazno stanje" />
        <Card>
          <View style={styles.emptyBox}>
            <EmptyState
              icon={<Inbox size={40} color={colors.mutedForeground} />}
              title="Nema stavki"
              description="Kad dodaš prvu, pojaviće se ovde."
              actionLabel="Dodaj"
              onAction={noop}
            />
          </View>
        </Card>

        {/* ── FAB ── */}
        <SectionHeader title="FAB (plutajuće dugme)" />
        <View style={[styles.fabBox, { borderColor: colors.border }]}>
          <FAB icon={Plus} accessibilityLabel="Primer plutajućeg dugmeta" onPress={noop} />
        </View>

        {/* ── Pokret (K09) — brojevi iz @devotion/shared, svi poštuju „smanji pokret" ── */}
        <SectionHeader title="Pokret" />
        <Caption text="PressableScale — utisne se na dodir (0,97), vrati se springom snappy" colors={colors} />
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Primer dugmeta sa pritiskom"
          haptic="tap"
          onPress={noop}
          style={[styles.pressDemo, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[text.body, { color: colors.foreground }]}>Pritisni i drži</Text>
        </PressableScale>

        <Caption text="AnimatedCheck — 24 · 28 · onemogućena (isprekidan obod)" colors={colors} />
        <View style={styles.rowWrap}>
          <AnimatedCheck
            checked={checkSmall}
            onToggle={setCheckSmall}
            accessibilityLabel="Primer kvačice"
          />
          <AnimatedCheck
            size={28}
            checked={checkLarge}
            onToggle={setCheckLarge}
            accessibilityLabel="Primer velike kvačice"
          />
          <AnimatedCheck
            checked={false}
            onToggle={noop}
            disabled
            disabledReason={STATUS_DENIED_REASON}
            accessibilityLabel="Onemogućena kvačica"
          />
        </View>

        <Caption text="NumberRoll — 7 → 12 → 100 (99+)" colors={colors} />
        <View style={styles.rowWrap}>
          <View style={[styles.rollBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <NumberRoll
              value={ROLL_STEPS[rollIndex]}
              style={[text.title, { color: colors.foreground }]}
            />
          </View>
          <Button
            label="Sledeći broj"
            size="sm"
            variant="secondary"
            onPress={() => setRollIndex((index) => (index + 1) % ROLL_STEPS.length)}
          />
        </View>

        <Caption text="ProgressRing — 0 · 0,43 · 1 (na 100 % kvačica)" colors={colors} />
        <View style={styles.rowWrap}>
          {RING_STEPS.map((value) => (
            <ProgressRing
              key={value}
              progress={value}
              accessibilityLabel="Primer prstena"
              valueText={`${Math.round(value * 100)} %`}
            />
          ))}
          <ProgressRing
            progress={RING_STEPS[ringIndex]}
            size={56}
            accessibilityLabel="Promenljiv prsten"
            valueText={`${Math.round(RING_STEPS[ringIndex] * 100)} %`}>
            <NumberRoll
              value={Math.round(RING_STEPS[ringIndex] * 100)}
              style={[text.meta, { color: colors.foreground }]}
            />
          </ProgressRing>
          <Button
            label="Promeni"
            size="sm"
            variant="secondary"
            onPress={() => setRingIndex((index) => (index + 1) % RING_STEPS.length)}
          />
        </View>

        <Caption text="TabIcon — izabrana ikonica odskoči (bouncy)" colors={colors} />
        <View style={[styles.tabDemo, { borderColor: colors.border, backgroundColor: colors.background }]}>
          {TAB_DEMO_ICONS.map((Icon, index) => (
            <Pressable
              key={TAB_DEMO_LABELS[index]}
              accessibilityRole="tab"
              accessibilityLabel={TAB_DEMO_LABELS[index]}
              accessibilityState={{ selected: tabFocus === index }}
              onPress={() => setTabFocus(index)}
              style={styles.tabDemoItem}>
              <TabIcon
                icon={Icon}
                focused={tabFocus === index}
                color={tabFocus === index ? colors.primaryText : colors.subtle}
                size={24}
              />
              <Text
                style={[
                  styles.tabDemoLabel,
                  { color: tabFocus === index ? colors.primaryText : colors.subtle },
                ]}>
                {TAB_DEMO_LABELS[index]}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ── Swipe red (K09) ── */}
        <SectionHeader title="Swipe red" />
        <Caption
          text="Prevuci desno (Završi) ili levo (Rok i plan): prag 96 pt, tik na pragu, otpor posle 120 pt"
          colors={colors}
        />
        <KatalogSwipe
          colors={colors}
          right={{ label: 'Završi', icon: Check, tone: 'success', onCommit: () => setSwipeLog('Završi') }}
          left={{
            label: 'Rok i plan',
            icon: CalendarClock,
            tone: 'primary',
            onCommit: () => setSwipeLog('Rok i plan'),
          }}
          title="Prevuci ovaj red"
          subtitle={swipeLog ? `Poslednja radnja: ${swipeLog}` : 'Još nema radnje'}
        />
        <KatalogSwipe
          colors={colors}
          right={{
            label: 'Završi',
            icon: Check,
            tone: 'success',
            allowed: false,
            onCommit: () => setSwipeLog('Završi'),
          }}
          title="Bez dozvole"
          subtitle="Radnja se vidi, ali potvrda samo upozori i red se vrati"
        />

        {/* ── Čip startupa (K09) ── */}
        <SectionHeader title="Čip startupa" />
        <Caption text={'Ton iz imena — ista boja kao na webu; „Lično" za lične zadatke'} colors={colors} />
        <View style={styles.rowWrap}>
          {KATALOG_STARTUPS.map((startup) => (
            <StartupChip key={startup._id} startup={startup} size="sm" showName />
          ))}
          <StartupChip startup={null} size="sm" showName />
        </View>
        <Caption text="Pune pločice (solid) · md i lg" colors={colors} />
        <View style={styles.rowWrap}>
          {KATALOG_STARTUPS.map((startup) => (
            <StartupChip key={startup._id} startup={startup} size="md" variant="solid" />
          ))}
          <StartupChip startup={KATALOG_STARTUPS[0]} size="lg" />
          <StartupChip startup={null} size="lg" />
        </View>

        {/* ── Čip roka (K09) ── */}
        <SectionHeader title="Čip roka" />
        <Card style={styles.typeCard}>
          {katalogDueDates(demoNow).map((entry) => (
            <View key={entry.label} style={styles.dueRow}>
              <Text style={[text.meta, styles.dueLabel, { color: colors.subtle }]}>{entry.label}</Text>
              <DueChip dueDate={entry.dueDate} now={demoNow} showEmpty />
            </View>
          ))}
        </Card>

        {/* ── Red zadatka v1 (K09) ── */}
        <SectionHeader title="Red zadatka (v1)" />
        <Caption text="Kvačica završava (haptika), precrt prolazi sleva; četvrti red nema dozvolu" colors={colors} />
        <Card style={styles.taskRowsCard}>
          {katalogRows(demoNow).map((row) => (
            <TaskRow
              key={row.key}
              row={{ ...row, done: rowsDone.has(row.key) }}
              now={demoNow}
              onToggleDone={(target, done) =>
                setRowsDone((current) => {
                  const next = new Set(current);
                  if (done) next.add(target.key);
                  else next.delete(target.key);
                  return next;
                })
              }
              onOpen={row.kind === 'task' ? noop : undefined}
            />
          ))}
        </Card>

        {/* ── Zaglavlje globalnog taba i napomena (K09) ── */}
        <SectionHeader title="Zaglavlje globalnog taba" />
        <View style={[styles.headerBox, { borderColor: colors.border }]}>
          <MeHeader title="Danas" subtitle="subota 25. oktobar" safeArea={false} />
        </View>
        <Caption text="Napomena u Porukama/Inboxu dok K14/K16 ne naprave globalne ekrane" colors={colors} />
        <View style={[styles.headerBox, { borderColor: colors.border }]}>
          <ElsewhereHint text="Još 4 nepročitane poruke u drugim startupima i ličnim razgovorima." />
        </View>

        {/* ── Moj dan (K12) ── */}
        <SectionHeader title="Moj dan — zaglavlje i prsten" />
        <Caption text="Pozdrav, sažetak i prsten (2 od 5); sažeti čipovi se vide samo kad su > 0" colors={colors} />
        <SummaryCard model={k12Model} firstName="Jovan" />
        <MyDaySummaryChips
          inbox={12}
          chat={4}
          pending={2}
          onOpenInbox={() => setK12Log('Inbox')}
          onOpenChat={() => setK12Log('Poruke')}
          onOpenPending={() => setK12Log('Čeka tebe')}
        />

        <SectionHeader title="Red zadatka sa radnjama" />
        <Caption
          text={'Swipe desno završava, levo otvara „Rok i plan", dugi pritisak radnje; četvrti red je tuđ (zaključano)'}
          colors={colors}
        />
        {/* Bez kartice: swipe red ima pozadinu ekrana, kao u pravoj listi Moj dan. */}
        <View>
          {katalogRows(demoNow).map((row) => (
            <TaskRow
              key={row.key}
              row={withDone(row, rowsDone.has(row.key))}
              now={demoNow}
              onToggleDone={(target, done) => {
                setK12Log(done ? `Završeno: ${target.title}` : `Vraćeno: ${target.title}`);
                setRowsDone((current) => {
                  const next = new Set(current);
                  if (done) next.add(target.key);
                  else next.delete(target.key);
                  return next;
                });
              }}
              onOpen={row.kind === 'task' ? (target) => setK12Log(`Otvori: ${target.title}`) : undefined}
              onLongPress={(target) => setActionsTarget({ row: target, movable: target.planned ? { up: false, down: true } : null })}
              onSchedule={(target) => setRokRow(target)}
              onDenied={(_, reason) => setK12Log(`Zaključano: ${reason}`)}
            />
          ))}
        </View>
        <Caption text={k12Log ? `Poslednja radnja: ${k12Log}` : 'Još nema radnje'} colors={colors} />

        <SectionHeader title="Sekcija sa brojem" />
        <Caption text="Broj se kotrlja; sklopiva sekcija okreće strelicu" colors={colors} />
        <Card style={styles.typeCard}>
          <MeSectionHeader title="Prekoračeno" count={sectionCount} tone="danger" />
          <MeSectionHeader title="Cluck Rush" count={sectionCount + 2} startup={KATALOG_STARTUPS[0]} />
          <MeSectionHeader title="Lično" count={1} startup={null} />
          <MeSectionHeader
            title="Završeno danas"
            count={sectionCount * 2}
            collapsible
            collapsed={sectionCollapsed}
            onToggle={() => setSectionCollapsed((value) => !value)}
          />
          <Button
            label="Promeni broj"
            size="sm"
            variant="secondary"
            onPress={() => setSectionCount((value) => (value >= 12 ? 1 : value + 3))}
          />
        </Card>

        <SectionHeader title="Brzi unos" />
        <Caption text="Sheet iznad tastature: Gde (Nauči AI nema oblasti), rok, Dodaj i u Moj dan" colors={colors} />
        <Button label="Otvori brzi unos" variant="secondary" onPress={() => setQuickAddOpen(true)} />

        <SectionHeader title="Isplaniraj dan" />
        <Caption text="Preneto od ranije (Vrati / Skloni) i predlozi po razlogu" colors={colors} />
        <Button label="Otvori Isplaniraj dan" variant="secondary" onPress={() => setPlanOpen(true)} />

        {/* ── Moji zadaci, panel, datum (K13) ── */}
        <SectionHeader title="Metapodatak-čip" />
        <Caption text="Dozvoljeno otvara izbor; zabranjeno je isprekidan čip sa katancem, a dodir pokazuje razlog" colors={colors} />
        <View style={styles.k13Chips}>
          <MetaChip label="Status" value="U toku" icon={CircleDot} perm={{ allowed: true, reason: null }} onPress={() => setK13Log("Status")} />
          <MetaChip label="Rok" value="sre 28. okt" icon={CalendarClock} perm={{ allowed: true, reason: null }} onPress={() => setK13Log("Rok")} />
          <MetaChip label="Prioritet" value="Bez prioriteta" bare icon={Flag} perm={{ allowed: true, reason: null }} onPress={() => setK13Log("Prioritet")} />
          <MetaChip
            label="Prioritet"
            value="Visok"
            icon={Flag}
            perm={{ allowed: false, reason: "Prioritet menja samo kreator zadatka." }}
            onPress={() => undefined}
            onDenied={(reason) => setK13Log("Zaključano: " + reason)}
          />
        </View>
        <Caption text={k13Log ? "Poslednja radnja: " + k13Log : "Još nema radnje"} colors={colors} />

        <SectionHeader title="Panel zadatka — delovi" />
        <Caption text="Zaglavlje, polje beleške, prebacivanje i stanja (pun panel traži žive podatke: Danas → dodir na red)" colors={colors} />
        <Card style={styles.typeCard}>
          <PanelPlace startup={KATALOG_STARTUPS[0]} areaLabel="Sales" />
          <TitleField value="Ugovor sa dobavljačem" editable onCommit={(title) => setK13Log("Naslov: " + title)} />
          <TextBlockField
            title="Beleška"
            value={null}
            editable
            max={5000}
            placeholder="Dodaj belešku…"
            emptyText="Nema beleške."
            accessibilityLabel="Beleška"
            onSave={(value) => setK13Log("Beleška: " + (value ?? "prazno"))}
          />
          <TextBlockField
            title="Instrukcije"
            value="Proveriti klauzulu o rokovima pre potpisa."
            editable={false}
            lockedReason="Instrukcije menja samo kreator zadatka."
            max={20000}
            placeholder=""
            emptyText="Nema instrukcija."
            accessibilityLabel="Instrukcije"
            onSave={() => undefined}
          />
        </Card>
        <Button label={k13Move ? "Sakrij prebacivanje" : "Prebaci u startup (korak)"} variant="secondary" onPress={() => setK13Move((value) => !value)} />
        {k13Move ? (
          <Card style={styles.typeCard}>
            <MoveToStartupStep
              title="Faktura za oktobar"
              startups={KATALOG_QUICK_ADD_STARTUPS}
              onCancel={() => setK13Move(false)}
              onMove={async (startupId) => {
                if (startupId === "katalog-na") throw new Error("Zadatak nije prebačen. Pokušaj ponovo.");
                setK13Log("Prebačeno: " + startupId);
                setK13Move(false);
              }}
            />
          </Card>
        ) : null}
        <Caption text="Stanja panela: učitavanje, ne postoji, greška" colors={colors} />
        <Card style={styles.typeCard}>
          <PanelLoading />
        </Card>
        <Card style={styles.typeCard}>
          <PanelGone onClose={() => setK13Log("Zatvori")} />
        </Card>
        <Card style={styles.typeCard}>
          <PanelError retry={() => setK13Log("Pokušaj ponovo")} onClose={() => setK13Log("Zatvori")} />
        </Card>

        <SectionHeader title="Birač datuma sa čipovima" />
        <Caption text="Danas · Sutra · Vikend · Sledeće nedelje · Bez roka, pa mesečni kalendar (lokalno podne)" colors={colors} />
        <Button label={k13Due === null ? "Izaberi rok" : "Rok izabran"} variant="secondary" onPress={() => setK13DateOpen(true)} />

        <SectionHeader title="Filteri" />
        <Caption text="Startup (uključujući Lično), status, prioritet, rok i Prikaži završene" colors={colors} />
        <Button label="Otvori filtere" variant="secondary" onPress={() => setK13FiltersOpen(true)} />

        {/* ── Zadaci u startupu (K18) ── */}
        <SectionHeader title="Zadatak u startupu — radnje" />
        <Caption
          text={'Dugi pritisak u startupu: Otvori, Završi, Moj dan, „Priključi se" (tuđ zadatak), Status, Rok, Prioritet'}
          colors={colors}
        />
        <View style={styles.k13Chips}>
          {katalogRows(demoNow)
            .filter((row) => row.kind === 'task')
            .slice(0, 4)
            .map((row) => (
              <Button
                key={row.key}
                label={row.permissions.status.allowed ? 'Radnje: moj zadatak' : 'Radnje: tuđ zadatak'}
                size="sm"
                variant="secondary"
                onPress={() => setK18Target({ row, movable: null })}
              />
            ))}
        </View>

        <SectionHeader title="Zadatak u startupu — metapodaci" />
        <Caption text="Sheet izbora sa detalja zadatka: status, prioritet, rok (srpski čipovi + kalendar u sheet-u), izvršioci" colors={colors} />
        <View style={styles.k13Chips}>
          <Button label="Status" size="sm" variant="secondary" onPress={() => setK18Meta('status')} />
          <Button label="Prioritet" size="sm" variant="secondary" onPress={() => setK18Meta('priority')} />
          <Button label="Rok" size="sm" variant="secondary" onPress={() => setK18Meta('due')} />
          <Button label="Izvršioci" size="sm" variant="secondary" onPress={() => setK18Meta('assignees')} />
        </View>
        <Caption text={k18Log ? `Poslednja radnja: ${k18Log}` : 'Još nema radnje'} colors={colors} />

        {/* ── Inbox (K14) ── */}
        <SectionHeader title="Inbox stavka" />
        <Caption text="Nepročitano · pročitano · lična poruka · ikonica po tipu · swipe udesno = pročitano" colors={colors} />
        <Card style={styles.taskRowsCard}>
          {k14Items.slice(0, 5).map((item) => (
            <InboxRow
              key={item._id}
              item={item}
              now={demoNow}
              onOpen={(target) => setK14Log(`Otvori: ${target.title}`)}
              onMarkRead={(target) => {
                setK14Items((current) =>
                  current.map((entry) => (entry._id === target._id ? { ...entry, readAt: demoNow } : entry)),
                );
                setK14Log(`Pročitano: ${target.title}`);
              }}
            />
          ))}
        </Card>
        {k14Log ? <Caption text={k14Log} colors={colors} /> : null}

        <SectionHeader title="Čeka tebe" />
        <Caption text="Glasanje o brisanju (Glasaj) i predlog premeštanja (Pogledaj)" colors={colors} />
        <View style={styles.pendingDemo}>
          {katalogInboxPending(demoNow).map((item) => (
            <PendingRow
              key={item.kind === 'deletion_vote' ? item.ballotId : item.requestId}
              item={item}
              now={demoNow}
              onOpen={(target) => setK14Log(`Odobrenja: ${target.startup.name}`)}
            />
          ))}
        </View>

        <SectionHeader title="Inbox — ceo ekran" />
        <Caption text="Segmenti sa brojem, čipovi opsega, grupe po danima, 'Označi sve'. Stanje:" colors={colors} />
        <View style={styles.modeRow}>
          {(['ready', 'loading', 'empty', 'error'] as const).map((mode) => (
            <Button
              key={mode}
              label={{ ready: 'Podaci', loading: 'Učitavanje', empty: 'Prazno', error: 'Greška' }[mode]}
              size="sm"
              variant={k14Mode === mode ? 'default' : 'secondary'}
              onPress={() => setK14Mode(mode)}
            />
          ))}
        </View>
        <View style={[styles.inboxFrame, { borderColor: colors.border }]}>
          <InboxView
            now={demoNow}
            safeArea={false}
            segment={k14Segment}
            onSegmentChange={setK14Segment}
            scope={k14Scope}
            onScopeChange={setK14Scope}
            startups={KATALOG_INBOX_STARTUPS}
            counts={katalogInboxCounts(k14Items)}
            feed={katalogInboxFeed(k14Mode, k14Items, k14Segment, k14Scope, () => setK14Mode('ready'))}
            pending={
              k14Mode === 'loading'
                ? { status: 'loading' }
                : k14Mode === 'error'
                  ? { status: 'error', retry: () => setK14Mode('ready') }
                  : {
                      status: 'ready',
                      items: k14Mode === 'empty' ? [] : katalogInboxPending(demoNow),
                      truncated: false,
                    }
            }
            onOpen={(target) => setK14Log(`Otvori: ${target.title}`)}
            onMarkRead={(target) =>
              setK14Items((current) =>
                current.map((entry) => (entry._id === target._id ? { ...entry, readAt: demoNow } : entry)),
              )
            }
            onOpenPending={(target) => setK14Log(`Odobrenja: ${target.startup.name}`)}
            onMarkAllRead={() =>
              setK14Items((current) => current.map((entry) => (entry.readAt === null ? { ...entry, readAt: demoNow } : entry)))
            }
            markingAll={false}
            onOpenSettings={() => setK14Log('Podešavanja obaveštenja')}
          />
        </View>

        {/* ── Poruke (K16) ── */}
        <SectionHeader title="Red razgovora" />
        <Caption
          text="Lični DM (2 nepročitane) · lična grupa · kanal startupa (pominjanje) · dugi pritisak = radnje"
          colors={colors}
        />
        <Card style={styles.taskRowsCard}>
          <HubGroupHeader
            group={{
              key: 'licno',
              title: 'Lično',
              startup: null,
              unreadCount: 2,
              mentionCount: 0,
              channels: k16Rows.slice(0, 2),
              collapsible: false,
              collapsed: false,
            }}
          />
          {k16Rows.map((row) => (
            <HubRow
              key={row._id}
              channel={row}
              now={demoNow}
              meId={KATALOG_CHAT_ME}
              place={row.startupId === null ? 'Lično' : 'Cluck Rush'}
              onPress={() => setK16Log(`Otvori razgovor: ${row.name || 'DM'}`)}
              onLongPress={() => setK16Actions(row)}
            />
          ))}
        </Card>
        {k16Log ? <Caption text={k16Log} colors={colors} /> : null}

        <SectionHeader title="Nova poruka, nova grupa, podešavanja" />
        <Caption text={'Sheet-ovi sa fixture ljudima; „greska" kao naziv grupe prikazuje grešku servera'} colors={colors} />
        <View style={styles.modeRow}>
          <Button label="Nova poruka" size="sm" variant="secondary" onPress={() => setK16DmOpen(true)} />
          <Button label="Nova grupa" size="sm" variant="secondary" onPress={() => setK16GroupOpen(true)} />
          <Button label="Grupa (vlasnik)" size="sm" variant="secondary" onPress={() => setK16Settings('owner')} />
          <Button label="Grupa (član)" size="sm" variant="secondary" onPress={() => setK16Settings('member')} />
        </View>

        <SectionHeader title="Poruke — ceo ekran" />
        <Caption text="Lično pa startupi (sklopivi), pretraga, nepročitano kroz NumberRoll. Stanje:" colors={colors} />
        <View style={styles.modeRow}>
          {(['ready', 'loading', 'empty', 'error'] as const).map((mode) => (
            <Button
              key={mode}
              label={{ ready: 'Podaci', loading: 'Učitavanje', empty: 'Prazno', error: 'Greška' }[mode]}
              size="sm"
              variant={k16Mode === mode ? 'default' : 'secondary'}
              onPress={() => setK16Mode(mode)}
            />
          ))}
        </View>
        <View style={[styles.inboxFrame, { borderColor: colors.border }]}>
          <ChatHubView
            now={demoNow}
            meId={KATALOG_CHAT_ME}
            safeArea={false}
            state={katalogHubState(k16Mode, k16Hub, () => setK16Mode('ready'))}
            groups={
              k16Mode === 'ready' ? hubGroups(k16Hub, { query: k16Query, collapsed: k16Collapsed }) : []
            }
            query={k16Query}
            onQueryChange={setK16Query}
            onToggleGroup={(key) => setK16Collapsed((current) => toggleHubCollapsed(current, key))}
            onOpen={(row) => setK16Log(`Otvori razgovor: ${row.name || 'DM'}`)}
            onLongPress={setK16Actions}
            onNewMessage={() => setK16DmOpen(true)}
            onNewGroup={() => setK16GroupOpen(true)}
            unreadTotal={k16Mode === 'ready' ? { unreadCount: 14 } : null}
          />
        </View>

        {/* Pokret kroz celu aplikaciju (K19): pritisak, sheet, liste, stablo, mehurić. */}
        <PokretK19Katalog />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Sheet-ovi Moj dan (K12) — fixture podaci, radnje se samo beleže. */}
      <RowActionsSheet
        target={actionsTarget}
        now={demoNow}
        onClose={() => setActionsTarget(null)}
        onOpen={(row) => {
          setActionsTarget(null);
          setK12Log(`Otvori: ${row.title}`);
        }}
        onToggleDone={(row, done) => {
          setActionsTarget(null);
          setK12Log(done ? `Završeno: ${row.title}` : `Vraćeno: ${row.title}`);
        }}
        onTogglePlan={(row) => {
          setActionsTarget(null);
          setK12Log(row.planned ? 'Uklonjeno iz Moj dan' : 'Dodato u Moj dan');
        }}
        onSetDue={() => {
          setActionsTarget(null);
          setK12Log('Rok je promenjen');
        }}
        onSetPriority={() => {
          setActionsTarget(null);
          setK12Log('Prioritet je promenjen');
        }}
        onMove={(_, direction) => {
          setActionsTarget(null);
          setK12Log(direction < 0 ? 'Pomeri gore' : 'Pomeri dole');
        }}
      />
      {/* Radnje u startupu (K18): status i „Priključi se" uz iste redove kao Moj dan. */}
      <RowActionsSheet
        target={k18Target}
        now={demoNow}
        onClose={() => setK18Target(null)}
        onOpen={(row) => {
          setK18Target(null);
          setK18Log(`Otvori: ${row.title}`);
        }}
        onToggleDone={(row, done) => {
          setK18Target(null);
          setK18Log(done ? `Završeno: ${row.title}` : `Vraćeno: ${row.title}`);
        }}
        onTogglePlan={(row) => {
          setK18Target(null);
          setK18Log(row.planned ? 'Uklonjeno iz Moj dan' : 'Dodato u Moj dan');
        }}
        onSetDue={() => {
          setK18Target(null);
          setK18Log('Rok je promenjen');
        }}
        onSetPriority={() => {
          setK18Target(null);
          setK18Log('Prioritet je promenjen');
        }}
        onSetStatus={(row, status) => {
          setK18Target(null);
          setK18Log(`Status: ${status}`);
        }}
        onJoin={() => {
          setK18Target(null);
          setK18Log('Priključio/la si se');
        }}
      />
      <TaskMetaSheet
        view={k18Meta}
        onViewChange={setK18Meta}
        onClose={() => setK18Meta(null)}
        now={demoNow}
        title="Landing za Q4"
        status="in_progress"
        priority="high"
        dueDate={k13Due}
        assigneesPerm={{ allowed: true, reason: 'Zadatak vodi kreator; ti možeš da se priključiš ili napustiš.' }}
        assignees={[{ profileId: 'p1', displayName: 'Ana Ilić', avatarUrl: null }]}
        isAssignee={false}
        onStatus={(status) => {
          setK18Meta(null);
          setK18Log(`Status: ${status}`);
        }}
        onPriority={(priority) => {
          setK18Meta(null);
          setK18Log(`Prioritet: ${priority}`);
        }}
        onDue={(due) => {
          setK18Meta(null);
          setK13Due(due);
          setK18Log('Rok je promenjen');
        }}
        onJoinLeave={() => {
          setK18Meta(null);
          setK18Log('Priključio/la si se');
        }}
      />
      <RokPlanSheet
        row={rokRow}
        now={demoNow}
        onClose={() => setRokRow(null)}
        onSetDue={() => {
          setRokRow(null);
          setK12Log('Rok je promenjen');
        }}
        onTogglePlan={(row) => {
          setRokRow(null);
          setK12Log(row.planned ? 'Uklonjeno iz Moj dan' : 'Dodato u Moj dan');
        }}
      />
      <QuickAddSheet
        visible={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        now={demoNow}
        startups={KATALOG_QUICK_ADD_STARTUPS}
        onSubmit={async (draft) => {
          if (draft.title.trim().toLowerCase() === 'greska') {
            throw new Error('Zadatak nije dodat. Pokušaj ponovo.');
          }
          setK12Log(`Dodato: ${draft.title.trim()}`);
        }}
      />
      <DatePickerSheet
        visible={k13DateOpen}
        value={k13Due}
        shortcuts
        now={demoNow}
        onSelect={(value) => {
          setK13Due(value);
          setK13DateOpen(false);
        }}
        onClose={() => setK13DateOpen(false)}
      />
      <TaskFiltersSheet
        visible={k13FiltersOpen}
        filters={k13Filters}
        startups={KATALOG_STARTUPS}
        resultCount={12}
        onChange={setK13Filters}
        onClose={() => setK13FiltersOpen(false)}
      />
      {/* Sheet-ovi Poruka (K16) — fixture podaci, radnje se samo beleže. */}
      <HubActionsSheet
        channel={k16Actions}
        onClose={() => setK16Actions(null)}
        onAction={(action, row) => {
          setK16Actions(null);
          const label = {
            open: 'Otvori razgovor',
            markRead: 'Označi kao pročitano',
            groupSettings: 'Podešavanja grupe',
            leaveGroup: 'Napusti grupu',
          }[action];
          setK16Log(`${label}: ${row.name || 'DM'}`);
        }}
      />
      <NewDmSheet
        open={k16DmOpen}
        onClose={() => setK16DmOpen(false)}
        people={{ status: 'ready', people: KATALOG_CHAT_PEOPLE }}
        pendingId={null}
        onPick={(personId) => {
          setK16DmOpen(false);
          setK16Log(`Lični razgovor sa: ${KATALOG_CHAT_PEOPLE.find((p) => p._id === personId)?.displayName}`);
        }}
      />
      <NewGroupSheet
        open={k16GroupOpen}
        onClose={() => setK16GroupOpen(false)}
        people={{ status: 'ready', people: KATALOG_CHAT_PEOPLE }}
        onCreate={async (name, memberIds) => {
          if (name.trim().toLowerCase() === 'greska') return 'Grupa nije napravljena.';
          setK16GroupOpen(false);
          setK16Log(`Grupa „${name}" (${memberIds.length + 1} članova)`);
          return null;
        }}
      />
      <GroupSettingsSheet
        open={k16Settings !== null}
        onClose={() => setK16Settings(null)}
        state={{
          status: 'ready',
          name: 'Vikend plan',
          isOwner: k16Settings !== 'member',
          members: KATALOG_CHAT_PEOPLE.slice(0, 2),
          people: KATALOG_CHAT_PEOPLE,
        }}
        onSave={async (name, memberIds) => {
          setK16Log(`Sačuvano: ${name} (${memberIds.length} drugih)`);
          return null;
        }}
        onLeave={async () => {
          setK16Log('Grupa je napuštena.');
          return null;
        }}
      />
      <PlanDaySheet
        visible={planOpen}
        onClose={() => setPlanOpen(false)}
        now={demoNow}
        state={{ status: 'ready', model: k12Plan }}
        onAdd={(row) => setK12Log(`Dodato u Moj dan: ${row.title}`)}
        onCarryOver={(keys) => setK12Log(`Vraćeno u danas: ${keys.length}`)}
        onDismiss={(keys) => setK12Log(`Sklonjeno: ${keys.length}`)}
      />
    </View>
  );
}

/** Swipe red za katalog: kartica sa naslovom i poslednjom radnjom. */
function KatalogSwipe({
  colors,
  right,
  left,
  title,
  subtitle,
}: {
  colors: ColorTokens;
  right?: SwipeAction;
  left?: SwipeAction;
  title: string;
  subtitle: string;
}) {
  return (
    <SwipeRow rightAction={right} leftAction={left}>
      <View
        accessible
        accessibilityLabel={`${title}. ${subtitle}`}
        {...swipeAccessibilityActions({ right, left })}
        style={[styles.swipeDemo, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[text.body, { color: colors.foreground }]}>{title}</Text>
        <Text style={[text.meta, { color: colors.mutedForeground }]}>{subtitle}</Text>
      </View>
    </SwipeRow>
  );
}

/** Red kataloga sa lokalnim stanjem kvačice (status prati „završeno“). */
function withDone(row: TaskRowModel, done: boolean): TaskRowModel {
  if (done) return { ...row, done: true, status: 'done' };
  return { ...row, done: false, status: row.status === 'done' ? 'next' : row.status };
}

/** Sitna oznaka iznad grupe primera. */
function Caption({ text: label, colors }: { text: string; colors: ColorTokens }) {
  return <Text style={[styles.caption, { color: colors.subtle }]}>{label}</Text>;
}

/** Zaglavlje ekrana — isti obrazac kao ostali ne-tab ekrani (ideje/zadatak). */
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
        style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: colors.muted }]}>
        <ChevronLeft size={24} color={colors.foreground} />
      </Pressable>
      <Text style={[styles.headerTitle, { color: colors.foreground }]}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  k13Chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: fontWeight.semibold,
    marginLeft: 2,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  themeRow: {
    gap: spacing.sm,
  },
  sectionLabel: {
    ...text.meta,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  segmented: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: radius.control,
    gap: 4,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  segmentLabel: {
    ...text.body,
    fontWeight: fontWeight.medium,
  },
  caption: {
    ...text.meta,
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  fullBtn: {
    marginTop: spacing.xs,
  },
  swatchWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  swatch: {
    width: 100,
    gap: 4,
  },
  swatchChip: {
    height: 52,
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
  },
  swatchName: {
    ...text.meta,
  },
  swatchHex: {
    ...text.meta,
    fontVariant: ['tabular-nums'],
  },
  typeCard: {
    gap: spacing.md,
  },
  rowsCard: {
    padding: 0,
    gap: 0,
    overflow: 'hidden',
  },
  avatarSizes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  fields: {
    gap: spacing.sm,
  },
  emptyBox: {
    height: 200,
  },
  fabBox: {
    height: 96,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pressDemo: {
    minHeight: MIN_TOUCH_TARGET + 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rollBox: {
    minWidth: 72,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
  },
  tabDemo: {
    flexDirection: 'row',
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabDemoItem: {
    flex: 1,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabDemoLabel: {
    fontSize: 11,
    fontWeight: fontWeight.medium,
  },
  swipeDemo: {
    minHeight: 64,
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 28,
  },
  dueLabel: {
    width: 110,
  },
  taskRowsCard: {
    paddingVertical: spacing.xs,
    paddingHorizontal: 0,
    gap: 0,
  },
  pendingDemo: {
    gap: spacing.sm,
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  inboxFrame: {
    height: 640,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  headerBox: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingVertical: spacing.sm,
  },
});
