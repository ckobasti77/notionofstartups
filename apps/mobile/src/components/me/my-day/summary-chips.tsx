import { formatCount } from '@devotion/shared';
import { Hourglass, Inbox, MessageCircle, type LucideIcon } from 'lucide-react-native';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { PressableScale } from '@/components/motion';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, text } from '@/theme/tokens';

export type MyDaySummaryChipsProps = {
  /** `null` = brojač nije spreman ili je upit pao (čip se ne prikazuje). */
  inbox: number | null;
  chat: number | null;
  pending: number | null;
  onOpenInbox: () => void;
  onOpenChat: () => void;
  onOpenPending: () => void;
};

/**
 * Sažeti čipovi ispod zaglavlja Moj dan (plan K07 §1.2 i E11) — telefonski
 * par web desne kolone (ispod `xl` i na webu su čipovi): „Inbox n",
 * „Poruke n", „Čeka tebe n". Čip se vidi samo kad ima nešto (> 0); upit koji
 * padne samo sakrije svoj čip.
 */
export function MyDaySummaryChips({
  inbox,
  chat,
  pending,
  onOpenInbox,
  onOpenChat,
  onOpenPending,
}: MyDaySummaryChipsProps) {
  const colors = useThemeColors();
  const chips: { key: string; label: string; icon: LucideIcon; count: number | null; onPress: () => void; a11y: string }[] = [
    { key: 'inbox', label: 'Inbox', icon: Inbox, count: inbox, onPress: onOpenInbox, a11y: 'nepročitanih obaveštenja' },
    { key: 'chat', label: 'Poruke', icon: MessageCircle, count: chat, onPress: onOpenChat, a11y: 'nepročitanih poruka' },
    { key: 'pending', label: 'Čeka tebe', icon: Hourglass, count: pending, onPress: onOpenPending, a11y: 'čeka tvoju odluku' },
  ].filter((chip) => chip.count !== null && chip.count > 0);
  if (chips.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel="Sažetak"
      style={styles.scroll}
      contentContainerStyle={styles.row}>
      {chips.map(({ key, label, icon: Icon, count, onPress, a11y }) => (
        <PressableScale
          key={key}
          haptic="tap"
          accessibilityRole="button"
          accessibilityLabel={`${label}, ${count ?? 0} ${a11y}`}
          onPress={onPress}
          style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Icon size={16} color={colors.mutedForeground} />
          <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
          <Text style={[styles.count, { color: colors.foreground }]}>{formatCount(count ?? 0)}</Text>
        </PressableScale>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    marginHorizontal: -16,
    flexGrow: 0,
  },
  row: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: {
    ...text.body,
  },
  count: {
    ...text.body,
    fontWeight: fontWeight.bold,
    fontVariant: ['tabular-nums'],
  },
});
