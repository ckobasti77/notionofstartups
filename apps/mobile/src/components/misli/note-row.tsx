import { StyleSheet, Text, View } from 'react-native';

import { StartupChip } from '@/components/me/startup-chip';
import { Row } from '@/components/ui/row';
import { useThemeColors } from '@/theme/theme-provider';
import { text } from '@/theme/tokens';

import type { NoteRowModel } from './misli-model';

/**
 * Red liste Beleški (PROSTOR P7, K18) na `Row` primitivi: naslov, isečak i meta
 * (čip startupa ili „Lično" + „pre N"). Podbeleška je uvučena po nivou, sa
 * tankom vodećom linijom. Dodir otvara belešku, dugi pritisak radnje.
 *
 * Prezentaciona: sve stiže iz `NoteRowModel` (ide i u Dizajn katalog).
 */
export function NoteRow({
  model,
  onOpen,
  onLongPress,
}: {
  model: NoteRowModel;
  onOpen: () => void;
  onLongPress?: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Row
      style={[
        styles.row,
        model.depth > 0 && {
          marginLeft: model.indent,
          paddingLeft: 12,
          borderLeftWidth: StyleSheet.hairlineWidth,
          borderLeftColor: colors.border,
        },
      ]}
      title={model.title}
      subtitle={
        <View style={styles.sub}>
          {model.preview ? (
            <Text numberOfLines={1} style={[styles.preview, { color: colors.mutedForeground }]}>
              {model.preview}
            </Text>
          ) : null}
          <View style={styles.meta}>
            <StartupChip startup={model.startup} size="sm" />
            <Text numberOfLines={1} style={[styles.metaText, { color: colors.mutedForeground }]}>
              {model.meta}
            </Text>
          </View>
        </View>
      }
      showChevron={false}
      onPress={onOpen}
      onLongPress={onLongPress}
      accessibilityLabel={model.label}
      accessibilityHint={onLongPress ? 'Dodir otvara belešku, dugi pritisak otvara radnje.' : 'Otvara belešku.'}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    paddingHorizontal: 0,
    paddingVertical: 6,
  },
  sub: {
    flex: 1,
    gap: 2,
  },
  preview: {
    ...text.body,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    ...text.meta,
    flexShrink: 1,
  },
});
