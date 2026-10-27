import { useAuthActions } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import {
  Bell,
  FlaskConical,
  History,
  KeyRound,
  Mail,
  Monitor,
  Moon,
  Palette,
  Settings,
  Sun,
  TriangleAlert,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { TabScreen } from '@/components/tab-screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Button } from '@/components/ui/button';
import { Row } from '@/components/ui/row';
import { SectionHeader } from '@/components/ui/section-header';
import { api } from '@/convex/_generated/api';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { useUndoStack } from '@/lib/undo';
import { useAppTheme, useThemeColors, type ThemePreference } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, text } from '@/theme/tokens';

/** Tipizovana ruta expo-routera (isti tip koji `router.push` prima). */
type AppRoute = Parameters<ReturnType<typeof useRouter>['push']>[0];

type MenuItem = {
  icon: LucideIcon;
  label: string;
  route: AppRoute;
  /** Vidljiva samo administratorima (`profile.role === 'admin'`). */
  adminOnly?: boolean;
};

/**
 * Grupa „Tim" (PROSTOR P18, plan K07 §4.3). „Podešavanja startupa" (K20) vide
 * svi članovi: ekran sam pokazuje samo ono što član sme (oblasti), a naziv,
 * opis i logo menja admin. „Članovi tima" NIJE `adminOnly`: `startups.listMembers`
 * je iza `requireStartupMember`, a admin-RADNJE su gejtovane unutar ekrana.
 */
const TEAM_MENU: MenuItem[] = [
  { icon: Settings, label: 'Podešavanja startupa', route: '/admin-startup' },
  { icon: Users, label: 'Članovi tima', route: '/clanovi' },
  { icon: Mail, label: 'Pozivnice', route: '/pozivnice', adminOnly: true },
  { icon: KeyRound, label: 'Lozinke', route: '/lozinke', adminOnly: true },
];

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Svetlo', icon: Sun },
  { value: 'dark', label: 'Tamno', icon: Moon },
  { value: 'system', label: 'Sistemsko', icon: Monitor },
];

/**
 * Tab „Više" — SAMO nalog i administracija (PROSTOR P18, plan K07 §4.3):
 * grupa „Nalog" (Moj profil · Obaveštenja i zvuci · Tema), grupa „Tim"
 * (Podešavanja startupa · Članovi tima · Pozivnice · Lozinke), grupa „Ostalo"
 * (Istorija radnji) i „Odjavi se". Sadržaj startupa (Zadaci, Ideje, Puls,
 * Aktivnost, Korpa) je u Prostoru, Moji zadaci i Beleške u zaglavlju Danas —
 * tabela „staro → novo" je u `docs/PROSTOR-PROGRESS.md` (K09).
 * Grupe su naslov sekcije + redovi, ne kartice (DIZAJN-SMIRENJE U4).
 */
export default function ViseScreen() {
  const { colors, preference, setPreference } = useAppTheme();
  const { signOut } = useAuthActions();
  const router = useRouter();

  // Admin stavke (Pozivnice, Lozinke) se skrivaju ako korisnik nije admin.
  const profile = useQuery(api.profiles.getCurrent, {});
  const isAdmin = profile?.role === 'admin';
  const teamItems = TEAM_MENU.filter((item) => !item.adminOnly || isAdmin);

  // Broj stavki u steku „Poništi" (PARITET-REVIZIJA C12) — desna VREDNOST reda kao
  // prigušen tekst, ne `Badge`: ovo nije posao koji čeka odgovor.
  const undoCount = useUndoStack().length;

  const open = (route: AppRoute) => {
    haptics.tap();
    router.push(route);
  };

  const menuRow = (item: MenuItem) => {
    const Icon = item.icon;
    return (
      <Row
        key={item.label}
        icon={<Icon size={20} color={colors.mutedForeground} />}
        title={item.label}
        onPress={() => open(item.route)}
        style={styles.row}
      />
    );
  };

  return (
    <TabScreen title="Više">
      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <SectionHeader title="Nalog" />
          {menuRow({ icon: UserRound, label: 'Moj profil', route: '/profil' })}
          {menuRow({ icon: Bell, label: 'Obaveštenja i zvuci', route: '/podesavanja-obavestenja' })}
          <View style={styles.themeBlock}>
            <Text style={[styles.themeLabel, { color: colors.foreground }]}>Tema</Text>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel="Tema"
              style={[styles.segmented, { backgroundColor: colors.muted }]}>
              {THEME_OPTIONS.map((option) => {
                const active = preference === option.value;
                const Icon = option.icon;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active, checked: active }}
                    accessibilityLabel={option.label}
                    onPress={() => {
                      if (!active) haptics.select();
                      setPreference(option.value);
                    }}
                    style={[
                      styles.segment,
                      active && { backgroundColor: colors.card, borderColor: colors.border },
                    ]}>
                    <Icon size={18} color={active ? colors.foreground : colors.mutedForeground} />
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
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
        </View>

        <View>
          <SectionHeader title="Tim" />
          {teamItems.map(menuRow)}
        </View>

        <View>
          <SectionHeader title="Ostalo" />
          <Row
            icon={<History size={20} color={colors.mutedForeground} />}
            title="Istorija radnji"
            value={undoCount > 0 ? String(undoCount) : undefined}
            accessibilityLabel={
              undoCount > 0 ? `Istorija radnji, ${undoCount} za poništavanje` : 'Istorija radnji'
            }
            onPress={() => open('/istorija')}
            style={styles.row}
          />
        </View>

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
 * Upit ovog taba (`profiles.getCurrent`) i zaglavlje sa startupom mogu da bace
 * kad je `activeStartupId` zastareo ili je korisnik uklonjen iz tima. Bez
 * granice ekran bi pao bez puta nazad — a „Više" je jedini ulaz u odjavu. Ekran
 * greške zato NE crta `TabScreen` (njegov `AppHeader` ima upite koji bi pali
 * istom greškom), nego goli `ScreenHeader`.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <ViseErrorState message={accessErrorMessage(error, 'Proveri vezu i pokušaj ponovo.')} onRetry={retry} />;
}

function ViseErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Više" titleSize="display" />
      <EmptyState
        icon={<TriangleAlert size={20} color={colors.destructive} />}
        title="Meni nije učitan."
        description={message || 'Proveri vezu i pokušaj ponovo.'}
        actionLabel="Pokušaj ponovo"
        onAction={onRetry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 32,
    gap: 24,
  },
  // Lista ekrana već ima razmak 16 — red ga ne dodaje drugi put.
  row: {
    minHeight: MIN_TOUCH_TARGET + 4,
    paddingHorizontal: 4,
    borderRadius: radius.md,
  },
  themeBlock: {
    gap: 8,
    paddingHorizontal: 4,
    paddingTop: 8,
  },
  themeLabel: {
    ...text.body,
    fontWeight: fontWeight.medium,
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
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  segmentLabel: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: fontWeight.medium,
  },
  signOut: {
    marginTop: 4,
  },
  spike: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  spikeLabel: {
    fontSize: 16,
    fontWeight: fontWeight.medium,
  },
});
