import { Link2, Unlink, Vote } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Row } from '@/components/ui/row';
import type { CheckpointEndpoint } from '@/lib/canvas-endpoints';
import { useThemeColors } from '@/theme/theme-provider';
import { MIN_TOUCH_TARGET, radius, text } from '@/theme/tokens';

/**
 * Jedan sused čvora — canvas veza kartica, relacija stranica ili checkpoint veza.
 * Sve stiže uz `node:actions` / `selection` poruku iz embeda (`PageNodeEdgeDetail`),
 * pa native ni za listu veza ne radi dodatni upit.
 */
export type NodeEdgeRow = {
  _id: string;
  kind: 'canvas' | 'relation' | 'checkpoint';
  /** Id ČVORA druge strane: pageId za karticu, `checkpoint:<id>` za korak. */
  otherId: string;
  otherTitle: string;
  label: string | null;
  canDelete: boolean;
  canRequestDeletion: boolean;
  /** Samo za `checkpoint` — „Poništi" raskida pravi NOVU vezu, pa mu trebaju endpointi. */
  endpoints?: { source: CheckpointEndpoint; target: CheckpointEndpoint };
};

/** Podnaslov reda: naziv veze ako postoji, inače šta je ta vrsta odnosa. */
function edgeSubtitle(edge: NodeEdgeRow): string {
  if (edge.label) return edge.label;
  if (edge.kind === 'relation') return 'Relacija — uklanja se na stranici';
  if (edge.kind === 'checkpoint') return 'Veza koraka';
  return 'Veza';
}

/**
 * Sekcija „Veze" u sheet-u čvora — ČIST PRIKAZ, bez ijedne mutacije (K4).
 *
 * Zašto se povezivanje i raskidanje rade ODAVDE, a ne na platnu: handle tačkica je
 * ~8 px, a linija veze 1–2 px i najčešće ide ispod kartica — oboje je prstom promašaj
 * za promašajem. Veza se zato pravi tapom (ovde se bira izvor, cilj se tapne na
 * kanvasu), a raskida iz imenovane liste gde je svaki sused red od 56pt.
 *
 * Zašto deljeno: K3 je ovo napisao za karticu stranice, a K4 traži isto za checkpoint
 * oblačić. Razlika je samo u tome KOJU mutaciju pozivalac veže na ✕.
 */
export function NodeEdgesSection({
  edges,
  canConnect,
  connectSubtitle,
  emptyNote,
  busy,
  onConnect,
  onBreak,
  onRequestDeletion,
}: {
  edges: NodeEdgeRow[];
  /** Sme li se odavde praviti veza (autor stavke + ima koga da poveže). */
  canConnect: boolean;
  /** Objašnjenje ispod „Poveži sa…" — i kad je dozvoljeno i kad nije. */
  connectSubtitle: string;
  /** Tekst kad lista suseda je prazna — prazna lista bi izgledala kao kvar. */
  emptyNote: string;
  /** Ključ reda koji je u toku, ili `null` — jedna brava za ceo sheet. */
  busy: string | null;
  onConnect: () => void;
  onBreak: (edge: NodeEdgeRow) => void;
  onRequestDeletion: (edge: NodeEdgeRow) => void;
}) {
  const colors = useThemeColors();
  return (
    <View>
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Veze</Text>
      <Row
        title="Poveži sa…"
        subtitle={connectSubtitle}
        onPress={onConnect}
        disabled={busy !== null || !canConnect}
        showChevron={false}
        style={styles.row}
        icon={<Link2 size={20} color={colors.mutedForeground} />}
      />

      {edges.length === 0 ? (
        <Text style={[styles.note, { color: colors.mutedForeground }]}>{emptyNote}</Text>
      ) : (
        <View style={styles.list}>
          {edges.map((edge) => (
            <Row
              key={edge._id}
              title={edge.otherTitle}
              titleNumberOfLines={2}
              subtitle={edgeSubtitle(edge)}
              showChevron={false}
              style={styles.row}
              value={
                busy === edge._id ? (
                  <ActivityIndicator color={colors.primary} />
                ) : edge.kind === 'relation' ? undefined : edge.canDelete ? (
                  <EdgeButton
                    label={`Raskini vezu sa „${edge.otherTitle}"`}
                    disabled={busy !== null}
                    onPress={() => onBreak(edge)}>
                    <Unlink size={20} color={colors.destructive} />
                  </EdgeButton>
                ) : edge.canRequestDeletion ? (
                  <EdgeButton
                    label={`Zatraži brisanje veze sa „${edge.otherTitle}"`}
                    disabled={busy !== null}
                    onPress={() => onRequestDeletion(edge)}>
                    <Vote size={20} color={colors.mutedForeground} />
                  </EdgeButton>
                ) : undefined
              }
            />
          ))}
        </View>
      )}
    </View>
  );
}

/** Dugme u redu veze — 44pt meta, jer je ✕ na 20px ikonici prstom promašaj. */
function EdgeButton({
  label,
  disabled,
  onPress,
  children,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.edgeBtn,
        disabled && styles.edgeBtnDisabled,
        pressed && { backgroundColor: colors.muted },
      ]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    ...text.meta,
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 4,
  },
  list: {
    gap: 2,
  },
  row: {
    paddingHorizontal: 8,
    borderRadius: radius.md,
  },
  note: {
    ...text.body,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  edgeBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
  },
  edgeBtnDisabled: {
    opacity: 0.4,
  },
});
