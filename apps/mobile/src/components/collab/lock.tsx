import { Lock } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import {
  LOCK_NOTICE,
  LOCK_NOTICE_TASK,
  lockedByLabel,
} from '@/components/collab/collab-model';
import { useThemeColors } from '@/theme/theme-provider';
import { radius, text } from '@/theme/tokens';

/**
 * Oznaka „Zaključano" (ikonica + tekst) za meta red. `accessibilityHint` nosi ko
 * je zaključao i kad; boja je prigušena — zaključano je stanje, ne upozorenje.
 */
export function LockBadge({
  lockedByName,
  lockedAt,
  now,
}: {
  lockedByName: string | null;
  lockedAt: number | null;
  now: number;
}) {
  const colors = useThemeColors();
  return (
    <View
      accessible
      accessibilityLabel="Zaključano"
      accessibilityHint={lockedByLabel({ lockedByName, lockedAt, now })}
      style={styles.badge}>
      <Lock size={13} color={colors.mutedForeground} />
      <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>Zaključano</Text>
    </View>
  );
}

/**
 * Traka ispod naslova kad je stranica zaključana, a ti ne smeš da menjaš (K07
 * §5.6): razlog i šta ipak možeš. Zadatak ima svoj tekst (izvršilac menja status).
 */
export function LockNotice({ subject = 'page' }: { subject?: 'page' | 'task' }) {
  const colors = useThemeColors();
  return (
    <View
      accessible
      accessibilityRole="text"
      style={[styles.notice, { backgroundColor: colors.muted }]}>
      <Lock size={16} color={colors.mutedForeground} />
      <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
        {subject === 'task' ? LOCK_NOTICE_TASK : LOCK_NOTICE}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgeText: {
    ...text.meta,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  noticeText: {
    ...text.body,
    flex: 1,
  },
});
