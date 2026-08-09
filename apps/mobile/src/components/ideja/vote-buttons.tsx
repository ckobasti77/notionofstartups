import { ThumbsDown, ThumbsUp } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, text } from '@/theme/tokens';

export type IdeaVote = 'up' | 'down' | null;

/**
 * Glasanje za/protiv ideje — jedan par dugmadi za sva tri mesta gde se glasa
 * (lista ideja, sheet čvora u canvasu, ekran diskusije). Ranije su postojale dve
 * skoro identične kopije; sad je jedna, sa dve visine.
 *
 * BOJA JE PRIGUŠENA NAMERNO: glas je sekundarna akcija. Aktivan glas nosi tint
 * podlogu (~12% alfa) i obojenu ikonicu i broj — nikad punu zelenu/crvenu traku
 * preko pola kartice, jer bi u listi nadjačala sam sadržaj ideje.
 *
 * Ponovni isti glas ga poništava — to radi server (`ideas.vote` je toggle), ovde
 * se samo prikazuje trenutno stanje.
 */
export function VoteButtons({
  upvotes,
  downvotes,
  userVote,
  disabled = false,
  size = 'md',
  onVote,
}: {
  upvotes: number;
  downvotes: number;
  userVote: IdeaVote;
  disabled?: boolean;
  /** `sm` u listi (kompaktno, širina po sadržaju), `md` na ekranu ideje (pola širine). */
  size?: 'sm' | 'md';
  onVote: (vote: 'up' | 'down') => void;
}) {
  const colors = useThemeColors();
  return (
    <View style={styles.row}>
      <VoteButton
        kind="up"
        count={upvotes}
        active={userVote === 'up'}
        tint={colors.success}
        disabled={disabled}
        size={size}
        label="Glas za"
        onPress={() => onVote('up')}
      />
      <VoteButton
        kind="down"
        count={downvotes}
        active={userVote === 'down'}
        tint={colors.danger}
        disabled={disabled}
        size={size}
        label="Glas protiv"
        onPress={() => onVote('down')}
      />
    </View>
  );
}

function VoteButton({
  kind,
  count,
  active,
  tint,
  disabled,
  size,
  label,
  onPress,
}: {
  kind: 'up' | 'down';
  count: number;
  active: boolean;
  /** Boja glasa (success / danger) — koristi se SAMO na ikonici, broju i tintu. */
  tint: string;
  disabled: boolean;
  size: 'sm' | 'md';
  label: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const Icon = kind === 'up' ? ThumbsUp : ThumbsDown;
  // Aktivno: tint podloga (12% alfa) + obojen sadržaj. Neaktivno: sivo-skala.
  const fg = active ? tint : colors.mutedForeground;
  const bg = active ? `${tint}1F` : colors.secondary;
  const borderColor = active ? `${tint}55` : colors.border;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, trenutno ${count}`}
      accessibilityHint={active ? 'Ponovni tap poništava glas' : undefined}
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        size === 'md' && styles.buttonMd,
        {
          backgroundColor: bg,
          borderColor,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}>
      <Icon size={size === 'md' ? 20 : 16} color={fg} />
      <Text style={[styles.count, { color: fg }]}>{count}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  // `sm` — širina po sadržaju: u listi glas stoji sa strane, ne razvlači se
  // preko pola kartice.
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minWidth: 56,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 10,
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
  },
  // `md` — primarna akcija ekrana ideje: dva jednaka dugmeta u punoj širini.
  buttonMd: {
    flex: 1,
    gap: 8,
    minHeight: MIN_TOUCH_TARGET + 4,
    borderRadius: radius.card,
  },
  count: {
    ...text.body,
    fontWeight: fontWeight.semibold,
    fontVariant: ['tabular-nums'],
  },
});
