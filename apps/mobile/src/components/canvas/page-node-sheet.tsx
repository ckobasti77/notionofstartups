import { useMutation } from 'convex/react';
import { Link2, Unlink, Vote } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PageSizeSection, type PageSizeTarget } from '@/components/canvas/page-size-section';
import { Row } from '@/components/ui/row';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { pushUndo } from '@/lib/undo';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, text } from '@/theme/tokens';

/** Jedan sused kartice — canvas veza ili relacija stranica (stiže uz poruku iz embeda). */
export type PageNodeEdge = {
  _id: string;
  kind: 'canvas' | 'relation';
  otherPageId: string;
  otherTitle: string;
  label: string | null;
  canDelete: boolean;
  canRequestDeletion: boolean;
};

/**
 * Kartica nad kojom se otvaraju akcije. Nadgradnja `PageSizeTarget`-a iz K2 — sve
 * stiže uz `node:actions` / `selection` poruku (`PageNodeDetail` u embedu), pa native
 * ni za listu veza ne radi dodatni upit.
 */
export type PageNodeTarget = PageSizeTarget & {
  canConnect: boolean;
  pageCount: number;
  edges: PageNodeEdge[];
};

/**
 * Sheet „Akcije kartice" na kanvasu oblasti/stranice (K3). Otvara ga dugi pritisak na
 * karticu u režimu „Uredi raspored" (`node:actions`) ili četvrta ikonica rail-a — dva
 * puta do iste radnje, jer je `contextmenu` u WKWebView-u nepouzdan.
 *
 * Zašto se povezivanje i raskidanje rade ODAVDE, a ne na platnu: handle tačkica je
 * ~8 px, a linija veze 1–2 px i najčešće ide ispod kartica — oboje je prstom promašaj
 * za promašajem. Veza se zato pravi tapom (ovde se bira izvor, cilj se tapne na
 * kanvasu), a raskida iz imenovane liste gde je svaki sused red od 56pt.
 *
 * Sheet se posle svake uspešne izmene ZATVARA: `UndoBar` živi na ekranu kanvasa, a
 * `Sheet` je `Modal` — traka iza otvorenog sheet-a se ne bi ni videla, pa bi njenih
 * 8 s isteklo neiskorišćeno. Zatvaranje je uslov da „Poništi" uopšte postoji.
 */
export function PageNodeSheet({
  page,
  onClose,
  onStartConnect,
  onApplied,
}: {
  page: PageNodeTarget | null;
  onClose: () => void;
  /** „Poveži sa…" — roditelj zatvara sheet i ulazi u biranje cilja. */
  onStartConnect: (page: PageNodeTarget) => void;
  /** Nova veličina posle uspešne izmene — pozivalac osvežava svoj `selectedNode`. */
  onApplied?: (width: number, height: number) => void;
}) {
  const colors = useThemeColors();
  const disconnectPages = useMutation(api.areasV2.disconnectPages);
  const requestDeletion = useMutation(api.collaboration.requestDeletion);
  // Jedna brava za CEO sheet (veličina + veze): dve mutacije nad istom karticom se
  // ne smeju okinuti jedna preko druge. Vrednost je ključ reda koji je u toku.
  const [busy, setBusy] = useState<string | null>(null);

  const breakEdge = (edge: PageNodeEdge) => {
    if (busy !== null || !page) return;
    haptics.warning();
    Alert.alert('Prekinuti vezu?', `Veza sa „${edge.otherTitle}" se uklanja sa kanvasa.`, [
      { text: 'Otkaži', style: 'cancel' },
      {
        text: 'Prekini',
        style: 'destructive',
        onPress: async () => {
          setBusy(edge._id);
          try {
            await disconnectPages({
              startupId: page.startupId,
              areaId: page.areaId,
              rootPageId: page.rootPageId,
              edgeId: edge._id as Id<'pageCanvasEdgesV2'>,
            });
            // `connectPages` NE oživljava arhiviranu ivicu, pa „Poništi" pravi novu —
            // sa istim parom i istim nazivom.
            pushUndo({
              label: 'Veza je uklonjena.',
              action: {
                kind: 'pageEdgeDisconnect',
                startupId: page.startupId,
                areaId: page.areaId,
                rootPageId: page.rootPageId,
                sourcePageId: page._id,
                targetPageId: edge.otherPageId as Id<'pages'>,
                ...(edge.label ? { label: edge.label } : {}),
              },
            });
            haptics.success();
            onClose();
          } catch (error) {
            haptics.error();
            Alert.alert('Greška', accessErrorMessage(error, 'Veza nije prekinuta.'));
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  const requestEdgeDeletion = (edge: PageNodeEdge) => {
    if (busy !== null) return;
    setBusy(edge._id);
    haptics.tap();
    void requestDeletion({
      target: { kind: 'page_edge', id: edge._id as Id<'pageCanvasEdgesV2'> },
    })
      .then(() => {
        haptics.success();
        onClose();
        // Prikaz glasanja već postoji na ekranu „Odobrenja" („Veza stranica").
        Alert.alert('Poslato', 'Glasanje o brisanju veze je pokrenuto.');
      })
      .catch((error: unknown) => {
        haptics.error();
        Alert.alert('Greška', accessErrorMessage(error, 'Zahtev nije poslat.'));
      })
      .finally(() => setBusy(null));
  };

  return (
    <Sheet visible={page !== null} onClose={onClose} style={styles.sheet}>
      {page ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
          <Text
            accessibilityRole="header"
            numberOfLines={2}
            style={[styles.heading, { color: colors.foreground }]}>
            {page.title || 'Stranica bez naslova'}
          </Text>
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>
            {`Trenutno: ${page.width} × ${page.height}`}
          </Text>

          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Veze</Text>
          <Row
            title="Poveži sa…"
            subtitle={
              !page.canConnect
                ? 'Vezu možete praviti samo od ili ka svojoj kartici.'
                : page.pageCount < 2
                  ? 'Na kanvasu nema druge kartice.'
                  : 'Zatim tapni karticu sa kojom se povezuje'
            }
            onPress={() => onStartConnect(page)}
            disabled={busy !== null || !page.canConnect || page.pageCount < 2}
            showChevron={false}
            style={styles.row}
            icon={<Link2 size={20} color={colors.mutedForeground} />}
          />

          {page.edges.length === 0 ? (
            /* Prazna lista bi izgledala kao kvar — stanje se kaže rečima. */
            <Text style={[styles.note, { color: colors.mutedForeground }]}>
              Nema veza sa ove kartice.
            </Text>
          ) : (
            <View style={styles.list}>
              {page.edges.map((edge) => (
                <Row
                  key={edge._id}
                  title={edge.otherTitle}
                  titleNumberOfLines={2}
                  subtitle={
                    edge.label ??
                    (edge.kind === 'relation' ? 'Relacija — uklanja se na stranici' : 'Veza')
                  }
                  showChevron={false}
                  style={styles.row}
                  value={
                    busy === edge._id ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : edge.kind === 'relation' ? undefined : edge.canDelete ? (
                      <EdgeButton
                        label={`Raskini vezu sa „${edge.otherTitle}"`}
                        disabled={busy !== null}
                        onPress={() => breakEdge(edge)}>
                        <Unlink size={20} color={colors.destructive} />
                      </EdgeButton>
                    ) : edge.canRequestDeletion ? (
                      <EdgeButton
                        label={`Zatraži brisanje veze sa „${edge.otherTitle}"`}
                        disabled={busy !== null}
                        onPress={() => requestEdgeDeletion(edge)}>
                        <Vote size={20} color={colors.mutedForeground} />
                      </EdgeButton>
                    ) : undefined
                  }
                />
              ))}
            </View>
          )}

          <PageSizeSection
            page={page}
            busy={busy}
            setBusy={setBusy}
            onClose={onClose}
            onApplied={onApplied}
          />
        </ScrollView>
      ) : null}
    </Sheet>
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
  sheet: {
    paddingHorizontal: 12,
  },
  scroll: {
    flexGrow: 0,
  },
  body: {
    paddingBottom: 4,
  },
  heading: {
    fontSize: 18,
    fontWeight: fontWeight.semibold,
    paddingHorizontal: 8,
  },
  meta: {
    ...text.meta,
    paddingHorizontal: 8,
    marginTop: 2,
  },
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
