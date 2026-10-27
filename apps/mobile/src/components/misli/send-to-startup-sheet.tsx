import { notesCountLabel, NOTE_SEND_HINT, NOTE_SEND_NO_STARTUP, NOTE_SEND_TITLE } from '@devotion/shared';
import { Check } from 'lucide-react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { StartupChip } from '@/components/me/startup-chip';
import { Button } from '@/components/ui/button';
import { Row } from '@/components/ui/row';
import { Sheet } from '@/components/ui/sheet';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { radius, text } from '@/theme/tokens';

/** Više od ovoliko naslova se sažima u „+ još N" — sheet nije lista za čitanje. */
const MAX_LISTED = 6;

export type SendTarget = { _id: string; name: string; logoUrl: string | null };

/**
 * „Pošalji u startup" (PROSTOR P7, K18): izbor ciljnog startupa i dugme
 * „Pošalji". Cilj je startup u kome sam aktivan član; tim dobija IDEJU u fazi
 * „Predlog", a original ostaje privatan (`thoughts.convertToIdeas`).
 *
 * Prezentaciona (podaci i radnja kroz props) da bi ušla u Dizajn katalog; slanje
 * radi `ThoughtConversionSheet`. Izbor cilja je grupa redova sa ulogom `radio`
 * (dodir ≥ 56 pt, stanje se čuje, ne samo vidi).
 */
export function SendToStartupSheet({
  visible,
  titles,
  targets,
  selectedId,
  busy,
  onSelect,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  /** Naslovi beleški koje se šalju (bar jedan). */
  titles: ReadonlyArray<string>;
  targets: ReadonlyArray<SendTarget>;
  selectedId: string | null;
  busy: boolean;
  onSelect: (id: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const count = titles.length;
  return (
    <Sheet visible={visible} onClose={onClose} maxHeight="85%" style={styles.sheet}>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>
        {NOTE_SEND_TITLE}
      </Text>
      <Text style={[styles.hint, { color: colors.mutedForeground }]}>{NOTE_SEND_HINT}</Text>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
        <View style={styles.titles}>
          {titles.slice(0, MAX_LISTED).map((title, index) => (
            <Text key={`${index}:${title}`} numberOfLines={1} style={[styles.titleLine, { color: colors.foreground }]}>
              {title}
            </Text>
          ))}
          {count > MAX_LISTED ? (
            <Text style={[styles.meta, { color: colors.mutedForeground }]}>
              + još {notesCountLabel(count - MAX_LISTED)}
            </Text>
          ) : null}
          {count > 1 ? (
            <Text style={[styles.meta, { color: colors.mutedForeground }]}>
              Veze između izabranih beleški se čuvaju i prenose u Ideje.
            </Text>
          ) : null}
        </View>

        {targets.length === 0 ? (
          <Text accessibilityRole="alert" style={[styles.empty, { color: colors.mutedForeground }]}>
            {NOTE_SEND_NO_STARTUP}
          </Text>
        ) : (
          <View accessibilityRole="radiogroup" accessibilityLabel="Startup u koji se šalje" style={styles.targets}>
            {targets.map((target) => {
              const selected = target._id === selectedId;
              return (
                <Row
                  key={target._id}
                  style={styles.targetRow}
                  icon={<StartupChip startup={target} size="md" />}
                  title={target.name}
                  showChevron={false}
                  disabled={false}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected, disabled: busy }}
                  value={selected ? <Check size={20} color={colors.primaryText} /> : undefined}
                  onPress={() => {
                    if (busy) return;
                    haptics.select();
                    onSelect(target._id);
                  }}
                />
              );
            })}
          </View>
        )}
      </ScrollView>

      <View style={styles.actions}>
        <Button label="Otkaži" variant="ghost" onPress={onClose} disabled={busy} style={styles.flexBtn} />
        <Button
          label={count <= 1 ? 'Pošalji' : `Pošalji (${count})`}
          onPress={onSubmit}
          loading={busy}
          disabled={selectedId === null || targets.length === 0}
          style={styles.flexBtn}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: 20 },
  heading: { ...text.title, marginBottom: 4 },
  hint: { ...text.body, marginBottom: 10 },
  scroll: { flexGrow: 0 },
  list: { gap: 12, paddingBottom: 4 },
  titles: { gap: 4 },
  titleLine: { ...text.body, fontWeight: '500' },
  meta: { ...text.meta },
  empty: { ...text.body, paddingVertical: 8 },
  targets: { gap: 2, marginHorizontal: -8 },
  targetRow: {
    paddingHorizontal: 8,
    borderRadius: radius.md,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 12,
  },
  flexBtn: { flex: 1 },
});
