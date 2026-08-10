import { useQuery } from 'convex/react';
import { Component, useMemo, type ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useThemeColors } from '@/theme/theme-provider';
import { text } from '@/theme/tokens';
import type { ColorTokens } from '@/theme/tokens';

/**
 * Putanja do korena u eyebrow-u zaglavlja detalja (bag E12): „Oblast › Roditelj
 * › …", bez tekuće stranice. Za stranicu u korenu ostaje samo ime oblasti — i to
 * je informacija („gde sam"), web je ima u sidebaru.
 *
 * Segmenti NISU dodirljivi: 44pt dodirna meta za 3+ segmenata ne staje u jednu
 * meta liniju; ovo je orijentacija, ne navigacija — povratak ide sistemskim
 * Nazad. Meta veličina teksta je dozvoljen izuzetak od pravila 16px (PARITET).
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

const styles = StyleSheet.create({
  eyebrow: {
    ...text.meta,
    flexShrink: 1,
  },
});
