import { History, Lightbulb, Paperclip } from 'lucide-react-native';
import { StyleSheet, Text, View, type AccessibilityActionEvent } from 'react-native';

import { Button } from '@/components/ui/button';
import { Row } from '@/components/ui/row';
import { pageKindMeta } from '@/lib/page-kinds';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, text } from '@/theme/tokens';

import {
  recoveredExcerpts,
  restoreBlockReason,
  trashItemLocation,
  trashItemMeta,
  trashItemTitle,
  type RecoveredTrashItem,
  type RestorableTrashItem,
  type TrashItem,
} from './trash-model';

export type TrashRowProps = {
  item: TrashItem;
  /** Sat ekrana („pre N dana"); čita ga pozivalac, ne render. */
  now: number;
  /** Dok „Vrati"/„Ukloni" ovog reda radi — dugme pokazuje spinner. */
  busy: boolean;
  /** Radi neki DRUGI red — dugme ovog reda je onemogućeno (jedna radnja odjednom). */
  locked?: boolean;
  onRestore: (item: RestorableTrashItem) => void;
  onDismiss: (item: RecoveredTrashItem) => void;
};

/**
 * Red Korpe (PROSTOR P3, plan K07 §5.4): ikonica vrste, naslov, mesto, meta
 * „Obrisao/la X · pre N dana" i „Vrati" desno (ili „Ukloni" za Oporavljeno).
 *
 * Za čitač ekrana red je JEDNA stavka: labela sklapa naslov, mesto, metu i
 * razlog, a radnja reda je „Vrati"/„Ukloni" (dvostruki dodir ili meni radnji).
 * Vidljivo dugme je zato sakriveno iz stabla pristupačnosti — inače bi red bio
 * 4–6 zaustavljanja, a naslov bi se čuo dvaput.
 */
export function TrashRow({ item, now, busy, locked = false, onRestore, onDismiss }: TrashRowProps) {
  const colors = useThemeColors();
  const title = trashItemTitle(item);
  const location = trashItemLocation(item);
  const meta = trashItemMeta(item, now);
  const blocked = item.kind === 'recovered' ? null : restoreBlockReason(item);
  const Icon =
    item.kind === 'page'
      ? pageKindMeta(item.pageKind).icon
      : item.kind === 'idea'
        ? Lightbulb
        : item.kind === 'file'
          ? Paperclip
          : History;
  const excerpts = item.kind === 'recovered' ? recoveredExcerpts(item) : null;

  // Jedina radnja reda (ili nijedna: Oporavljeno bez prava, onemogućeno „Vrati").
  const action: { label: string; run: () => void } | null =
    item.kind === 'recovered'
      ? item.canDismiss
        ? { label: 'Ukloni', run: () => onDismiss(item) }
        : null
      : blocked === null
        ? { label: 'Vrati', run: () => onRestore(item) }
        : null;
  const actionAvailable = action !== null && !busy && !locked;

  const button =
    item.kind === 'recovered' ? (
      item.canDismiss ? (
        <Button
          label="Ukloni"
          variant="ghost"
          loading={busy}
          disabled={locked}
          onPress={() => onDismiss(item)}
        />
      ) : undefined
    ) : (
      <Button
        label="Vrati"
        variant="secondary"
        loading={busy}
        disabled={blocked !== null || locked}
        onPress={() => onRestore(item)}
      />
    );

  const a11yLabel = [
    title,
    location,
    meta,
    blocked,
    excerpts && excerpts.lines.length > 0
      ? excerpts.lines.map((line) => `${line.author}: ${line.excerpt}`).join('. ')
      : null,
    excerpts && excerpts.more > 0 ? `još ${excerpts.more}` : null,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <View
      accessible
      accessibilityLabel={a11yLabel}
      accessibilityHint={
        actionAvailable && action ? `Dvaput dodirni: ${action.label.toLowerCase()}.` : undefined
      }
      accessibilityState={{ busy, disabled: !actionAvailable }}
      accessibilityActions={actionAvailable && action ? [{ name: 'activate', label: action.label }] : []}
      onAccessibilityAction={(event: AccessibilityActionEvent) => {
        if (event.nativeEvent.actionName === 'activate' && actionAvailable) action?.run();
      }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Row
          icon={
            <View style={styles.icon}>
              <Icon size={20} color={colors.mutedForeground} />
            </View>
          }
          title={title}
          titleNumberOfLines={2}
          showChevron={false}
          style={styles.row}
          subtitle={
            <View style={styles.details}>
              {location ? (
                <Text numberOfLines={2} style={[styles.meta, { color: colors.mutedForeground }]}>
                  {location}
                </Text>
              ) : null}
              <Text numberOfLines={2} style={[styles.meta, { color: colors.mutedForeground }]}>
                {meta}
              </Text>
              {blocked ? (
                <Text style={[styles.meta, { color: colors.mutedForeground }]}>{blocked}</Text>
              ) : null}
              {excerpts && excerpts.lines.length > 0 ? (
                <View style={[styles.excerpts, { borderLeftColor: colors.border }]}>
                  {excerpts.lines.map((line) => (
                    <Text
                      key={line.key}
                      numberOfLines={2}
                      style={[styles.meta, { color: colors.mutedForeground }]}>
                      <Text style={[styles.author, { color: colors.foreground }]}>{line.author}:</Text>{' '}
                      {line.excerpt}
                    </Text>
                  ))}
                  {excerpts.more > 0 ? (
                    <Text style={[styles.meta, { color: colors.mutedForeground }]}>+{excerpts.more}</Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          }
          value={button}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'flex-start',
    paddingVertical: 12,
  },
  // Ikonica stoji u visini prvog reda naslova (22), ne na sredini višeredog reda.
  icon: {
    height: 22,
    justifyContent: 'center',
  },
  details: {
    flex: 1,
    gap: 2,
  },
  meta: {
    ...text.meta,
  },
  author: {
    ...text.meta,
    fontWeight: fontWeight.semibold,
  },
  excerpts: {
    marginTop: 4,
    paddingLeft: 10,
    borderLeftWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
});
