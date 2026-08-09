import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Skeleton } from '@/components/ui/skeleton';
import { useThemeColors } from '@/theme/theme-provider';
import { radius } from '@/theme/tokens';

/**
 * Skeletoni u OBLIKU sadržaja koji stiže.
 *
 * Pravilo: skeleton mora da ima isti raspored i iste mere kao red/kartica koja ga
 * smenjuje — istu visinu, istu ikonicu levo, isti broj linija. Tada je prelaz
 * (`LoadingSwap`) čist crossfade: ništa se ne pomera, samo se prozirnost menja.
 * Generični sivi pravougaonik bi značio skok rasporeda u trenutku dolaska podataka.
 *
 * Širine linija su namerno nejednake (i deterministički izvedene iz indeksa, ne
 * nasumične) — jednake linije izgledaju kao tabela, a ne kao tekst.
 */

/** Deterministički „prirodne" širine naslova/podnaslova po redu. */
const TITLE_WIDTHS = ['62%', '48%', '71%', '55%', '66%'] as const;
const SUBTITLE_WIDTHS = ['84%', '73%', '90%', '66%', '80%'] as const;

function titleWidth(index: number) {
  return TITLE_WIDTHS[index % TITLE_WIDTHS.length];
}
function subtitleWidth(index: number) {
  return SUBTITLE_WIDTHS[index % SUBTITLE_WIDTHS.length];
}

export type SkeletonListProps = {
  count: number;
  item: (index: number) => React.ReactNode;
  gap?: number;
  style?: StyleProp<ViewStyle>;
};

/** Ponavlja jedan oblik `count` puta. */
export function SkeletonList({ count, item, gap, style }: SkeletonListProps) {
  return (
    <View style={[gap === undefined ? null : { gap }, style]}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index}>{item(index)}</View>
      ))}
    </View>
  );
}

export type SkeletonRowProps = {
  index?: number;
  /** Levi slot — mora da odgovara onome što red stvarno ima. */
  leading?: 'none' | 'icon' | 'square' | 'circle';
  subtitle?: boolean;
  /** Desni slot: strelica (›) ili kratka vrednost/badge. */
  trailing?: 'none' | 'chevron' | 'value';
};

/**
 * Oblik `ui/row.tsx` — iste mere (visina 56, padding 16, razmak 12), pa red i
 * skeleton stoje na istom pikselu.
 */
export function SkeletonRow({
  index = 0,
  leading = 'none',
  subtitle = false,
  trailing = 'none',
}: SkeletonRowProps) {
  return (
    <View style={styles.row}>
      {leading === 'icon' ? <Skeleton width={20} height={20} borderRadius={radius.sm} /> : null}
      {leading === 'square' ? (
        <Skeleton width={44} height={44} borderRadius={radius.control} />
      ) : null}
      {leading === 'circle' ? <Skeleton width={44} height={44} borderRadius={radius.pill} /> : null}
      <View style={styles.rowBody}>
        <Skeleton width={titleWidth(index)} height={16} />
        {subtitle ? <Skeleton width={subtitleWidth(index)} height={12} /> : null}
      </View>
      {trailing === 'chevron' ? <Skeleton width={10} height={18} borderRadius={radius.sm} /> : null}
      {trailing === 'value' ? <Skeleton width={36} height={14} /> : null}
    </View>
  );
}

/** Okvir kartice (površina + ivica + radijus) — sadržaj prosleđuje pozivalac. */
export function SkeletonCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useThemeColors();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
        style,
      ]}>
      {children}
    </View>
  );
}

/** Oblik `danas/task-card.tsx`: naslov + stack izvršilaca, pa red meta-pilula. */
export function SkeletonTaskCard({ index = 0 }: { index?: number }) {
  return (
    <SkeletonCard style={styles.taskCard}>
      <View style={styles.taskTitleRow}>
        <Skeleton width={titleWidth(index)} height={16} />
        <View style={styles.grow} />
        <Skeleton width={26} height={26} borderRadius={radius.pill} />
      </View>
      <View style={styles.taskMeta}>
        <Skeleton width={72} height={20} borderRadius={radius.pill} />
        <Skeleton width={56} height={20} borderRadius={radius.pill} />
        <Skeleton width={44} height={20} borderRadius={radius.pill} />
      </View>
    </SkeletonCard>
  );
}

/** Oblik kartice ideje: naslov, dve linije teksta, podnožje sa autorom i glasovima. */
export function SkeletonIdeaCard({ index = 0 }: { index?: number }) {
  return (
    <SkeletonCard style={styles.ideaCard}>
      <Skeleton width={titleWidth(index)} height={16} />
      <Skeleton width="100%" height={14} />
      <Skeleton width={subtitleWidth(index)} height={14} />
      <View style={styles.ideaFooter}>
        <Skeleton width={22} height={22} borderRadius={radius.pill} />
        <Skeleton width={84} height={12} />
        <View style={styles.grow} />
        <Skeleton width={72} height={28} borderRadius={radius.control} />
      </View>
    </SkeletonCard>
  );
}

/** Oblik mehura poruke; `own` ga gura desno kao i pravu poruku. */
export function SkeletonMessage({ index = 0, own = false }: { index?: number; own?: boolean }) {
  const widths = ['58%', '74%', '42%', '66%'] as const;
  return (
    <View style={[styles.message, own ? styles.messageOwn : styles.messageOther]}>
      {own ? null : <Skeleton width={28} height={28} borderRadius={radius.pill} />}
      <Skeleton
        width={widths[index % widths.length]}
        height={index % 3 === 0 ? 56 : 38}
        borderRadius={radius.xl}
      />
    </View>
  );
}

/** Blok teksta — za čitanje stranice/beleške. */
export function SkeletonParagraph({ lines = 4 }: { lines?: number }) {
  return (
    <View style={styles.paragraph}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          width={index === lines - 1 ? '52%' : index % 3 === 1 ? '92%' : '100%'}
          height={14}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grow: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  rowBody: {
    flex: 1,
    gap: 8,
  },
  card: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  taskCard: {
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    minHeight: 64,
  },
  taskTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  taskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ideaCard: {
    gap: 8,
    padding: 12,
  },
  ideaFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  message: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  messageOwn: {
    justifyContent: 'flex-end',
  },
  messageOther: {
    justifyContent: 'flex-start',
  },
  paragraph: {
    gap: 10,
  },
});
