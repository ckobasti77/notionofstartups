import { useAuthActions } from '@convex-dev/auth/react';
import {
  Activity,
  Bell,
  Brain,
  ChartColumn,
  ChevronRight,
  Lightbulb,
  Mail,
  Monitor,
  Moon,
  Settings,
  Sun,
  Users,
  Vote,
  type LucideIcon,
} from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { TabScreen } from '@/components/tab-screen';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAppTheme, type ThemePreference } from '@/theme/theme-provider';
import { fontWeight, radius } from '@/theme/tokens';

type MenuItem = {
  icon: LucideIcon;
  label: string;
  badge?: string;
};

const MENU: MenuItem[][] = [
  [
    { icon: Vote, label: 'Odobrenja', badge: '2' },
    { icon: ChartColumn, label: 'Puls' },
    { icon: Lightbulb, label: 'Ideje' },
    { icon: Brain, label: 'Misli' },
    { icon: Activity, label: 'Aktivnost' },
  ],
  [
    { icon: Users, label: 'Članovi tima' },
    { icon: Mail, label: 'Pozivnice' },
    { icon: Settings, label: 'Podešavanja' },
    { icon: Bell, label: 'Obaveštenja i zvuci' },
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
                  onPress={() => setPreference(option.value)}
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
        {MENU.map((group, groupIndex) => (
          <Card key={groupIndex} style={styles.menuCard}>
            {group.map((item, itemIndex) => {
              const Icon = item.icon;
              return (
                <Pressable
                  key={item.label}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  onPress={() => {}}
                  style={({ pressed }) => [
                    styles.row,
                    itemIndex > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                    pressed && { backgroundColor: colors.muted },
                  ]}>
                  <Icon size={20} color={colors.foreground} />
                  <Text style={[styles.rowLabel, { color: colors.foreground }]}>{item.label}</Text>
                  {item.badge ? <Badge label={item.badge} variant="destructive" /> : null}
                  <ChevronRight size={18} color={colors.mutedForeground} />
                </Pressable>
              );
            })}
          </Card>
        ))}

        <Button
          label="Odjavi se"
          variant="ghost"
          onPress={() => {
            void signOut();
          }}
          style={styles.signOut}
        />
      </ScrollView>
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
    fontSize: 14,
    fontWeight: fontWeight.medium,
  },
  menuCard: {
    padding: 0,
    gap: 0,
    overflow: 'hidden',
  },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: fontWeight.medium,
  },
  signOut: {
    marginTop: 4,
  },
});
