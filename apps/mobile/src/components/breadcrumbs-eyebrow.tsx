import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { FolderClosed } from 'lucide-react-native';
import { Component, useMemo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Row } from '@/components/ui/row';
import { Sheet } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonRow } from '@/components/ui/skeletons';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { haptics } from '@/lib/haptics';
import { pageKindColor, pageKindMeta, type PageKind } from '@/lib/page-kinds';
import { areaColor } from '@/lib/task-meta';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, radius, text } from '@/theme/tokens';
import type { ColorTokens } from '@/theme/tokens';

/**
 * Putanja do korena u eyebrow-u zaglavlja detalja (bag E12): „Oblast › Roditelj
 * › …", bez tekuće stranice. Za stranicu u korenu ostaje samo ime oblasti — i to
 * je informacija („gde sam"), web je ima u sidebaru.
 *
 * Segmenti u samoj liniji NISU dodirljivi: linija je `text.meta` sa
 * `numberOfLines={1}` i `ellipsizeMode="head"`, pa su odsečeni i fizički nemaju
 * gde da dobiju po 44pt metu. Navigacija zato ide kroz `PathSheet` (C11): cela
 * linija je JEDNA meta, a u sheet-u svaki predak dobija pun red. Meta veličina
 * teksta je dozvoljen izuzetak od pravila 16px (PARITET).
 *
 * `pages.getBreadcrumbs` BACA za arhiviran roditeljski lanac, a upit koji baci u
 * renderu inače obara ceo ekran kroz route ErrorBoundary — zato lokalna granica
 * ovde: putanja se tada svede na ime oblasti (ili ništa), detalj preživi.
 */
export function BreadcrumbsEyebrow({
  pageId,
  startupId,
  areaId,
}: {
  pageId: Id<'pages'>;
  startupId: Id<'startups'>;
  areaId: Id<'startupAreas'>;
}) {
  const colors = useThemeColors();
  // Breadcrumbs ne sadrže oblast, a `pages.get` ne vraća njenu labelu — labela
  // stiže iz `startups.get` (ekran je već prošao `requireStartupMember` kroz
  // `pages.get`, pa ovaj upit praktično ne može da padne na pristupu).
  const startup = useQuery(api.startups.get, { startupId });
  const areaLabel = useMemo(
    () => startup?.areas.find((area) => area._id === areaId)?.label ?? null,
    [startup, areaId],
  );

  if (startup === undefined) return <Skeleton width={140} height={13} />;

  return (
    <TrailBoundary
      fallback={areaLabel === null ? null : <EyebrowText colors={colors} segments={[areaLabel]} />}>
      <Trail pageId={pageId} areaLabel={areaLabel} colors={colors} />
    </TrailBoundary>
  );
}

function Trail({
  pageId,
  areaLabel,
  colors,
}: {
  pageId: Id<'pages'>;
  areaLabel: string | null;
  colors: ColorTokens;
}) {
  const crumbs = useQuery(api.pages.getBreadcrumbs, { pageId });
  if (crumbs === undefined) return <Skeleton width={140} height={13} />;
  const segments = [
    ...(areaLabel === null ? [] : [areaLabel]),
    // Poslednji crumb je sama stranica — njen naslov već stoji u zaglavlju/telu.
    ...crumbs.slice(0, -1).map((crumb) => crumb.title),
  ];
  if (segments.length === 0) return null;
  return <EyebrowText colors={colors} segments={segments} />;
}

function EyebrowText({ colors, segments }: { colors: ColorTokens; segments: string[] }) {
  return (
    <Text
      numberOfLines={1}
      // Kraj putanje (najbliži roditelj) je najkorisniji — seče se početak.
      ellipsizeMode="head"
      accessibilityLabel={`Putanja: ${segments.join(', ')}`}
      style={[styles.eyebrow, { color: colors.mutedForeground }]}>
      {segments.join(' › ')}
    </Text>
  );
}

type TrailBoundaryProps = { fallback: ReactNode; children: ReactNode };

class TrailBoundary extends Component<TrailBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Putanja kao NAVIGACIJA (C11). Posle dubokog linka (obaveštenje, veza u chatu)
 * korisnik nema istoriju iznad sebe, pa sistemski „Nazad" ne vodi roditelju —
 * time pada polovina odluke „putanja je samo orijentacija". Otvara je tap na
 * eyebrow (`ScreenHeader.onEyebrowPress`), a svaki red je pun 56pt.
 *
 * Sheet dodaje i ono čega u liniji nema kao cilja: red OBLASTI, koji web
 * breadcrumb ima (`page-editor-view.tsx`). Tekuća stranica se ne prikazuje —
 * bio bi red koji ne radi ništa.
 *
 * Upiti idu `'skip'` dok je zatvoren; kad je otvoren, `pages.getBreadcrumbs` i
 * `startups.get` su isti argumenti kao u `BreadcrumbsEyebrow`, pa Convex ne pravi
 * drugu pretplatu.
 */
export function PathSheet({
  open,
  pageId,
  startupId,
  areaId,
  onClose,
}: {
  open: boolean;
  pageId: Id<'pages'>;
  startupId: Id<'startups'>;
  areaId: Id<'startupAreas'>;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const router = useRouter();
  const startup = useQuery(api.startups.get, open ? { startupId } : 'skip');
  const area = useMemo(
    () => startup?.areas.find((candidate) => candidate._id === areaId) ?? null,
    [startup, areaId],
  );

  const openArea = () => {
    haptics.tap();
    onClose();
    router.navigate({
      pathname: '/prostor',
      params: { areaId, areaLabel: area?.label ?? 'Oblast' },
    });
  };

  const areaRow =
    startup === undefined ? (
      <SkeletonRow leading="icon" trailing="chevron" />
    ) : (
      <Row
        title={area === null ? 'Oblast' : area.label}
        subtitle="Otvori oblast u Prostoru"
        onPress={openArea}
        style={styles.row}
        icon={
          <View
            style={[
              styles.iconChip,
              { backgroundColor: `${areaColor(colors, area?.key ?? '')}22` },
            ]}>
            <FolderClosed size={16} color={areaColor(colors, area?.key ?? '')} />
          </View>
        }
      />
    );

  return (
    <Sheet visible={open} onClose={onClose} style={styles.sheet}>
      <Text
        accessibilityRole="header"
        style={[styles.sheetHeading, { color: colors.foreground }]}>
        Putanja
      </Text>
      <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetList}>
        {areaRow}
        {/* Lanac predaka pada kad je neki roditelj arhiviran — ista granica kao u
            liniji, pa sheet tada ostaje na redu oblasti umesto da obori ekran. */}
        <TrailBoundary
          fallback={
            <Text style={[styles.sheetEmpty, { color: colors.mutedForeground }]}>
              Preci se ne mogu učitati — neki roditelj je u međuvremenu arhiviran.
            </Text>
          }>
          <AncestorRows
            pageId={pageId}
            colors={colors}
            onNavigate={(target, kind) => {
              haptics.tap();
              onClose();
              router.push({
                pathname: kind === 'task' ? '/zadatak/[id]' : '/stranica/[id]',
                params: { id: target },
              });
            }}
          />
        </TrailBoundary>
      </ScrollView>
    </Sheet>
  );
}

function AncestorRows({
  pageId,
  colors,
  onNavigate,
}: {
  pageId: Id<'pages'>;
  colors: ColorTokens;
  onNavigate: (pageId: Id<'pages'>, kind: PageKind) => void;
}) {
  const crumbs = useQuery(api.pages.getBreadcrumbs, { pageId });
  if (crumbs === undefined) {
    return (
      <View accessible accessibilityLiveRegion="polite" accessibilityLabel="Učitavanje putanje">
        <SkeletonRow index={1} leading="icon" trailing="chevron" />
      </View>
    );
  }
  // Poslednji crumb je sama stranica — na njoj već jesmo.
  const ancestors = crumbs.slice(0, -1);
  if (ancestors.length === 0) {
    return (
      <Text style={[styles.sheetEmpty, { color: colors.mutedForeground }]}>
        Ova stranica je u korenu oblasti.
      </Text>
    );
  }
  return (
    <>
      {ancestors.map((crumb) => {
        const kind = crumb.kind as PageKind;
        const Icon = pageKindMeta(kind).icon;
        const tint = pageKindColor(colors, kind);
        const title = crumb.title || 'Bez naslova';
        return (
          <Row
            key={crumb._id}
            title={title}
            titleNumberOfLines={2}
            subtitle={pageKindMeta(kind).label}
            onPress={() => onNavigate(crumb._id, kind)}
            accessibilityLabel={`Otvori ${title}, ${pageKindMeta(kind).label}`}
            style={styles.row}
            icon={
              <View style={[styles.iconChip, { backgroundColor: `${tint}22` }]}>
                <Icon size={16} color={tint} />
              </View>
            }
          />
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    ...text.meta,
    flexShrink: 1,
  },
  sheet: {
    paddingHorizontal: 12,
  },
  sheetHeading: {
    fontSize: 18,
    fontWeight: fontWeight.semibold,
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetList: {
    paddingBottom: 4,
    gap: 2,
  },
  sheetEmpty: {
    ...text.body,
    paddingHorizontal: 8,
    paddingVertical: 12,
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
});
