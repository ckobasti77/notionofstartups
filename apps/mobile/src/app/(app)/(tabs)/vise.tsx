import { useAuthActions } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import {
  Activity,
  Bell,
  Brain,
  ChartColumn,
  FlaskConical,
  KeyRound,
  Lightbulb,
  ListTodo,
  Mail,
  Monitor,
  Moon,
  Palette,
  Settings,
  ShieldCheck,
  Sun,
  UserRound,
  Users,
  TriangleAlert,
  Vote,
  type LucideIcon,
} from 'lucide-react-native';
import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { TabScreen } from '@/components/tab-screen';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Row } from '@/components/ui/row';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import { haptics } from '@/lib/haptics';
import { useAppTheme, useThemeColors, type ThemePreference } from '@/theme/theme-provider';
import { fontWeight, radius } from '@/theme/tokens';

/** Tipizovana ruta expo-routera (isti tip koji `router.push` prima). */
type AppRoute = Parameters<ReturnType<typeof useRouter>['push']>[0];

type MenuItem = {
  icon: LucideIcon;
  label: string;
  badge?: string;
  /** Ruta na tap; bez nje je stavka još placeholder (faze 2–4). */
  route?: AppRoute;
  /** Vidljiva samo administratorima (`profile.role === 'admin'`). */
  adminOnly?: boolean;
  /** Još nema ekran — prikazuje se prigušeno i nedodirljivo, sa oznakom „uskoro". */
  soon?: boolean;
};

const MENU: MenuItem[][] = [
  [
    { icon: Vote, label: 'Odobrenja', route: '/odobrenja' },
    { icon: ListTodo, label: 'Svi zadaci', route: '/zadaci' },
    { icon: ChartColumn, label: 'Puls', route: '/puls' },
    { icon: Lightbulb, label: 'Ideje', route: '/ideje' },
    { icon: Brain, label: 'Misli', route: '/misli' },
    { icon: Activity, label: 'Aktivnost', route: '/aktivnost' },
  ],
  [
    { icon: UserRound, label: 'Moj profil', route: '/profil' },
    { icon: Users, label: 'Članovi tima', route: '/clanovi', adminOnly: true },
    { icon: Mail, label: 'Pozivnice', route: '/pozivnice', adminOnly: true },
    { icon: ShieldCheck, label: 'Administracija startupa', route: '/admin-startup', adminOnly: true },
    { icon: KeyRound, label: 'Lozinke', route: '/lozinke', adminOnly: true },
    { icon: Settings, label: 'Podešavanja', soon: true },
    { icon: Bell, label: 'Obaveštenja i zvuci', route: '/podesavanja-obavestenja' },
  ],
];

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Svetlo', icon: Sun },
  { value: 'dark', label: 'Tamno', icon: Moon },
  { value: 'system', label: 'Sistemsko', icon: Monitor },
];

/**
 * Tab „Više" — sporedne rute i podešavanja (docs/mobile/02-EKRANI.md, sekcija 8).
 * Ovde je i prekidač teme (svetlo/tamno/sistemsko) koji vozi `useAppTheme`.
 */
export default function ViseScreen() {
  const { colors, preference, setPreference } = useAppTheme();
  const { signOut } = useAuthActions();
  const router = useRouter();
  const { activeStartupId } = useActiveStartup();

  // Živi badge za „Odobrenja": glasanja o brisanju + ugnježdavanje ideja
  // (`overview.pendingCount`) + ugnježdavanje stranica (`listNestingInbox`).
  const arg = activeStartupId ? { startupId: activeStartupId } : 'skip';
  const overview = useQuery(api.collaboration.overview, arg);
  const nestingInbox = useQuery(api.areasV2.listNestingInbox, arg);
  const approvalsCount = (overview?.pendingCount ?? 0) + (nestingInbox?.incoming.length ?? 0);

  // Admin stavke (Članovi, Pozivnice) se skrivaju ako korisnik nije admin.
  const profile = useQuery(api.profiles.getCurrent, {});
  const isAdmin = profile?.role === 'admin';
  const visibleMenu = MENU.map((group) =>
    group.filter((item) => !item.adminOnly || isAdmin),
  ).filter((group) => group.length > 0);

  const badgeFor = (item: MenuItem): string | undefined => {
    if (item.label === 'Odobrenja') {
      return approvalsCount > 0 ? String(approvalsCount) : undefined;
    }
    return item.badge;
  };

  return (
    <TabScreen title="Više">
      <ScrollView contentContainerStyle={styles.content}>
        {/* Prekidač teme */}
        <View style={styles.section}>
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
                  onPress={() => {
                    if (!active) haptics.select();
                    setPreference(option.value);
                  }}
                  style={[
                    styles.segment,
                    active && { backgroundColor: colors.card, borderColor: colors.border },
                  ]}>
                  <Icon
                    size={18}
                    color={active ? colors.foreground : colors.mutedForeground}
                  />
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

        {/* Menu grupe */}
        {visibleMenu.map((group, groupIndex) => (
          <Card key={groupIndex} style={styles.menuCard}>
            {group.map((item, itemIndex) => {
              const Icon = item.icon;
              const badge = badgeFor(item);
              const topBorder =
                itemIndex > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border };

              // Stavka bez ekrana: `disabled` Row — prigušen, bez chevron-a, bez
              // pressed efekta, sa oznakom „uskoro" (rn-review: mrtva stavka u meniju).
              if (item.soon) {
                return (
                  <Row
                    key={item.label}
                    disabled
                    icon={<Icon size={20} color={colors.mutedForeground} />}
                    title={item.label}
                    value={
                      <View style={[styles.soonPill, { backgroundColor: colors.muted }]}>
                        <Text style={[styles.soonText, { color: colors.mutedForeground }]}>uskoro</Text>
                      </View>
                    }
                    accessibilityLabel={`${item.label} — uskoro, nedostupno`}
                    style={topBorder || undefined}
                  />
                );
              }

              return (
                <Row
                  key={item.label}
                  icon={<Icon size={20} color={colors.foreground} />}
                  title={item.label}
                  value={badge ? <Badge label={badge} variant="destructive" /> : undefined}
                  onPress={() => {
                    if (item.route) {
                      haptics.tap();
                      router.push(item.route);
                    }
                  }}
                  accessibilityLabel={badge ? `${item.label}, ${badge} na čekanju` : item.label}
                  style={topBorder || undefined}
                />
              );
            })}
          </Card>
        ))}

        {/* TODO(Faza 3, §5.1): privremeni ulaz u merni prototip editora.
            Samo u dev buildu — isti tretman kao dizajn katalog ispod; dev alat u
            produkcijskom meniju je bio nalaz revizije. Izbriši ovaj blok (i rutu
            `editor-spike` + ekran) posle merenja. */}
        {__DEV__ ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Editor proba (merenje)"
            onPress={() => {
              const spikeRoute: string = '/editor-spike';
              router.push(spikeRoute as AppRoute);
            }}
            style={({ pressed }) => [
              styles.spike,
              { borderColor: colors.border },
              pressed && { backgroundColor: colors.muted },
            ]}>
            <FlaskConical size={18} color={colors.mutedForeground} />
            <Text style={[styles.spikeLabel, { color: colors.mutedForeground }]}>
              Editor proba (merenje)
            </Text>
          </Pressable>
        ) : null}

        {/* Dizajn katalog — samo u dev buildu. Privremeno tokom redizajna. */}
        {__DEV__ ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dizajn katalog (dev)"
            onPress={() => {
              const route: string = '/dizajn-katalog';
              router.push(route as AppRoute);
            }}
            style={({ pressed }) => [
              styles.spike,
              { borderColor: colors.border },
              pressed && { backgroundColor: colors.muted },
            ]}>
            <Palette size={18} color={colors.mutedForeground} />
            <Text style={[styles.spikeLabel, { color: colors.mutedForeground }]}>
              Dizajn katalog (dev)
            </Text>
          </Pressable>
        ) : null}

        <Button
          label="Odjavi se"
          variant="ghost"
          // Odjava izbacuje iz aplikacije — upozoravajuća haptika, ne obična potvrda.
          onPress={() => {
            haptics.warning();
            void signOut();
          }}
          style={styles.signOut}
        />
      </ScrollView>
    </TabScreen>
  );
}

/**
 * Tri upita ovog taba (`collaboration.overview`, `areasV2.listNestingInbox`,
 * `profiles.getCurrent`) prolaze kroz `requireStartupMember` i bacaju kad je
 * `activeStartupId` zastareo ili je korisnik uklonjen iz tima. Bez granice ekran
 * bi pao bez puta nazad — a „Više" je jedini ulaz u odjavu.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <ViseErrorState message={error.message} onRetry={retry} />;
}

function ViseErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  return (
    <TabScreen title="Više">
      <EmptyState
        icon={<TriangleAlert size={40} color={colors.destructive} />}
        title="Meni se ne može učitati"
        description={message || 'Došlo je do greške pri učitavanju menija.'}
        actionLabel="Pokušaj ponovo"
        onAction={onRetry}
      />
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 20,
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  segmented: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: radius.lg,
    gap: 4,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  segmentLabel: {
    fontSize: 16,
    fontWeight: fontWeight.medium,
  },
  menuCard: {
    padding: 0,
    gap: 0,
    overflow: 'hidden',
  },
  soonPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  soonText: {
    fontSize: 13,
    fontWeight: fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  signOut: {
    marginTop: 4,
  },
  spike: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  spikeLabel: {
    fontSize: 16,
    fontWeight: fontWeight.medium,
  },
});
