import { hubUnreadLabel } from '@devotion/shared';
import { useRouter } from 'expo-router';
import { MessageCircle } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { UnreadPill } from '@/components/me/chat/hub-row';
import { Row } from '@/components/ui/row';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useQueryTolerant } from '@/hooks/use-query-tolerant';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { radius } from '@/theme/tokens';

/**
 * Red „Kanali" u Prostoru (K16, O5): ulaz u chat AKTIVNOG startupa (kanali,
 * direktne poruke i diskusije tima) sada kad je tab „Poruke" hub svih
 * razgovora. Nepročitano ovog startupa iz `chat.unreadSummary.byStartup` —
 * isti izvor kao bedž taba, a pad brojača samo sakrije broj.
 */
export function StartupChannelsRow({ startupId }: { startupId: Id<'startups'> }) {
  const colors = useThemeColors();
  const router = useRouter();
  const unread = useQueryTolerant(api.chat.unreadSummary, {});
  const count = unread?.byStartup.find((entry) => entry.startupId === startupId)?.unreadCount ?? 0;

  return (
    <Row
      title="Kanali"
      subtitle="Kanali, direktne poruke i diskusije tima"
      onPress={() => {
        haptics.tap();
        router.push('/kanali');
      }}
      accessibilityLabel={count > 0 ? `Kanali, ${hubUnreadLabel(count)}` : 'Kanali'}
      accessibilityHint="Otvara chat ovog startupa"
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      icon={
        <View style={[styles.iconChip, { backgroundColor: colors.accent }]}>
          <MessageCircle size={20} color={colors.primaryText} />
        </View>
      }
      value={
        count > 0 ? (
          <UnreadPill value={count} accessibilityLabel={hubUnreadLabel(count)} colors={colors} />
        ) : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 12,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  iconChip: {
    width: 36,
    height: 36,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
