import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Copy, Pencil, Reply, Trash2 } from 'lucide-react-native';

import { Sheet } from '@/components/ui/sheet';
import { haptics } from '@/lib/haptics';
import { QUICK_REACTIONS, type ChatMessage } from '@/lib/chat';
import type { Id } from '@/convex/_generated/dataModel';
// Jedna konstanta za ceo proizvod (nalaz A.1): fajl uvozi samo `convex/values`,
// pa je bezbedan i za RN i za pregledač. Web `message-row.tsx` uvozi istu.
import { CHAT_EDIT_WINDOW_MS } from '@/convex/lib/validators';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, type ColorTokens } from '@/theme/tokens';

/**
 * Akcioni sheet na long-press poruke: red brzih reakcija + kopiranje, odgovor,
 * izmena i brisanje. Jedan `Modal` za celu listu — otvara ga poruka koja nije
 * `null`.
 *
 * „Izmeni" se nudi za SVAKU sopstvenu poruku, i onu sa prilogom (backend
 * `normalizeMessageBody` izričito dozvoljava prazan caption), tačno kao web
 * `message-row.tsx:59`. Prozor od 15 minuta se proverava NA DODIR, ne u renderu:
 * red koji tiho nestane ne objasni ništa, a poruka objasni.
 *
 * „Kopiraj tekst" je ovde, a ne kao `selectable` na mehuriću: na Androidu dugi
 * pritisak nad `selectable` tekstom pokreće native selekciju i pojede
 * `onLongPress` — jedini ulaz u ovaj sheet.
 */
export function MessageActionsSheet({
  message,
  currentProfileId,
  isAdmin,
  onReact,
  onCopy,
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
  onCopy: () => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const colors = useThemeColors();

  const isOwn = message !== null && message.authorProfileId === currentProfileId;
  const canCopy = message !== null && !message.deleted && message.body.trim().length > 0;
  const canEdit = message !== null && isOwn && !message.deleted;
  const canDelete = message !== null && !message.deleted && (isOwn || isAdmin);

  function requestEdit() {
    if (message === null) return;
    if (Date.now() - message.createdAt >= CHAT_EDIT_WINDOW_MS) {
      // Doslovno web tekst (`message-row.tsx:64`) — ista granica, isto objašnjenje.
      Alert.alert('Izmena', 'Poruka se može izmeniti samo u prvih 15 minuta.');
      return;
    }
    onEdit();
  }

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
      {canCopy ? (
        <ActionRow
          icon={<Copy size={20} color={colors.foreground} />}
          label="Kopiraj tekst"
          onPress={onCopy}
          colors={colors}
        />
      ) : null}
      {canEdit ? (
        <ActionRow
          icon={<Pencil size={20} color={colors.foreground} />}
          label="Izmeni"
          onPress={requestEdit}
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
