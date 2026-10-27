import type { Id } from '@/convex/_generated/dataModel';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SegmentedControl } from '@/components/chat/segmented-control';
import { CommentsEntryRow, type CommentsSummary } from '@/components/collab/comments-sheet';
import {
  AreaDescriptionView,
  AreaRecentList,
  type AreaRecentItem,
} from '@/components/oblast/area-overview';
import {
  AREA_TABS,
  areaMetaLine,
  descriptionMeta,
  type AreaTab,
} from '@/components/oblast/area-model';
import { Row } from '@/components/ui/row';
import { SectionHeader } from '@/components/ui/section-header';
import { FolderClosed } from 'lucide-react-native';
import { useThemeColors } from '@/theme/theme-provider';
import { text } from '@/theme/tokens';

const MINUTE = 60_000;
const OPIS =
  'Razvoj vodi API, mobilnu aplikaciju i infrastrukturu.\nOdluke o arhitekturi idu u dokument „Specifikacija API”, a rokovi u Zadatke.';

function recent(now: number): AreaRecentItem[] {
  return [
    {
      _id: 'k14-1' as Id<'pages'>,
      kind: 'note',
      title: 'Specifikacija API',
      updatedAt: now - 5 * MINUTE,
      lockedAt: now - 60 * MINUTE,
      updatedBy: { displayName: 'Ana Ilić' },
    },
    {
      _id: 'k14-2' as Id<'pages'>,
      kind: 'task',
      title: 'Pripremi API ključeve za produkciju',
      updatedAt: now - 26 * 60 * MINUTE,
      lockedAt: null,
      updatedBy: { displayName: 'Marko Jović' },
    },
    {
      _id: 'k14-3' as Id<'pages'>,
      kind: 'table',
      title: 'Plan lansiranja',
      updatedAt: now - 3 * 24 * 60 * MINUTE,
      lockedAt: null,
      updatedBy: null,
    },
  ];
}

/**
 * PROSTOR K14: ekran oblasti — kartice, opis sa „Izmeni" i Istorijom izmena, red
 * Komentari, Nedavne izmene i red u listi oblasti. Fixture, ništa ne ide na server.
 * Kartice Zadaci i Dokumenti čitaju Convex (isti red zadatka i isto stablo kao
 * „Zadaci" i bivši okvir Prostora), pa su ovde samo kroz pravi ekran.
 */
export function ProstorK14Katalog() {
  const colors = useThemeColors();
  const [now] = useState(() => Date.now());
  const [items] = useState(() => recent(Date.now()));
  const [tab, setTab] = useState<AreaTab>('pregled');
  const [log, setLog] = useState('Dodirni red ili dugme.');

  const summary: CommentsSummary = {
    count: 3,
    capped: false,
    last: { author: 'Ana Ilić', excerpt: 'Ko preuzima deploy?' },
  };
  const meta = descriptionMeta({
    hasContent: true,
    lastEditorName: 'Marko Jović',
    updatedAt: now - 2 * 24 * 60 * MINUTE,
    now,
  });

  return (
    <View style={styles.root}>
      <SectionHeader title="Oblast — kartice i meta (K14)" />
      <Text style={[styles.caption, { color: colors.mutedForeground }]}>
        {areaMetaLine({ count: 12, capped: false }, { count: 50, capped: true })}
      </Text>
      <SegmentedControl options={AREA_TABS} value={tab} onChange={setTab} />

      <SectionHeader title="Opis oblasti (K14)" />
      <AreaDescriptionView
        content={OPIS}
        meta={meta}
        canEdit
        onEdit={() => setLog('Izmeni opis')}
        onOpenHistory={() => setLog('Istorija izmena')}
      />
      <Text style={[styles.caption, { color: colors.mutedForeground }]}>Prazan opis i bez prava izmene:</Text>
      <AreaDescriptionView
        content=""
        meta={null}
        canEdit={false}
        onEdit={() => setLog('Izmeni opis')}
        onOpenHistory={() => setLog('Istorija izmena')}
      />
      <Text style={[styles.caption, { color: colors.mutedForeground }]}>Prazan opis, smeš da menjaš:</Text>
      <AreaDescriptionView
        content=""
        meta={null}
        canEdit
        onEdit={() => setLog('Napiši opis')}
        onOpenHistory={() => setLog('Istorija izmena')}
      />

      <SectionHeader title="Komentari oblasti i Nedavne izmene (K14)" />
      <CommentsEntryRow summary={summary} onPress={() => setLog('Otvori Komentare')} />
      <AreaRecentList items={items} now={now} onOpen={(page) => setLog(`Otvori: ${page.title}`)} />
      <AreaRecentList items={[]} now={now} onOpen={() => undefined} />
      <AreaRecentList items={undefined} now={now} onOpen={() => undefined} />

      <SectionHeader title="Red u listi oblasti (K14)" />
      <Row
        icon={<FolderClosed size={20} color={colors.mutedForeground} />}
        title="Razvoj"
        subtitle={areaMetaLine({ count: 12, capped: false }, { count: 8, capped: false })}
        onPress={() => setLog('Otvori oblast Razvoj')}
        style={styles.row}
      />
      <Row
        icon={<FolderClosed size={20} color={colors.mutedForeground} />}
        title="Marketing"
        subtitle={areaMetaLine({ count: 99, capped: true }, { count: 50, capped: true })}
        onPress={() => setLog('Otvori oblast Marketing')}
        style={styles.row}
      />
      <Text style={[styles.log, { color: colors.mutedForeground }]}>{log}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 12,
    paddingTop: 24,
  },
  caption: {
    ...text.body,
  },
  row: {
    paddingHorizontal: 4,
  },
  log: {
    ...text.meta,
  },
});
