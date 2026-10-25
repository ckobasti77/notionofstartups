import {
  formatDateShort,
  type Perm,
  type StartupTaskStatus,
  type TaskPriorityKey,
} from '@devotion/shared';
import { LogIn, LogOut } from 'lucide-react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  DueChoiceChips,
  InlineDatePicker,
  PriorityChoiceChips,
  SheetTaskHeader,
  StatusChoiceChips,
} from '@/components/me/choice-chips';
import { dueChoiceOf } from '@/components/me/rok-plan-sheet';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { useRetained } from '@/hooks/use-retained';
import { useThemeColors } from '@/theme/theme-provider';
import { text } from '@/theme/tokens';

/** Koji izbor sheet pokazuje; `date` je kalendar iz „Rok" (nazad vraća na `due`). */
export type TaskMetaView = 'status' | 'priority' | 'due' | 'date' | 'assignees';

const VIEW_OVERLINE: Record<TaskMetaView, string> = {
  status: 'Status',
  priority: 'Prioritet',
  due: 'Rok',
  date: 'Rok',
  assignees: 'Izvršioci',
};

export type TaskMetaSheetProps = {
  /** `null` = zatvoren. */
  view: TaskMetaView | null;
  onViewChange: (view: TaskMetaView) => void;
  onClose: () => void;
  now: number;
  title: string;
  status: StartupTaskStatus;
  priority: TaskPriorityKey | null;
  dueDate: number | null;
  /** Zaključan metapodatak: zabranjen čip razlog pokazuje pre otvaranja, ovo je rezerva. */
  assigneesPerm: Perm;
  assignees: ReadonlyArray<{ profileId: string; displayName: string; avatarUrl: string | null }>;
  isAssignee: boolean;
  onStatus: (status: StartupTaskStatus) => void;
  onPriority: (priority: TaskPriorityKey) => void;
  onDue: (dueDate: number | null) => void;
  /** „Priključi se" / „Napusti zadatak" (ko nije kreator). */
  onJoinLeave: () => void;
};

/**
 * Izbor metapodataka na ekranu zadatka (K18, par web `MetaChip` popovera): jedan
 * donji sheet za status, prioritet, rok (čipovi Danas · Sutra · Vikend ·
 * Sledeće nedelje · Datum… · Bez roka) i izvršioce za ne-kreatora. Kalendar se
 * prikazuje U ovom sheet-u (ne drugi `Modal` preko njega — iOS ga ne prikazuje,
 * nalaz K12). Svaki izbor zatvara sheet: radnja je jedna, kao popover na webu.
 */
export function TaskMetaSheet({ view: current, ...props }: TaskMetaSheetProps) {
  const colors = useThemeColors();
  // Sadržaj ostaje tokom izlazne animacije (prikaz je već `null`).
  const view = useRetained(current);
  const { now, title, status, priority, dueDate, assigneesPerm, assignees, isAssignee } = props;

  return (
    <Sheet
      visible={current !== null}
      // „Nazad" (Android) i escape (VoiceOver) iz kalendara vraćaju na izbor roka.
      onClose={() => (current === 'date' ? props.onViewChange('due') : props.onClose())}
      maxHeight="90%">
      {view ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {view === 'date' ? (
            <InlineDatePicker value={dueDate} onBack={() => props.onViewChange('due')} onSelect={props.onDue} />
          ) : (
            <>
              <SheetTaskHeader overline={VIEW_OVERLINE[view]} title={title} startup={null} areaLabel={null} />
              {view === 'status' ? <StatusChoiceChips value={status} onSelect={props.onStatus} /> : null}
              {view === 'priority' ? (
                <PriorityChoiceChips value={priority} allowNone={false} onSelect={(next) => next && props.onPriority(next)} />
              ) : null}
              {view === 'due' ? (
                <DueChoiceChips
                  now={now}
                  selected={dueChoiceOf(dueDate, now)}
                  dateLabel={dueDate === null ? null : formatDateShort(dueDate)}
                  onShortcut={(_, value) => props.onDue(value)}
                  onPickDate={() => props.onViewChange('date')}
                  onNone={() => props.onDue(null)}
                />
              ) : null}
              {view === 'assignees' ? (
                <View style={styles.people}>
                  {assignees.length === 0 ? (
                    <Text style={[styles.muted, { color: colors.mutedForeground }]}>Niko još nije dodeljen.</Text>
                  ) : (
                    assignees.map((person) => (
                      <View key={person.profileId} style={styles.person}>
                        <Avatar name={person.displayName} uri={person.avatarUrl} size={32} />
                        <Text numberOfLines={1} style={[styles.personName, { color: colors.foreground }]}>
                          {person.displayName}
                        </Text>
                      </View>
                    ))
                  )}
                  {assigneesPerm.reason ? (
                    <Text style={[styles.muted, { color: colors.mutedForeground }]}>{assigneesPerm.reason}</Text>
                  ) : null}
                  <Button
                    label={isAssignee ? 'Napusti zadatak' : 'Priključi se'}
                    variant="secondary"
                    icon={
                      isAssignee ? (
                        <LogOut size={16} color={colors.foreground} />
                      ) : (
                        <LogIn size={16} color={colors.foreground} />
                      )
                    }
                    onPress={props.onJoinLeave}
                  />
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 16,
  },
  people: {
    gap: 12,
  },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
  },
  personName: {
    ...text.body,
    flex: 1,
  },
  muted: {
    ...text.body,
  },
});
