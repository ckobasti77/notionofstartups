import { useRouter } from 'expo-router';
import {
  Bell,
  Check,
  ChevronLeft,
  Clock,
  Flame,
  Inbox,
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
import { useAppTheme, useThemeColors, type ThemePreference } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, spacing, text, type ColorTokens } from '@/theme/tokens';

const noop = () => {};

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Svetlo', icon: Sun },
  { value: 'dark', label: 'Tamno', icon: Moon },
  { value: 'system', label: 'Sistemsko', icon: Monitor },
];

const AVATAR_NAMES = ['Marko Jovanović', 'Ana Anić', 'Petar Petrović', 'Jelena Kovač', 'Nikola Ilić'];

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
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
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
});
