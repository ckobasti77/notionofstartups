import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import {
  ChevronDown,
  ChevronRight,
  GitPullRequestArrow,
  Link2,
  Trash2,
} from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Row } from '@/components/ui/row';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { pageKindColor, pageKindLabel, pageKindMeta, type PageKind } from '@/lib/page-kinds';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, text } from '@/theme/tokens';

/**
 * „Povezane stavke" — pandan web `page-relations.tsx`, kao kolapsibilna sekcija na
 * ekranu stranice i zadatka (web je drži kao panel u `page-editor-view`).
 *
 * Podela posla sa `PageActionsSheet`: pravljenje veze već postoji tamo („Poveži
 * sa…"), pa se ovde NE duplira — dugme u podnožju otvara isti sheet na tom koraku.
 * Ovde je ono što je mobilnom falilo: **pregled** postojećih veza, otvaranje druge
 * strane i uklanjanje veze.
 *
 * Dozvole dolaze sa servera (`canDelete` / `canRequestDeletion`): svoju vezu brišeš,
 * za tuđu se pokreće glasanje (`collaboration.requestDeletion`, `page_relation`).
 * Bez nove backend funkcije.
 */
export function RelationsSection({
  startupId,
  pageId,
  areaId,
  onConnect,
  showDivider = true,
}: {
  startupId: Id<'startups'>;
  pageId: Id<'pages'>;
  /** Oblast otvorene stranice — druga strana se označava samo kad je iz druge oblasti. */
  areaId: Id<'startupAreas'>;
  /** Otvara `PageActionsSheet` na koraku „Poveži sa…". */
  onConnect: () => void;
  /**
   * Linija ispod sekcije. Na ekranu stranice sekcija je traka među trakama (linija
   * treba); na ekranu zadatka je unutar kartice, gde bi linija visila.
   */
  showDivider?: boolean;
}) {
  const colors = useThemeColors();
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const data = useQuery(api.areasV2.listRelations, { startupId, pageId });
  const startup = useQuery(api.startups.get, { startupId });
  const deleteRelation = useMutation(api.areasV2.deleteRelation);
  const requestDeletion = useMutation(api.collaboration.requestDeletion);

  const relations = data?.relations ?? [];
  const count = data === undefined ? null : relations.length;
  const areaLabelOf = (otherAreaId: Id<'startupAreas'>) =>
    otherAreaId === areaId
      ? null
      : (startup?.areas.find((area) => area._id === otherAreaId)?.label ?? 'druga oblast');

  const remove = (
    relationId: Id<'pageRelations'>,
    title: string,
    direct: boolean,
  ) => {
    if (busyId !== null) return;
    Alert.alert(
      direct ? 'Ukloniti vezu?' : 'Zatražiti uklanjanje veze?',
      direct
        ? `Veza sa „${title}" se uklanja odmah.`
        : `Vezu je napravio neko drugi, pa uklanjanje ide na glasanje tima. Veza sa „${title}".`,
      [
        { text: 'Otkaži', style: 'cancel' },
        {
          text: direct ? 'Ukloni' : 'Zatraži',
          style: direct ? 'destructive' : 'default',
          onPress: () => {
            setBusyId(relationId);
            const action = direct
              ? deleteRelation({ startupId, relationId })
              : requestDeletion({ target: { kind: 'page_relation', id: relationId } });
            void action
              .then(() => {
                if (!direct) Alert.alert('Poslato', 'Zahtev za uklanjanje veze čeka glasanje tima.');
              })
              .catch((error: unknown) =>
                Alert.alert('Greška', accessErrorMessage(error, 'Veza nije uklonjena.')),
              )
              .finally(() => setBusyId(null));
          },
        },
      ],
    );
  };

  return (
    <View
      style={
        showDivider
          ? [styles.wrap, { borderBottomColor: colors.border }]
          : undefined
      }>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`Povezane stavke${count === null ? '' : `, ${count}`}`}
        onPress={() => setExpanded((value) => !value)}
        style={({ pressed }) => [styles.header, pressed && { backgroundColor: colors.muted }]}>
        {expanded ? (
          <ChevronDown size={18} color={colors.mutedForeground} />
        ) : (
          <ChevronRight size={18} color={colors.mutedForeground} />
        )}
        <Link2 size={18} color={colors.mutedForeground} />
        <Text style={[styles.title, { color: colors.foreground }]}>Povezane stavke</Text>
        {count === null ? (
          <ActivityIndicator size="small" color={colors.mutedForeground} />
        ) : (
          <View style={[styles.countPill, { backgroundColor: colors.muted }]}>
            <Text style={[styles.countText, { color: colors.mutedForeground }]}>{count}</Text>
          </View>
        )}
      </Pressable>

      {expanded ? (
        <View style={styles.body}>
          {count === 0 ? (
            <Text style={[styles.empty, { color: colors.mutedForeground }]}>
              Još nema povezanih stavki. Poveži stranicu da kontekst i izvršenje ostanu
              zajedno.
            </Text>
          ) : (
            relations.map((relation) => {
              const kind = relation.linkedPage.kind as PageKind;
              const title = relation.linkedPage.title.trim() || 'Bez naslova';
              const Icon = pageKindMeta(kind).icon;
              const tint = pageKindColor(colors, kind);
              const area = areaLabelOf(relation.linkedPage.areaId);
              const canRemove = relation.canDelete || relation.canRequestDeletion;
              return (
                <View key={relation._id} style={styles.relationRow}>
                  <Row
                    title={title}
                    titleNumberOfLines={2}
                    subtitle={area === null ? pageKindLabel(kind) : `${pageKindLabel(kind)} · ${area}`}
                    accessibilityLabel={`Otvori ${title}, ${pageKindLabel(kind)}${
                      area === null ? '' : `, ${area}`
                    }`}
                    onPress={() =>
                      router.push(
                        kind === 'task'
                          ? { pathname: '/zadatak/[id]', params: { id: relation.linkedPage.pageId } }
                          : { pathname: '/stranica/[id]', params: { id: relation.linkedPage.pageId } },
                      )
                    }
                    style={styles.row}
                    icon={
                      <View style={[styles.iconChip, { backgroundColor: `${tint}22` }]}>
                        <Icon size={16} color={tint} />
                      </View>
                    }
                  />
                  {canRemove ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        relation.canDelete
                          ? `Ukloni vezu sa: ${title}`
                          : `Zatraži uklanjanje veze sa: ${title}`
                      }
                      disabled={busyId !== null}
                      onPress={() => remove(relation._id, title, relation.canDelete)}
                      style={({ pressed }) => [
                        styles.removeBtn,
                        pressed && { backgroundColor: colors.muted },
                        busyId !== null && busyId !== relation._id && styles.dimmed,
                      ]}>
                      {busyId === relation._id ? (
                        <ActivityIndicator size="small" color={colors.mutedForeground} />
                      ) : relation.canDelete ? (
                        <Trash2 size={18} color={colors.danger} />
                      ) : (
                        <GitPullRequestArrow size={18} color={colors.warning} />
                      )}
                    </Pressable>
                  ) : null}
                </View>
              );
            })
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Poveži sa drugom stavkom"
            onPress={onConnect}
            style={({ pressed }) => [
              styles.addBtn,
              { borderColor: colors.border },
              pressed && { backgroundColor: colors.muted },
            ]}>
            <Link2 size={16} color={colors.mutedForeground} />
            <Text style={[styles.addText, { color: colors.mutedForeground }]}>Poveži sa…</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 16,
  },
  title: {
    flex: 1,
    ...text.body,
    fontWeight: fontWeight.semibold,
  },
  countPill: {
    minWidth: 26,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  countText: {
    ...text.meta,
    fontWeight: fontWeight.semibold,
  },
  body: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 2,
  },
  relationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  row: {
    flex: 1,
    paddingHorizontal: 2,
    borderRadius: radius.control,
  },
  iconChip: {
    width: 32,
    height: 32,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
  },
  dimmed: {
    opacity: 0.4,
  },
  empty: {
    ...text.body,
    paddingVertical: 8,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: MIN_TOUCH_TARGET,
    marginTop: 4,
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  addText: {
    ...text.body,
    fontWeight: fontWeight.medium,
  },
});
