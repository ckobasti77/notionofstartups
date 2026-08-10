import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Pencil, Reply, Trash2 } from 'lucide-react-native';

import { Sheet } from '@/components/ui/sheet';
import { haptics } from '@/lib/haptics';
import { QUICK_REACTIONS, type ChatMessage } from '@/lib/chat';
import type { Id } from '@/convex/_generated/dataModel';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, type ColorTokens } from '@/theme/tokens';

const EDIT_WINDOW_MS = 15 * 60 * 1_000;

/**
 * Akcioni sheet na long-press poruke: red brzih reakcija + odgovor, izmena i
 * brisanje. Jedan `Modal` za celu listu — otvara ga poruka koja nije `null`.
 * „Izmeni" se nudi samo za sopstvene tekstualne poruke u prozoru od 15 min;
 * „Obriši" za sopstvene, a administratoru i za tuđe — isto pravilo kao web
 * `message-row.tsx` i kao sam backend (`chat.deleteMessage`).
 */
export function MessageActionsSheet({
  message,
  currentProfileId,
  isAdmin,
  onReact,
  onReply,
  onEdit,
  onDelete,
  onClose,
}: {
  message: ChatMessage | null;
  currentProfileId: Id<'profiles'>;
  /** Administrator moderira tuđe poruke (backend to već dozvoljava). */
  isAdmin: boolean;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const colors = useThemeColors();

  const isOwn = message !== null && message.authorProfileId === currentProfileId;
  const canEdit =
    message !== null &&
    isOwn &&
    message.kind === 'text' &&
    Date.now() - message.createdAt < EDIT_WINDOW_MS;
  const canDelete = message !== null && (isOwn || isAdmin);

  // Sheet nema unutrašnji skrol, pa se prevlači bilo gde po njemu — ne samo po ručki.
  return (
    <Sheet visible={message !== null} onClose={onClose} dragAnywhere>
      <View style={[styles.reactions, { borderBottomColor: colors.border }]}>
        {QUICK_REACTIONS.map((emoji) => (
          <Pressable
            key={emoji}
            accessibilityRole="button"
            accessibilityLabel={`Reaguj sa ${emoji}`}
            onPress={() => {
              haptics.tap();
              onReact(emoji);
            }}
            style={({ pressed }) => [
              styles.reaction,
              pressed && { backgroundColor: colors.muted },
            ]}>
            <Text style={styles.emoji}>{emoji}</Text>
          </Pressable>
        ))}
      </View>

      <ActionRow
        icon={<Reply size={20} color={colors.foreground} />}
        label="Odgovori"
        onPress={onReply}
        colors={colors}
      />
      {canEdit ? (
        <ActionRow
          icon={<Pencil size={20} color={colors.foreground} />}
          label="Izmeni"
          onPress={onEdit}
          colors={colors}
        />
      ) : null}
      {canDelete ? (
        <ActionRow
          icon={<Trash2 size={20} color={colors.destructive} />}
          label={isOwn ? 'Obriši' : 'Obriši (moderacija)'}
          destructive
          onPress={onDelete}
          colors={colors}
        />
      ) : null}
    </Sheet>
  );
}

function ActionRow({
  icon,
  label,
  onPress,
  destructive,
  colors,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  colors: ColorTokens;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      // Brisanje je destruktivno — upozoravajuća haptika, ne obična potvrda dodira.
      onPress={() => {
        if (destructive) haptics.warning();
        else haptics.tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.actionRow,
        pressed && { backgroundColor: colors.muted },
      ]}>
      {icon}
      <Text
        style={[
          styles.actionLabel,
          { color: destructive ? colors.destructive : colors.foreground },
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  reactions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  reaction: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 24,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: MIN_TOUCH_TARGET + 4,
    paddingHorizontal: 20,
  },
  actionLabel: {
    fontSize: 16,
    fontWeight: fontWeight.medium,
  },
});
