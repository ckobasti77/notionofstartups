import { Component, Fragment, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LAYOUT_ANIMATION_MAX_ROWS } from '@/components/me/my-day/my-day-model';
import { exitFade, listLayout, useListEntering } from '@/components/motion';
import { Button } from '@/components/ui/button';
import { Row } from '@/components/ui/row';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, text } from '@/theme/tokens';

import { BLOCK_TEXT } from './command-blocks-model';

/**
 * Zajednički delovi blokova Komandnog centra (PROSTOR K19, plan K07 §5.2):
 * granica greške jednog bloka, red greške, prazno stanje bloka i red-veza
 * („Sve u Zadacima", „Svi moji zadaci · N"…). Redovi liste već stoje u razmaku
 * ekrana 16, pa red ne dodaje svoj (isto kao redovi Prostora).
 */

/**
 * Red greške bloka (DIZAJN-SMIRENJE §5.5): „<Šta> nije učitano." + „Pokušaj ponovo".
 * Jedan red, ne ekran — blok koji padne ne obara susede, a redovi Prostora ostaju.
 */
export function BlockErrorRow({ title, onRetry }: { title: string; onRetry: () => void }) {
  const colors = useThemeColors();
  return (
    <View accessibilityRole="alert" style={styles.errorRow}>
      <Text style={[styles.errorText, { color: colors.mutedForeground }]}>{title}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${BLOCK_TEXT.retry}: ${title}`}
        onPress={() => {
          haptics.tap();
          onRetry();
        }}
        style={({ pressed }) => [styles.retry, pressed && { backgroundColor: colors.muted }]}>
        <Text style={[styles.retryText, { color: colors.primaryText }]}>{BLOCK_TEXT.retry}</Text>
      </Pressable>
    </View>
  );
}

/**
 * Granica greške jednog bloka: Convex upiti bacaju u render kad server prijavi
 * grešku, pa se ovde hvataju. „Pokušaj ponovo" ponovo MONTIRA blok kroz `key`
 * (novi upiti, novo stanje). Svaki blok ima SOPSTVENU granicu.
 */
export class CommandBlockBoundary extends Component<
  { title: string; children: ReactNode },
  { error: Error | null; attempt: number }
> {
  state: { error: Error | null; attempt: number } = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error !== null) {
      return (
        <BlockErrorRow
          title={this.props.title}
          onRetry={() => this.setState((state) => ({ error: null, attempt: state.attempt + 1 }))}
        />
      );
    }
    return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
  }
}

/** Prazno stanje bloka (DIZAJN-SMIRENJE §5.5): jedan red teksta, bez okvira i ilustracije. */
export function BlockEmpty({
  text: message,
  actionLabel,
  onAction,
}: {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const colors = useThemeColors();
  return (
    <View style={styles.empty}>
      <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{message}</Text>
      {actionLabel && onAction ? (
        <Button label={actionLabel} variant="ghost" size="md" onPress={onAction} />
      ) : null}
    </View>
  );
}

/** Red-veza na dnu bloka: strelica desno, vrednost (npr. „još 3") prigušeno. */
export function BlockLinkRow({
  title,
  value,
  hint,
  onPress,
}: {
  title: string;
  value?: string;
  hint?: string;
  onPress: () => void;
}) {
  return (
    <Row
      title={title}
      value={value}
      accessibilityLabel={value ? `${title}, ${value}` : title}
      accessibilityHint={hint}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      style={styles.row}
    />
  );
}

/**
 * Pokret liste bloka (plan K07 §8): ulaz samo pri prvom punjenju (`useListEntering`,
 * `resetKey` je novo punjenje — učitavanje, filter), izlaz i premeštanje redova
 * samo ispod granice `LAYOUT_ANIMATION_MAX_ROWS`. Smanjen pokret = samo neprozirnost.
 */
export function useBlockMotion(visibleRows: number, resetKey: string) {
  const reduced = useReducedMotion();
  const entering = useListEntering(reduced, resetKey);
  const animate = visibleRows <= LAYOUT_ANIMATION_MAX_ROWS;
  return {
    entering,
    layout: animate ? listLayout(reduced) : undefined,
    exiting: animate ? exitFade(reduced) : undefined,
  };
}

/** Razmak ekrana 16 već nosi lista — red ga ne dodaje drugi put (kao redovi Prostora). */
export const blockRowStyle = {
  minHeight: MIN_TOUCH_TARGET + 4,
  paddingHorizontal: 4,
  paddingVertical: 6,
  borderRadius: radius.md,
} as const;

const styles = StyleSheet.create({
  errorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 4,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 4,
  },
  errorText: {
    ...text.body,
  },
  retry: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: radius.md,
  },
  retryText: {
    ...text.body,
    fontWeight: fontWeight.semibold,
  },
  empty: {
    gap: 4,
    paddingHorizontal: 4,
    paddingVertical: 12,
    alignItems: 'flex-start',
  },
  emptyText: {
    ...text.body,
  },
  row: {
    ...blockRowStyle,
  },
});
