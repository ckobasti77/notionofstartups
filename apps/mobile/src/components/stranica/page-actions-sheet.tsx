import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import {
  ChevronLeft,
  FolderInput,
  FolderOutput,
  Link2,
  Pencil,
  Scissors,
  Trash2,
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Row } from '@/components/ui/row';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { pageKindColor, pageKindLabel, pageKindMeta, type PageKind } from '@/lib/page-kinds';
import { areaColor } from '@/lib/task-meta';
import { pushUndo } from '@/lib/undo';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, radius } from '@/theme/tokens';

type PageDetails = FunctionReturnType<typeof api.pages.get>;

/** Menija ima jedan nivo dubine: spisak akcija → spisak ciljeva za izabranu akciju. */
export type SheetView = 'menu' | 'move' | 'nest' | 'relate' | 'rename';

const VIEW_TITLE: Record<Exclude<SheetView, 'menu'>, string> = {
  move: 'Premesti u oblast',
  nest: 'Ugnjezdi pod…',
  relate: 'Poveži sa…',
  rename: 'Preimenuj',
};

/**
 * Organizacija stranice sa telefona (paritet sa webom): premeštanje u drugu oblast,
 * ugnježđavanje pod drugu stranicu, izdvajanje u koren oblasti i povezivanje sa
 * drugom stranicom. Sve četiri koriste POSTOJEĆE mutacije iz `areasV2` — nema nove
 * backend površine.
 *
 * Zašto jedan sheet sa pod-prikazima, a ne četiri sheet-a: sve su radnje nad istom
 * stranicom i sve traže spisak ciljeva, pa je „akcija → cilj" jedan tok bez ugnježdenih
 * modala (ugnježdeni modal na Androidu ume da proguta `onRequestClose`).
 *
 * Dozvole se poštuju na klijentu isto kao na webu (`permissions` iz `pages.get`), ali
 * server ostaje autoritet — greška se prikazuje istim `accessErrorMessage` obrascem
 * kao svuda u aplikaciji.
 */
export function PageActionsSheet({
  open,
  page,
  initialView = 'menu',
  onClose,
  onArchived,
}: {
  open: boolean;
  page: PageDetails;
  /**
   * Korak na kom se sheet otvara. „Povezane stavke" (sekcija na ekranu stranice)
   * vodi pravo na `relate` da se ne prolazi kroz meni koji je već zaobiđen.
   */
  initialView?: SheetView;
  onClose: () => void;
  /** Poziva se posle uspešnog DIREKTNOG arhiviranja (ne posle zahteva za glasanje). */
  onArchived: () => void;
}) {
  const colors = useThemeColors();
  const [view, setView] = useState<SheetView>(initialView);

  // Svako otvaranje kreće od zadatog koraka — stari korak iz prošlog otvaranja ne
  // sme da procuri (sheet ostaje montiran).
  useEffect(() => {
    if (open) setView(initialView);
  }, [open, initialView]);
  // Jedna brava za ceo sheet: dok mutacija traje nijedan cilj se ne može tapnuti
  // (vrednost je id cilja da baš taj red pokaže spiner).
  const [busyId, setBusyId] = useState<string | null>(null);

  const movePage = useMutation(api.areasV2.movePage);
  const requestNesting = useMutation(api.areasV2.requestNesting);
  const detachPage = useMutation(api.areasV2.detachPage);
  const createRelation = useMutation(api.areasV2.createRelation);
  const archivePage = useMutation(api.areasV2.archivePage);
  const requestDeletion = useMutation(api.collaboration.requestDeletion);
  const updatePage = useMutation(api.areasV2.updatePage);

  const [renameTitle, setRenameTitle] = useState(page.title);
  const [renameError, setRenameError] = useState<string | null>(null);
  // Prati PRETHODNI `view` da se draft resetuje samo na ULAZAK u `rename`, ne na
  // svaku promenu `page.title` dok se u njemu već jeste (`page` je živ upit — da je
  // efekat reagovao na svaku izmenu, tuđe realtime osvežavanje naslova bi tiho
  // obrisalo draft korisnika usred kucanja).
  const previousViewRef = useRef<SheetView>(view);
  useEffect(() => {
    if (view === 'rename' && previousViewRef.current !== 'rename') {
      setRenameTitle(page.title);
      setRenameError(null);
    }
    previousViewRef.current = view;
  }, [view, page.title]);

  const startup = useQuery(
    api.startups.get,
    open && view === 'move' ? { startupId: page.startupId } : 'skip',
  );
  // Kandidati za ugnježđavanje su stranice u KORENU iste oblasti — ugnježđavanje je
  // ionako dozvoljeno samo unutar oblasti (`requestNesting`), a web bira iz istog
  // skupa (`canvasData.pages`).
  const nestCandidates = usePaginatedQuery(
    api.pages.listChildren,
    open && view === 'nest'
      ? { startupId: page.startupId, areaId: page.areaId, parentPageId: null }
      : 'skip',
    { initialNumItems: 50 },
  );
  const relationData = useQuery(
    api.areasV2.listRelations,
    open && view === 'relate' ? { startupId: page.startupId, pageId: page._id } : 'skip',
  );

  const close = () => {
    setView('menu');
    onClose();
  };

  /** Zajednički omotač: brava, prikaz greške, povratak na meni po uspehu. */
  const runAction = async (targetId: string, action: () => Promise<string | null>) => {
    if (busyId !== null) return;
    setBusyId(targetId);
    haptics.tap();
    try {
      const note = await action();
      haptics.success();
      if (note) Alert.alert('Gotovo', note);
      close();
    } catch (error) {
      haptics.error();
      Alert.alert('Greška', accessErrorMessage(error, 'Radnja nije izvršena.'));
    } finally {
      setBusyId(null);
    }
  };

  const moveTo = (targetAreaId: Id<'startupAreas'>, label: string) =>
    void runAction(targetAreaId, async () => {
      const result = await movePage({
        startupId: page.startupId,
        pageId: page._id,
        targetAreaId,
        targetParentPageId: null,
      });
      return result.nestingStatus === 'pending'
        ? 'Premeštanje čeka odobrenje autora roditeljske stranice.'
        : `Stranica je premeštena u „${label}".`;
    });

  const nestInto = (targetParentPageId: Id<'pages'>, targetTitle: string) =>
    void runAction(targetParentPageId, async () => {
      const result = await requestNesting({
        startupId: page.startupId,
        childPageId: page._id,
        targetParentPageId,
      });
      // Ugnježđavanje pod tuđu stranicu ide kroz odobrenje — to se mora reći, inače
      // izgleda kao da se ništa nije desilo (stranica ostaje gde je bila).
      return result.nestingStatus === 'pending'
        ? `Zahtev je poslat autoru stranice „${targetTitle}". Ugnježđavanje čeka odobrenje.`
        : `Stranica je ugnježdena pod „${targetTitle}".`;
    });

  const relateTo = (pageBId: Id<'pages'>, targetTitle: string) =>
    void runAction(pageBId, async () => {
      await createRelation({
        startupId: page.startupId,
        pageAId: page._id,
        pageBId,
      });
      return `Stranica je povezana sa „${targetTitle}".`;
    });

  const renameSubmit = async () => {
    if (busyId !== null) return;
    const clean = renameTitle.trim();
    if (clean === '') {
      haptics.warning();
      setRenameError('Naslov ne sme biti prazan.');
      return;
    }
    if (clean === page.title) {
      setView('menu');
      return;
    }
    setBusyId('rename');
    haptics.tap();
    const previousTitle = page.title;
    try {
      const result = await updatePage({
        startupId: page.startupId,
        pageId: page._id,
        expectedRevision: page.revision,
        title: clean,
      });
      haptics.success();
      pushUndo({
        label: `Preimenovano u „${clean}".`,
        action: {
          kind: 'pageRename',
          startupId: page.startupId,
          pageId: page._id,
          title: previousTitle,
          expectedRevision: result.revision,
        },
      });
      close();
    } catch (error) {
      haptics.error();
      setRenameError(
        String(error).includes('KONFLIKT_IZMENA')
          ? 'Neko iz tima je u međuvremenu izmenio ovu stranicu. Zatvori sheet i pokušaj ponovo.'
          : accessErrorMessage(error, 'Stranica nije preimenovana.'),
      );
    } finally {
      setBusyId(null);
    }
  };

  const detach = () => {
    if (busyId !== null) return;
    // Destruktivno po strukturi stabla — upozorenje pre potvrde, ne posle.
    haptics.warning();
    Alert.alert(
      'Izdvojiti stranicu?',
      `„${page.title || 'Stranica bez naslova'}" se odvaja od roditelja i vraća u koren oblasti.`,
      [
        { text: 'Otkaži', style: 'cancel' },
        {
          text: 'Izdvoji',
          style: 'destructive',
          onPress: () =>
            void runAction('detach', async () => {
              const result = await detachPage({ startupId: page.startupId, pageId: page._id });
              if (result.status !== 'detached') {
                throw new Error('Stranica više nije ugnježdena.');
              }
              return 'Stranica je vraćena u koren oblasti.';
            }),
        },
      ],
    );
  };

  const archiveOrRequest = () => {
    if (busyId !== null) return;
    if (!page.permissions.canDeleteDirectly) {
      haptics.tap();
      setBusyId('archive');
      void requestDeletion({ target: { kind: 'page', id: page._id } })
        .then(() => {
          haptics.success();
          close();
          Alert.alert('Poslato', 'Glasanje o brisanju je pokrenuto.');
        })
        .catch((error: unknown) => {
          haptics.error();
          Alert.alert('Greška', accessErrorMessage(error, 'Zahtev nije poslat.'));
        })
        .finally(() => setBusyId(null));
      return;
    }
    haptics.warning();
    Alert.alert(
      'Obrisati stranicu?',
      'Podstranice će biti izvučene nivo iznad.',
      [
        { text: 'Otkaži', style: 'cancel' },
        {
          text: 'Obriši',
          style: 'destructive',
          onPress: () => {
            setBusyId('archive');
            void archivePage({ startupId: page.startupId, pageId: page._id })
              .then(() => {
                haptics.success();
                // `close()` PRE `onArchived()`: ako pozivalac nema istoriju za
                // `router.back()` (npr. deep link), sheet se ipak zatvara umesto
                // da ostane otvoren nad upravo arhiviranom stranicom.
                close();
                onArchived();
              })
              .catch((error: unknown) => {
                haptics.error();
                Alert.alert('Greška', accessErrorMessage(error, 'Stranica nije arhivirana.'));
              })
              .finally(() => setBusyId(null));
          },
        },
      ],
    );
  };

  const areaById = new Map((startup?.areas ?? []).map((area) => [area._id, area.label]));

  return (
    <Sheet visible={open} onClose={close} avoidKeyboard={view === 'rename'} style={styles.sheet}>
      {view === 'menu' ? (
          <>
            <Text
              accessibilityRole="header"
              numberOfLines={2}
              style={[styles.heading, { color: colors.foreground }]}>
              {page.title || 'Stranica bez naslova'}
            </Text>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
              <Row
                title="Premesti u oblast"
                subtitle="Stranica sleće u koren izabrane oblasti"
                onPress={() => setView('move')}
                disabled={!page.permissions.canMove}
                style={styles.row}
                icon={<FolderOutput size={20} color={colors.mutedForeground} />}
              />
              <Row
                title="Ugnjezdi pod…"
                subtitle="Unutar iste oblasti; tuđa stranica traži odobrenje"
                onPress={() => setView('nest')}
                disabled={!page.permissions.canMove}
                style={styles.row}
                icon={<FolderInput size={20} color={colors.mutedForeground} />}
              />
              <Row
                title="Izdvoji"
                subtitle="Odvaja od roditelja i vraća u koren oblasti"
                onPress={detach}
                disabled={!page.permissions.canDetach || busyId !== null}
                showChevron={false}
                style={styles.row}
                icon={<Scissors size={20} color={colors.mutedForeground} />}
                value={busyId === 'detach' ? <ActivityIndicator color={colors.primary} /> : undefined}
              />
              <Row
                title="Poveži sa…"
                subtitle="Veza sa drugom stranicom, iz bilo koje oblasti"
                onPress={() => setView('relate')}
                style={styles.row}
                icon={<Link2 size={20} color={colors.mutedForeground} />}
              />
              {page.kind !== 'note' ? (
                // Beleška ima uvek-uredljiv naslov u editoru (`note-editor.tsx`), pa
                // preimenovanje odavde nije rupa pariteta — dodavanje bi bilo OPASNO:
                // `NoteEditor` drži `baseRevisionRef`, pa bi preimenovanje iz sheet-a
                // podiglo reviziju i sledeći autosave bi pao u konflikt protiv istog
                // korisnika.
                <Row
                  title="Preimenuj"
                  subtitle={
                    page.permissions.canEdit
                      ? 'Menja naslov ove stranice'
                      : 'Naslov menja samo autor stranice'
                  }
                  onPress={() => setView('rename')}
                  disabled={!page.permissions.canEdit}
                  style={styles.row}
                  icon={<Pencil size={20} color={colors.mutedForeground} />}
                />
              ) : null}
              <Row
                title="Obriši"
                subtitle={
                  page.permissions.canDeleteDirectly
                    ? 'Arhivira stranicu; podstranice idu nivo iznad'
                    : 'Traži jednoglasno glasanje tima'
                }
                onPress={archiveOrRequest}
                disabled={busyId !== null}
                showChevron={false}
                style={styles.row}
                icon={<Trash2 size={20} color={colors.mutedForeground} />}
                value={busyId === 'archive' ? <ActivityIndicator color={colors.primary} /> : undefined}
              />
            </ScrollView>
          </>
        ) : (
          <>
            <Row
              title={VIEW_TITLE[view]}
              onPress={() => setView('menu')}
              disabled={busyId !== null}
              showChevron={false}
              accessibilityLabel={`Nazad na akcije stranice — ${VIEW_TITLE[view]}`}
              style={styles.row}
              icon={<ChevronLeft size={22} color={colors.foreground} />}
            />
            {view === 'rename' ? (
              <View style={styles.renameForm}>
                {renameError === null ? null : (
                  <Text
                    accessibilityLiveRegion="polite"
                    style={[styles.renameError, { color: colors.destructive }]}>
                    {renameError}
                  </Text>
                )}
                <Input
                  value={renameTitle}
                  onChangeText={(next) => {
                    setRenameTitle(next);
                    if (renameError !== null) setRenameError(null);
                  }}
                  invalid={renameError !== null}
                  autoFocus
                  maxLength={200}
                  editable={busyId === null}
                  returnKeyType="done"
                  onSubmitEditing={() => void renameSubmit()}
                  accessibilityLabel="Naslov stranice"
                />
                <View style={styles.renameActions}>
                  <Button
                    label="Otkaži"
                    variant="ghost"
                    onPress={() => setView('menu')}
                    disabled={busyId !== null}
                    style={styles.flexBtn}
                  />
                  <Button
                    label="Sačuvaj"
                    onPress={() => void renameSubmit()}
                    loading={busyId === 'rename'}
                    style={styles.flexBtn}
                  />
                </View>
              </View>
            ) : (
            <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
              {view === 'move' ? (
                startup === undefined ? (
                  <Loading label="Učitavanje oblasti" />
                ) : (
                  <TargetList
                    empty="Nema druge oblasti u koju bi se stranica premestila."
                    items={startup.areas
                      .filter((area) => area._id !== page.areaId)
                      .map((area) => ({
                        id: area._id,
                        title: area.label,
                        tint: areaColor(colors, area.key),
                        onPress: () => moveTo(area._id, area.label),
                      }))}
                    busyId={busyId}
                  />
                )
              ) : null}

              {view === 'nest' ? (
                nestCandidates.status === 'LoadingFirstPage' ? (
                  <Loading label="Učitavanje stranica" />
                ) : (
                  <TargetList
                    empty="U ovoj oblasti nema druge stranice pod koju bi se ugnjezdila."
                    items={nestCandidates.results
                      .filter((candidate) => candidate._id !== page._id)
                      .map((candidate) => ({
                        id: candidate._id,
                        title: candidate.title || 'Bez naslova',
                        subtitle: pageKindLabel(candidate.kind as PageKind),
                        kind: candidate.kind as PageKind,
                        tint: pageKindColor(colors, candidate.kind as PageKind),
                        onPress: () => nestInto(candidate._id, candidate.title || 'Bez naslova'),
                      }))}
                    busyId={busyId}
                    onEndReached={
                      nestCandidates.status === 'CanLoadMore'
                        ? () => nestCandidates.loadMore(50)
                        : undefined
                    }
                  />
                )
              ) : null}

              {view === 'relate' ? (
                relationData === undefined ? (
                  <Loading label="Učitavanje stranica" />
                ) : (
                  <TargetList
                    empty="Nema stranice sa kojom bi se ova povezala."
                    items={relationData.candidates.map((candidate) => ({
                      id: candidate.pageId,
                      title: candidate.title || 'Bez naslova',
                      subtitle:
                        candidate.areaId === page.areaId
                          ? pageKindLabel(candidate.kind as PageKind)
                          : `${pageKindLabel(candidate.kind as PageKind)} · ${
                              areaById.get(candidate.areaId) ?? 'druga oblast'
                            }`,
                      kind: candidate.kind as PageKind,
                      tint: pageKindColor(colors, candidate.kind as PageKind),
                      onPress: () => relateTo(candidate.pageId, candidate.title || 'Bez naslova'),
                    }))}
                    busyId={busyId}
                  />
                )
              ) : null}
            </ScrollView>
            )}
          </>
        )}
    </Sheet>
  );
}

type Target = {
  id: string;
  title: string;
  subtitle?: string;
  kind?: PageKind;
  tint: string;
  onPress: () => void;
};

function TargetList({
  items,
  empty,
  busyId,
  onEndReached,
}: {
  items: Target[];
  empty: string;
  busyId: string | null;
  onEndReached?: () => void;
}) {
  const colors = useThemeColors();
  if (items.length === 0) {
    return <Text style={[styles.empty, { color: colors.mutedForeground }]}>{empty}</Text>;
  }
  return (
    <>
      {items.map((item) => {
        const Icon = item.kind ? pageKindMeta(item.kind).icon : null;
        return (
          <Row
            key={item.id}
            title={item.title}
            titleNumberOfLines={2}
            subtitle={item.subtitle}
            onPress={item.onPress}
            disabled={busyId !== null}
            showChevron={busyId === null}
            style={styles.row}
            accessibilityLabel={item.subtitle ? `${item.title}, ${item.subtitle}` : item.title}
            icon={
              <View style={[styles.iconChip, { backgroundColor: `${item.tint}22` }]}>
                {Icon ? <Icon size={16} color={item.tint} /> : null}
              </View>
            }
            value={busyId === item.id ? <ActivityIndicator color={colors.primary} /> : undefined}
          />
        );
      })}
      {onEndReached ? (
        <Row title="Učitaj još" onPress={onEndReached} showChevron={false} style={styles.row} />
      ) : null}
    </>
  );
}

function Loading({ label }: { label: string }) {
  const colors = useThemeColors();
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.primary} accessibilityLabel={label} />
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: 12,
  },
  heading: {
    fontSize: 18,
    fontWeight: fontWeight.semibold,
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  scroll: {
    flexGrow: 0,
  },
  list: {
    paddingBottom: 4,
    gap: 2,
  },
  row: {
    paddingHorizontal: 8,
    borderRadius: radius.md,
  },
  iconChip: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    fontSize: 16,
    lineHeight: 22,
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  loading: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  renameForm: {
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 10,
  },
  renameError: {
    fontSize: 16,
    lineHeight: 22,
  },
  renameActions: {
    flexDirection: 'row',
    gap: 10,
  },
  flexBtn: {
    flex: 1,
  },
});
