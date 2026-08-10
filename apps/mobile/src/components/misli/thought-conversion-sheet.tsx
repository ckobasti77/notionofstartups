import { useMutation } from 'convex/react';
import { useRouter } from 'expo-router';
import { ArrowDown, Lightbulb } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { misaoWord, thoughtDisplayTitle, vezaWord } from '@/lib/thought-layout';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, radius, text } from '@/theme/tokens';

/** Backend `MAX_BULK_ITEMS` — `convertToIdeas` prima najviše 50 misli. */
const MAX_BULK = 50;
/** Više od ovoliko naslova se sažima u „+ još N" — sheet nije lista za čitanje. */
const MAX_LISTED = 6;

/**
 * Misao za konverziju. Sa liste/detalja stiže pun dokument (naslovi se prikazuju);
 * multi-selekcija sa kanvasa nosi SAMO id-jeve (`selection` poruka), pa su detalji
 * opcioni — tada se prikazuje broj izabranih.
 */
export type ThoughtConversionNode = {
  _id: Id<'thoughtNodes'>;
  title?: string | null;
  text?: string;
  x?: number;
  y?: number;
};

/** Poruka uspeha sa srpskom množinom („1 ideja / 2 ideje / 5 ideja / 21 ideja"). */
function successMessage(ideaCount: number, edgeCount: number): string {
  const lastDigit = ideaCount % 10;
  const lastTwo = ideaCount % 100;
  let message: string;
  if (ideaCount === 1) {
    message = 'Ideja je kreirana. Originalna misao je ostala privatna.';
  } else if (lastDigit === 1 && lastTwo !== 11) {
    // Brojevi na -1 (21, 31, 41…) idu uz jedninu ženskog roda: „21 ideja je kreirana".
    message = `${ideaCount} ideja je kreirana. Originalne misli su ostale privatne.`;
  } else if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) {
    message = `${ideaCount} ideje su kreirane. Originalne misli su ostale privatne.`;
  } else {
    message = `${ideaCount} ideja je kreirano. Originalne misli su ostale privatne.`;
  }
  if (edgeCount > 0) {
    message += ` Preneto je i ${edgeCount} ${vezaWord(edgeCount)}.`;
  }
  return message;
}

/**
 * Korak 1 od 2 — misao postaje timska ideja (PARITET A1, uzor web
 * `thought-conversion-dialog.tsx`). Bez izbora destinacije: `convertToIdeas` uvek
 * cilja kanvas Ideja istog startupa; zadatak/beleška se prave iz odobrene ideje
 * (korak 2, na Idejama). Original se NE arhivira — misao ostaje privatna.
 */
export function ThoughtConversionSheet({
  open,
  startupId,
  nodes,
  onClose,
  onConverted,
}: {
  open: boolean;
  startupId: Id<'startups'>;
  nodes: ThoughtConversionNode[];
  onClose: () => void;
  /** Po uspehu (posle zatvaranja) — npr. kanvas čisti selekciju. */
  onConverted?: () => void;
}) {
  const colors = useThemeColors();
  const router = useRouter();
  const convertToIdeas = useMutation(api.thoughts.convertToIdeas);
  const [busy, setBusy] = useState(false);

  // Poslednji neprazan skup — telo ostaje tokom izlazne animacije sheet-a.
  const lastNodesRef = useRef<ThoughtConversionNode[]>([]);
  if (nodes.length > 0) lastNodesRef.current = nodes;
  const renderNodes = nodes.length > 0 ? nodes : lastNodesRef.current;

  // Isti redosled kojim server pravi ideje (y → x → _id) — da spisak u sheet-u
  // odgovara onome što će korisnik zateći na kanvasu Ideja.
  const ordered = useMemo(
    () =>
      [...renderNodes].sort(
        (a, b) =>
          (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0) || a._id.localeCompare(b._id),
      ),
    [renderNodes],
  );
  // Kanvas šalje samo id-jeve — bez naslova se prikazuje broj, ne prazan spisak.
  const detailsKnown = ordered.every((node) => node.title !== undefined);
  const count = ordered.length;

  if (count === 0) return null;

  const submit = async () => {
    if (busy) return;
    if (count > MAX_BULK) {
      haptics.warning();
      Alert.alert('Previše misli', `Odaberi najviše ${MAX_BULK} misli za slanje u Ideje.`);
      return;
    }
    setBusy(true);
    haptics.tap();
    try {
      const result = await convertToIdeas({
        startupId,
        nodeIds: ordered.map((node) => node._id),
      });
      haptics.success();
      onClose();
      onConverted?.();
      Alert.alert('Poslato u Ideje', successMessage(result.ideaIds.length, result.createdEdgeCount), [
        { text: 'U redu', style: 'cancel' },
        { text: 'Otvori Ideje', onPress: () => router.push({ pathname: '/ideje' }) },
      ]);
    } catch (error) {
      haptics.error();
      Alert.alert('Greška', accessErrorMessage(error, 'Misao nije poslata u Ideje.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={open} onClose={onClose} maxHeight="85%" style={styles.sheet}>
      <View style={styles.headRow}>
        <View style={[styles.stepPill, { backgroundColor: colors.muted }]}>
          <Text style={[styles.stepText, { color: colors.mutedForeground }]}>KORAK 1 OD 2</Text>
        </View>
      </View>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>
        Pošalji u Ideje
      </Text>
      <Text style={[styles.explain, { color: colors.mutedForeground }]}>
        Misao prvo postaje timska ideja — tim je vidi, komentariše i glasa. Zadatak ili
        beleška se prave iz odobrene ideje. Original ostaje privatan na tvom kanvasu.
      </Text>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
        {detailsKnown ? (
          <>
            {ordered.slice(0, MAX_LISTED).map((node) => (
              <View key={node._id} style={styles.itemRow}>
                <Lightbulb size={16} color={colors.warning} />
                <Text
                  numberOfLines={1}
                  style={[styles.itemTitle, { color: colors.foreground }]}>
                  {thoughtDisplayTitle(
                    { title: node.title ?? null, text: node.text ?? '' },
                    'Nova misao',
                  )}
                </Text>
              </View>
            ))}
            {count > MAX_LISTED ? (
              <Text style={[styles.moreText, { color: colors.mutedForeground }]}>
                + još {count - MAX_LISTED} {misaoWord(count - MAX_LISTED)}
              </Text>
            ) : null}
          </>
        ) : (
          <View style={styles.itemRow}>
            <ArrowDown size={16} color={colors.mutedForeground} />
            <Text style={[styles.itemTitle, { color: colors.foreground }]}>
              {count} {count === 1 ? 'izabrana misao' : count <= 4 ? 'izabrane misli' : 'izabranih misli'} sa kanvasa
            </Text>
          </View>
        )}
        {count > 1 ? (
          <Text style={[styles.moreText, { color: colors.mutedForeground }]}>
            Veze između izabranih misli se čuvaju i prenose u Ideje.
          </Text>
        ) : null}
      </ScrollView>

      <View style={styles.actions}>
        <Button label="Otkaži" variant="ghost" onPress={onClose} disabled={busy} style={styles.flexBtn} />
        <Button
          label={count === 1 ? 'Pošalji' : `Pošalji (${count})`}
          onPress={() => void submit()}
          loading={busy}
          style={styles.flexBtn}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: 20,
  },
  headRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  stepPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  stepText: {
    ...text.meta,
    letterSpacing: 0.4,
  },
  heading: {
    fontSize: 18,
    fontWeight: fontWeight.semibold,
    marginBottom: 6,
  },
  explain: {
    ...text.body,
    marginBottom: 10,
  },
  scroll: {
    flexGrow: 0,
  },
  list: {
    gap: 8,
    paddingBottom: 4,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemTitle: {
    ...text.body,
    flexShrink: 1,
  },
  moreText: {
    ...text.meta,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 12,
  },
  flexBtn: {
    flex: 1,
  },
});
