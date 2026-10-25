import { ChevronDown, ChevronRight, FileText, Plus, Shuffle } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { enterFadeUp, enterRise, exitFade, listLayout, useListEntering } from '@/components/motion';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { FAB } from '@/components/ui/fab';
import { IconButton } from '@/components/ui/icon-button';
import { SectionHeader } from '@/components/ui/section-header';
import { Sheet } from '@/components/ui/sheet';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, text, type ColorTokens } from '@/theme/tokens';

/** Fixture za katalog K19 — ništa ne ide na server. */
const DEMO_ITEMS = ['Pošalji ponudu pekari Kifla', 'Snimi reel za novi meni', 'Popravi QR kodove za stolove'];
const DEMO_ARRIVAL = ['Odgovori polaznicama', 'Uporedi cene alata', 'Plan objava za novembar'];
const DEMO_BRANCH = ['Plan objava za novembar', 'Reel za novi meni', 'Saradnja sa influenserima'];
const DEMO_MESSAGES = ['Stigao je ugovor, šaljem ti ga.', 'Može sutra u 10?', 'Super, hvala!'];

function Caption({ label, colors }: { label: string; colors: ColorTokens }) {
  return <Text style={[styles.caption, { color: colors.subtle }]}>{label}</Text>;
}

/**
 * Dizajn katalog — pokret kroz celu aplikaciju (K19): pritisak dugmadi, FAB-a i
 * kartica, sheet na `smooth` springu, layout tranzicije lista i stabla, ulaz
 * pristigle poruke. Probaj i sa uključenim „Smanji pokret" (samo neprozirnost).
 */
export function PokretK19Katalog() {
  const colors = useThemeColors();
  const reduced = useReducedMotion();
  const [log, setLog] = useState('Dodirni dugme, FAB ili karticu.');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [items, setItems] = useState(DEMO_ITEMS);
  const [round, setRound] = useState(0);
  const [branchOpen, setBranchOpen] = useState(false);
  const [messages, setMessages] = useState(DEMO_MESSAGES.slice(0, 1));
  const entering = useListEntering(reduced, round);
  const layout = useMemo(() => listLayout(reduced), [reduced]);

  return (
    <>
      <SectionHeader title="Pokret svuda (K19) — pritisak" />
      <Caption
        label="Dugme, ikonica-dugme, FAB i kartica se utisnu na dodir (0,97 → spring nazad). Pritisnut izgled ostaje i u smanjenom pokretu."
        colors={colors}
      />
      <View style={styles.row}>
        <Button label="Isplaniraj dan" size="sm" onPress={() => setLog('Dugme: Isplaniraj dan')} />
        <Button label="Otkaži" size="sm" variant="ghost" onPress={() => setLog('Dugme: Otkaži')} />
        <IconButton accessibilityLabel="Dodaj" onPress={() => setLog('Ikonica-dugme: Dodaj')}>
          <Plus size={20} color={colors.foreground} />
        </IconButton>
        <FAB
          icon={Plus}
          accessibilityLabel="Novi zadatak"
          onPress={() => setLog('FAB: Novi zadatak')}
          style={styles.inlineFab}
        />
      </View>
      <Card
        accessibilityLabel="Otvori karticu"
        onPress={() => {
          haptics.tap();
          setLog('Kartica: otvorena');
        }}>
        <CardTitle>Kartica koja se otvara</CardTitle>
        <CardDescription>Kartica sa `onPress` je dodirljiva i utisne se kao dugme.</CardDescription>
      </Card>
      <Text style={[styles.log, { color: colors.mutedForeground }]}>{log}</Text>

      <SectionHeader title="Sheet — smooth spring" />
      <Caption label="Isti spring kao web panel (smooth, bez odskoka); izlaz kraći. Smanjen pokret: samo pretapanje." colors={colors} />
      <Button label="Otvori sheet" variant="secondary" onPress={() => setSheetOpen(true)} />

      <SectionHeader title="Lista — layout tranzicije" />
      <Caption label="Ulaz sa stagger-om na prvo punjenje, promena redosleda i brisanje springom snappy, izlaz pretapanjem." colors={colors} />
      <View style={styles.row}>
        <Button
          label="Stigla stavka"
          size="sm"
          variant="secondary"
          icon={<Plus size={16} color={colors.foreground} />}
          disabled={items.length >= DEMO_ITEMS.length + DEMO_ARRIVAL.length}
          onPress={() => {
            const next = DEMO_ARRIVAL.find((title) => !items.includes(title));
            if (next) setItems((current) => [next, ...current]);
          }}
        />
        <Button
          label="Obrni"
          size="sm"
          variant="secondary"
          icon={<Shuffle size={16} color={colors.foreground} />}
          onPress={() => setItems((current) => [...current].reverse())}
        />
        <Button
          label="Ponovo"
          size="sm"
          variant="ghost"
          onPress={() => {
            setItems(DEMO_ITEMS);
            setRound((value) => value + 1);
          }}
        />
      </View>
      <Animated.View key={round} layout={layout} style={[styles.frame, { borderColor: colors.border }]}>
        {items.map((title, index) => (
          <Animated.View key={title} entering={entering(index)} exiting={exitFade(reduced)} layout={layout}>
            <View style={[styles.item, { borderColor: colors.border }]}>
              <Text numberOfLines={1} style={[styles.itemText, { color: colors.foreground }]}>
                {title}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Ukloni: ${title}`}
                onPress={() => setItems((current) => current.filter((item) => item !== title))}
                style={styles.remove}>
                <Text style={[styles.removeText, { color: colors.mutedForeground }]}>Ukloni</Text>
              </Pressable>
            </View>
          </Animated.View>
        ))}
      </Animated.View>

      <SectionHeader title="Grana stabla (Prostor)" />
      <Caption label="Podstranice uđu podizanjem; pri sklapanju nestanu odmah, a red ispod se pomeri springom." colors={colors} />
      <View style={[styles.frame, { borderColor: colors.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: branchOpen }}
          accessibilityLabel={branchOpen ? 'Sakrij podstranice: Marketing' : 'Prikaži podstranice: Marketing'}
          onPress={() => {
            haptics.select();
            setBranchOpen((value) => !value);
          }}
          style={styles.branchRow}>
          {branchOpen ? (
            <ChevronDown size={18} color={colors.mutedForeground} />
          ) : (
            <ChevronRight size={18} color={colors.mutedForeground} />
          )}
          <Text style={[styles.itemText, { color: colors.foreground }]}>Marketing</Text>
        </Pressable>
        {branchOpen ? (
          <Animated.View entering={enterFadeUp(0, reduced)}>
            {DEMO_BRANCH.map((title) => (
              <View key={title} style={styles.childRow}>
                <FileText size={16} color={colors.mutedForeground} />
                <Text numberOfLines={1} style={[styles.childText, { color: colors.mutedForeground }]}>
                  {title}
                </Text>
              </View>
            ))}
          </Animated.View>
        ) : null}
        <Animated.View layout={layout} style={styles.branchRow}>
          <ChevronRight size={18} color={colors.mutedForeground} />
          <Text style={[styles.itemText, { color: colors.foreground }]}>Sales</Text>
        </Animated.View>
      </View>

      <SectionHeader title="Mehurić poruke" />
      <Caption label="Pristigla poruka se podigne 8 pt uz pretapanje (isti preset kao razgovor)." colors={colors} />
      <Button
        label="Pristigla poruka"
        size="sm"
        variant="secondary"
        disabled={messages.length >= DEMO_MESSAGES.length}
        onPress={() => setMessages(DEMO_MESSAGES.slice(0, messages.length + 1))}
      />
      <View style={[styles.frame, { borderColor: colors.border }]}>
        {messages.map((message, index) => (
          <Animated.View
            key={message}
            entering={index === 0 ? undefined : enterRise(reduced)}
            style={[styles.bubble, { backgroundColor: colors.muted }]}>
            <Text style={[styles.bubbleText, { color: colors.foreground }]}>{message}</Text>
          </Animated.View>
        ))}
      </View>

      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)}>
        <View style={styles.sheetBody}>
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Sheet na smooth springu</Text>
          <Text style={[styles.itemText, { color: colors.mutedForeground }]}>
            Prevuci nadole ili dodirni pozadinu da zatvoriš.
          </Text>
          <Button label="Zatvori" onPress={() => setSheetOpen(false)} />
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  caption: {
    ...text.meta,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  inlineFab: {
    position: 'relative',
    right: 0,
    bottom: 0,
  },
  log: {
    ...text.meta,
  },
  frame: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.card,
    padding: 8,
    gap: 6,
  },
  item: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.control,
  },
  itemText: {
    ...text.body,
    flex: 1,
  },
  remove: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  removeText: {
    ...text.meta,
  },
  branchRow: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 6,
  },
  childRow: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 32,
  },
  childText: {
    ...text.body,
    flex: 1,
  },
  bubble: {
    alignSelf: 'flex-start',
    maxWidth: '85%',
    borderRadius: radius.card,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleText: {
    ...text.body,
  },
  sheetBody: {
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  sheetTitle: {
    ...text.title,
    fontWeight: fontWeight.semibold,
  },
});
