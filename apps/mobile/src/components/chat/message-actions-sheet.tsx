import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pencil, Reply, Trash2 } from 'lucide-react-native';

import { QUICK_REACTIONS, type ChatMessage } from '@/lib/chat';
import type { Id } from '@/convex/_generated/dataModel';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, type ColorTokens } from '@/theme/tokens';

const EDIT_WINDOW_MS = 15 * 60 * 1_000;

/**
 * Akcioni sheet na long-press poruke: red brzih reakcija + odgovor, izmena i
 * brisanje. Jedan `Modal` za celu listu — otvara ga poruka koja nije `null`.
 * „Izmeni" se nudi samo za sopstvene tekstualne poruke u prozoru od 15 min;
 * „Obriši" samo za sopstvene (admin moderacija tuđih ide preko weba).
 */
export function MessageActionsSheet({
  message,
  currentProfileId,
  onReact,
  onReply,
  onEdit,
  onDelete,
  onClose,
}: {
  message: ChatMessage | null;
  currentProfileId: Id<'profiles'>;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  const isOwn = message !== null && message.authorProfileId === currentProfileId;
  const canEdit =
    message !== null &&
    isOwn &&
    message.kind === 'text' &&
    Date.now() - message.createdAt < EDIT_WINDOW_MS;
  const canDelete = isOwn;

  return (
    <Modal
      visible={message !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <Pressable
        accessibilityLabel="Zatvori"
        style={styles.backdrop}
        onPress={onClose}
      />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.popover,
            borderColor: colors.border,
            paddingBottom: insets.bottom + 12,
          },
        ]}>
        <View style={[styles.reactions, { borderBottomColor: colors.border }]}>
          {QUICK_REACTIONS.map((emoji) => (
            <Pressable
              key={emoji}
              accessibilityRole="button"
              accessibilityLabel={`Reaguj sa ${emoji}`}
              onPress={() => onReact(emoji)}
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
            label="Obriši"
            destructive
            onPress={onDelete}
            colors={colors}
          />
        ) : null}
      </View>
    </Modal>
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
      onPress={onPress}
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
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
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
