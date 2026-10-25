import { ChevronRight } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { NumberRoll } from '@/components/motion';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { haptics } from '@/lib/haptics';
import { SPRINGS } from '@/theme/motion';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, text } from '@/theme/tokens';

import { StartupChip } from './startup-chip';

export type MeSectionHeaderProps = {
  title: string;
  count: number;
  /** `danger` za „Prekoračeno" (status nosi i reč, ne samo boja). */
  tone?: 'default' | 'danger';
  /** Čip startupa u rasporedu „po startupu"; `null` = „Lično"; bez propa nema čipa. */
  startup?: { name: string; logoUrl?: string | null } | null;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
};

/**
 * Naslov sekcije ličnog nivoa (K12), par web `components/me/section-header.tsx`:
 * overline + broj koji se kotrlja (`NumberRoll`, trenutak 5). Sklopiva sekcija
 * (Blokirano, Završeno danas) je dugme sa `expanded` stanjem; strelica se
 * okreće springom `snappy` (smanjen pokret: odmah, bez rotacije).
 */
export function MeSectionHeader({
  title,
  count,
  tone = 'default',
  startup,
  collapsible = false,
  collapsed = false,
  onToggle,
}: MeSectionHeaderProps) {
  const colors = useThemeColors();
  const labelColor = tone === 'danger' ? colors.danger : colors.mutedForeground;

  const content = (
    <>
      {collapsible ? <Chevron collapsed={collapsed} color={colors.mutedForeground} /> : null}
      {startup !== undefined ? <StartupChip startup={startup} size="sm" /> : null}
      <Text numberOfLines={1} style={[styles.label, { color: labelColor }]}>
        {title}
      </Text>
      <NumberRoll
        value={count}
        style={[styles.count, { color: tone === 'danger' ? colors.danger : colors.foreground }]}
        accessibilityLabel={String(count)}
      />
    </>
  );

  if (collapsible && onToggle) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
        accessibilityLabel={`${title}, ${count}`}
        accessibilityHint={collapsed ? 'Prikazuje stavke sekcije' : 'Sklapa sekciju'}
        onPress={() => {
          haptics.select();
          onToggle();
        }}
        style={({ pressed }) => [styles.container, pressed && { backgroundColor: colors.muted }]}>
        {content}
      </Pressable>
    );
  }

  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={`${title}, ${count}`}
      style={styles.container}>
      {content}
    </View>
  );
}

function Chevron({ collapsed, color }: { collapsed: boolean; color: string }) {
  const reduced = useReducedMotion();
  const turn = useSharedValue(collapsed ? 0 : 1);
  const mounted = useRef(false);
  useEffect(() => {
    const target = collapsed ? 0 : 1;
    if (!mounted.current) {
      mounted.current = true;
      turn.value = target;
      return;
    }
    // Smanjen pokret: bez rotacije (transform) — strelica odmah menja smer.
    turn.value = reduced ? target : withSpring(target, SPRINGS.snappy);
  }, [collapsed, reduced, turn]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 90}deg` }] }));
  return (
    <Animated.View style={style}>
      <ChevronRight size={18} color={color} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  label: {
    ...text.meta,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    flexShrink: 1,
  },
  count: {
    ...text.meta,
    fontWeight: fontWeight.bold,
    fontVariant: ['tabular-nums'],
  },
});
