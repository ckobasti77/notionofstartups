import { IDEA_CONVERTED_REASON, IDEA_STAGE_CHANGE_REASON, IDEA_STAGE_LABELS } from '@devotion/shared';
import { Flag } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { IdeaListRow } from '@/components/ideja/idea-list-row';
import {
  buildSections,
  chipLabel,
  convertHint,
  IDEA_STAGE_CHIPS,
  stageCounts,
  stageLockedReason,
  type IdeaPermissions,
  type IdeaRowModel,
  type IdeaStageFilter,
  type IdeaVote,
} from '@/components/ideja/ideje-model';
import { ProstorHubRows } from '@/components/prostor/prostor-hub';
import { Button } from '@/components/ui/button';
import { OptionChip } from '@/components/ui/option-chip';
import { Row } from '@/components/ui/row';
import { SectionHeader } from '@/components/ui/section-header';
import { useThemeColors } from '@/theme/theme-provider';
import { text } from '@/theme/tokens';

const DAY = 86_400_000;

const MEMBER: IdeaPermissions = {
  canEdit: true,
  canVote: true,
  canSetStage: false,
  canConvert: false,
  canArchive: true,
  canComment: true,
};
const RESPONSIBLE: IdeaPermissions = { ...MEMBER, canSetStage: true };

function ideas(now: number): IdeaRowModel[] {
  const base = {
    text: '',
    convertedPageId: null,
    downvotes: 0,
    commentCount: 0,
    commentCountCapped: false,
    permissions: MEMBER,
  };
  return [
    {
      ...base,
      _id: 'i1',
      title: 'Referral program za postojeće klijente',
      createdAt: now - 3 * DAY,
      stage: 'predlog',
      upvotes: 4,
      downvotes: 1,
      userVote: 'up',
      commentCount: 3,
      author: { displayName: 'Ana Ilić' },
    },
    {
      ...base,
      _id: 'i2',
      title: 'Novi onboarding sa kratkim videom i proverom znanja posle prvog dana',
      createdAt: now - 7 * DAY,
      stage: 'razmatra_se',
      permissions: RESPONSIBLE,
      upvotes: 2,
      userVote: null,
      commentCount: 20,
      commentCountCapped: true,
      author: { displayName: 'Marko Jović' },
    },
    {
      ...base,
      _id: 'i3',
      title: 'Cenovnik v2',
      createdAt: now - 12 * DAY,
      stage: 'odobreno',
      permissions: { ...RESPONSIBLE, canConvert: true },
      upvotes: 6,
      userVote: 'down',
      commentCount: 1,
      author: { displayName: 'Jelena Petrović' },
    },
    {
      ...base,
      _id: 'i4',
      title: 'Landing za B2B',
      createdAt: now - 20 * DAY,
      stage: 'postalo_zadatak',
      convertedPageId: 'pg1',
      upvotes: 5,
      userVote: null,
      author: null,
    },
    {
      ...base,
      _id: 'i5',
      title: 'Ukinuti besplatni probni period',
      createdAt: now - 25 * DAY,
      stage: 'odbijeno',
      upvotes: 0,
      downvotes: 4,
      userVote: null,
      author: { displayName: 'Željko Đorđević' },
    },
  ];
}

/** PROSTOR K17: Ideje na telefonu — čipovi faza, lista, Faza i „Pretvori" po dozvolama. */
export function ProstorK17Katalog() {
  const colors = useThemeColors();
  const [now] = useState(() => Date.now());
  const [list] = useState(() => ideas(Date.now()));
  const [filter, setFilter] = useState<IdeaStageFilter>('sve');
  const [expanded, setExpanded] = useState(false);
  const [log, setLog] = useState('Dodirni glas, čip ili red.');
  const counts = stageCounts(list);
  const sections = buildSections(list, filter, expanded);

  return (
    <View style={styles.root}>
      <SectionHeader title="Ideje — čipovi i lista (K17)" />
      <Text style={[styles.caption, { color: colors.mutedForeground }]}>
        Faze sa brojem; „Sve“ grupiše po fazi, Odbijeno je skupljeno. Glas je zaseban dodir od reda.
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {IDEA_STAGE_CHIPS.map((chip) => (
          <OptionChip
            key={chip.value}
            label={chipLabel(chip.label, counts[chip.value])}
            active={filter === chip.value}
            onPress={() => setFilter(chip.value)}
          />
        ))}
      </ScrollView>
      {sections.map((section) => (
        <View key={section.stage}>
          <SectionHeader
            title={section.title}
            count={section.count}
            collapsible={filter === 'sve' && section.stage === 'odbijeno'}
            collapsed={section.collapsed}
            onToggle={filter === 'sve' && section.stage === 'odbijeno' ? () => setExpanded((open) => !open) : undefined}
          />
          {section.data.map((idea) => (
            <IdeaListRow
              key={idea._id}
              idea={idea}
              now={now}
              voteBusy={false}
              onOpen={() => setLog(`Otvori ideju: ${idea.title}`)}
              onLongPress={() => setLog(`Akcije ideje: ${idea.title}`)}
              onVote={(vote: IdeaVote) => setLog(`Glas ${vote === 'up' ? 'za' : 'protiv'}: ${idea.title}`)}
            />
          ))}
        </View>
      ))}

      <SectionHeader title="Faza i „Pretvori“ (K17)" />
      <Text style={[styles.caption, { color: colors.mutedForeground }]}>
        Odgovoran član menja fazu; ostali vide razlog. „Pretvori“ samo u fazi „Odobreno“.
      </Text>
      {[list[1], list[2], list[0], list[3]].map((idea) => {
        if (!idea) return null;
        const locked = stageLockedReason(idea, {
          changeStage: IDEA_STAGE_CHANGE_REASON,
          converted: IDEA_CONVERTED_REASON,
        });
        const convert = convertHint(idea);
        return (
          <View key={idea._id}>
            <Row
              icon={<Flag size={20} color={colors.mutedForeground} />}
              title="Faza"
              value={IDEA_STAGE_LABELS[idea.stage]}
              subtitle={locked ?? undefined}
              onPress={idea.permissions.canSetStage ? () => setLog(`Izbor faze: ${idea.title}`) : undefined}
              showChevron={idea.permissions.canSetStage}
            />
            {convert.kind === 'button' ? (
              <Button
                label="Pretvori u zadatak ili belešku"
                variant="secondary"
                onPress={() => setLog(`Pretvori: ${idea.title}`)}
              />
            ) : convert.kind === 'hint' ? (
              <Text style={[styles.meta, { color: colors.mutedForeground }]}>{convert.text}</Text>
            ) : null}
          </View>
        );
      })}

      <SectionHeader title="Prostor — red Ideje (K17)" />
      <ProstorHubRows areaCount={4} ideaVotes={2} channelsUnread={0} onOpen={(id) => setLog(`Otvori: ${id}`)} />
      <Text style={[styles.meta, { color: colors.mutedForeground }]}>{log}</Text>
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
  chips: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  meta: {
    ...text.meta,
  },
});
