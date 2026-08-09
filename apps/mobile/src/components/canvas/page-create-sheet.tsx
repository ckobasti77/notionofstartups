import { useMutation, useQuery } from 'convex/react';
import { ChevronDown, ChevronRight, FileText, ListTodo, Users } from 'lucide-react-native';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { OptionChip } from '@/components/ui/option-chip';
import { Row } from '@/components/ui/row';
import {
  AssigneePickerSheet,
  assigneeCountLabel,
} from '@/components/zadatak/assignee-picker';
import {
  CheckpointDraftList,
  type CheckpointDraft,
} from '@/components/zadatak/checkpoint-draft-list';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import {
  dueDateInDays,
  priorityColor,
  statusColor,
  TASK_PRIORITY_META,
  TASK_PRIORITY_ORDER,
  TASK_STATUS_META,
  TASK_STATUS_ORDER,
  type TaskPriority,
  type TaskStatus,
} from '@/lib/task-meta';
import { useThemeColors } from '@/theme/theme-provider';
import { fontSize, fontWeight, radius, type ColorTokens } from '@/theme/tokens';

const MAX_TITLE = 200;
const MAX_INSTRUCTIONS = 20_000;

type PageKind = 'note' | 'task';

type DuePreset = { label: string; days: number | null };

/** Isti preseti kao u meniju akcija zadatka — bez native date pickera (nema novog paketa). */
const DUE_PRESETS: readonly DuePreset[] = [
  { label: 'Bez roka', days: null },
  { label: 'Danas', days: 0 },
  { label: 'Sutra', days: 1 },
  { label: 'Za 7 dana', days: 7 },
];

/**
 * Kreiranje stranice/pod-stranice iz canvas rail-a i sekcije „Podstranice" (M4.4).
 * Native unos naslova + vrste (beleška/zadatak) → `pages.create`; WebView (koji sluša
 * `getAreaCanvasByArea` / `getPageCanvasByPage`) sam pokupi novi čvor realtime.
 * Fajl/tabela se prave na desktopu (traže prilog/kolone) — namerno izostavljene (§5.2).
 *
 * PARITET SA WEBOM (`create-page-dialog.tsx`): zadatak nosi i status, prioritet,
 * izvršioce, rok, instrukcije i podzadatke. Da sheet ne postane formular preko celog
 * ekrana, sve to stoji iza reda „Više opcija" koji se razvija — naslov i vrsta ostaju
 * odmah vidljivi, pa je brz unos i dalje jedan potez. Beleška nema šta da otvori, pa
 * za nju reda nema (sadržaj beleške se piše u editoru, posle kreiranja).
 *
 * `parentPageId` bira nivo: `null` = koren oblasti (canvas oblasti), id stranice =
 * pod-stranica (canvas stranice).
 */
export function PageCreateSheet({
  open,
  startupId,
  areaId,
  parentPageId,
  onClose,
}: {
  open: boolean;
  startupId: Id<'startups'>;
  areaId: Id<'startupAreas'>;
  parentPageId: Id<'pages'> | null;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const create = useMutation(api.pages.create);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<PageKind>('note');
  const [busy, setBusy] = useState(false);

  // Detalji zadatka (iza „Više opcija").
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<TaskStatus>('backlog');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [assigneeIds, setAssigneeIds] = useState<Id<'profiles'>[]>([]);
  const [dueDays, setDueDays] = useState<number | null>(null);
  const [instructions, setInstructions] = useState('');
  const [checkpoints, setCheckpoints] = useState<CheckpointDraft[]>([]);
  const [assigneesOpen, setAssigneesOpen] = useState(false);

  // Članovi se učitavaju tek kad zaista trebaju (otvoren sheet + razvijene opcije
  // zadatka) — brzo kreiranje beleške ne plaća `listMembers`.
  const members = useQuery(
    api.startups.listMembers,
    open && kind === 'task' && expanded ? { startupId, limit: 50 } : 'skip',
  );

  const reset = () => {
    setTitle('');
    setKind('note');
    setExpanded(false);
    setStatus('backlog');
    setPriority('medium');
    setAssigneeIds([]);
    setDueDays(null);
    setInstructions('');
    setCheckpoints([]);
  };

  const closeAll = () => {
    setAssigneesOpen(false);
    onClose();
  };

  const submit = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      Alert.alert('Prazan naslov', 'Unesi naslov stranice.');
      return;
    }
    setBusy(true);
    try {
      const cleanInstructions = instructions.trim();
      await create({
        startupId,
        areaId,
        parentPageId,
        kind,
        title: cleanTitle,
        // Opciona polja se šalju samo za zadatak i samo kad su postavljena —
        // `pages.create` ih validira kroz `validateWorkspacePageTarget`.
        ...(kind === 'task'
          ? {
              taskStatus: status,
              taskPriority: priority,
              ...(assigneeIds.length > 0 ? { assigneeProfileIds: assigneeIds } : {}),
              ...(dueDays === null ? {} : { dueDate: dueDateInDays(dueDays) }),
              ...(cleanInstructions ? { instructions: cleanInstructions } : {}),
              ...(checkpoints.length > 0 ? { checkpoints } : {}),
            }
          : {}),
      });
      reset();
      closeAll();
    } catch (error) {
      Alert.alert('Greška', accessErrorMessage(error, 'Stranica nije kreirana.'));
    } finally {
      setBusy(false);
    }
  };

  // Sažetak u podnaslovu reda „Više opcija" — pokazuje šta je već izabrano, pa se
  // sekcija ne mora otvarati da bi se to videlo.
  const optionsSummary = [
    TASK_STATUS_META[status].label,
    TASK_PRIORITY_META[priority].label,
    assigneeIds.length > 0 ? `${assigneeIds.length} izvršilaca` : null,
    dueDays === null ? null : DUE_PRESETS.find((p) => p.days === dueDays)?.label,
    checkpoints.length > 0 ? `${checkpoints.length} podzadataka` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={closeAll}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Zatvori"
        style={styles.backdrop}
        onPress={closeAll}
      />
      <KeyboardAvoidingView behavior="padding" style={styles.avoider} pointerEvents="box-none">
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.popover, borderColor: colors.border, paddingBottom: insets.bottom + 12 },
          ]}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled">
            <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>
              {parentPageId === null ? 'Nova stranica' : 'Nova podstranica'}
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              autoFocus
              maxLength={MAX_TITLE}
              placeholder={kind === 'task' ? 'Šta treba uraditi?' : 'Naslov'}
              placeholderTextColor={colors.mutedForeground}
              selectionColor={colors.primary}
              style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.input }]}
            />
            <View style={[styles.kindRow, { backgroundColor: colors.muted }]}>
              <KindSegment
                label="Beleška"
                icon={<FileText size={16} color={kind === 'note' ? colors.foreground : colors.mutedForeground} />}
                active={kind === 'note'}
                disabled={busy}
                onPress={() => setKind('note')}
                colors={colors}
              />
              <KindSegment
                label="Zadatak"
                icon={<ListTodo size={16} color={kind === 'task' ? colors.foreground : colors.mutedForeground} />}
                active={kind === 'task'}
                disabled={busy}
                onPress={() => setKind('task')}
                colors={colors}
              />
            </View>

            {kind === 'task' ? (
              <>
                <Row
                  title="Više opcija"
                  subtitle={expanded ? undefined : optionsSummary}
                  onPress={() => setExpanded((value) => !value)}
                  disabled={busy}
                  showChevron={false}
                  accessibilityLabel={`Više opcija zadatka${expanded ? '' : `, ${optionsSummary}`}`}
                  accessibilityHint={expanded ? 'Skuplja detalje zadatka' : 'Otvara detalje zadatka'}
                  style={styles.moreRow}
                  icon={
                    expanded ? (
                      <ChevronDown size={20} color={colors.mutedForeground} />
                    ) : (
                      <ChevronRight size={20} color={colors.mutedForeground} />
                    )
                  }
                />

                {expanded ? (
                  <>
                    <Section label="Status" colors={colors}>
                      <View style={styles.chips}>
                        {TASK_STATUS_ORDER.map((value) => (
                          <OptionChip
                            key={value}
                            label={TASK_STATUS_META[value].label}
                            dotColor={statusColor(colors, value)}
                            active={status === value}
                            disabled={busy}
                            onPress={() => setStatus(value)}
                          />
                        ))}
                      </View>
                    </Section>

                    <Section label="Prioritet" colors={colors}>
                      <View style={styles.chips}>
                        {TASK_PRIORITY_ORDER.map((value) => (
                          <OptionChip
                            key={value}
                            label={TASK_PRIORITY_META[value].label}
                            dotColor={priorityColor(colors, value)}
                            active={priority === value}
                            disabled={busy}
                            onPress={() => setPriority(value)}
                          />
                        ))}
                      </View>
                    </Section>

                    <Section label="Rok" colors={colors}>
                      <View style={styles.chips}>
                        {DUE_PRESETS.map((preset) => (
                          <OptionChip
                            key={preset.label}
                            label={preset.label}
                            active={dueDays === preset.days}
                            disabled={busy}
                            onPress={() => setDueDays(preset.days)}
                          />
                        ))}
                      </View>
                    </Section>

                    <Row
                      variant="value"
                      title={assigneeCountLabel(assigneeIds.length)}
                      onPress={() => setAssigneesOpen(true)}
                      disabled={busy}
                      accessibilityLabel={`Izaberi izvršioce, izabrano ${assigneeIds.length}`}
                      style={styles.moreRow}
                      icon={<Users size={20} color={colors.mutedForeground} />}
                    />

                    <Section label="Instrukcije" colors={colors}>
                      <TextInput
                        value={instructions}
                        onChangeText={setInstructions}
                        editable={!busy}
                        multiline
                        maxLength={MAX_INSTRUCTIONS}
                        placeholder="Šta treba uraditi i koji rezultat se očekuje…"
                        placeholderTextColor={colors.mutedForeground}
                        selectionColor={colors.primary}
                        style={[
                          styles.input,
                          styles.textarea,
                          { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.input },
                        ]}
                      />
                    </Section>

                    <Section label="Podzadaci" colors={colors}>
                      <CheckpointDraftList
                        items={checkpoints}
                        onChange={setCheckpoints}
                        disabled={busy}
                      />
                    </Section>
                  </>
                ) : null}
              </>
            ) : null}
          </ScrollView>
          <View style={styles.actions}>
            <Button label="Otkaži" variant="ghost" onPress={closeAll} disabled={busy} style={styles.flexBtn} />
            <Button label="Dodaj" onPress={() => void submit()} loading={busy} style={styles.flexBtn} />
          </View>
        </View>
      </KeyboardAvoidingView>

      <AssigneePickerSheet
        open={assigneesOpen}
        members={members}
        selectedIds={assigneeIds}
        onChange={setAssigneeIds}
        onClose={() => setAssigneesOpen(false)}
      />
    </Modal>
  );
}

function Section({
  label,
  colors,
  children,
}: {
  label: string;
  colors: ColorTokens;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{label}</Text>
      {children}
    </View>
  );
}

function KindSegment({
  label,
  icon,
  active,
  disabled,
  onPress,
  colors,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  disabled: boolean;
  onPress: () => void;
  colors: ColorTokens;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.segment,
        active && { backgroundColor: colors.card, borderColor: colors.border },
      ]}>
      {icon}
      <Text
        style={[styles.segmentLabel, { color: active ? colors.foreground : colors.mutedForeground }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  avoider: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 16,
    paddingHorizontal: 20,
    // Ograniči visinu i skroluj sadržaj: na niskom ekranu sa tastaturom sve stane.
    maxHeight: '85%',
  },
  scroll: {
    flexGrow: 0,
  },
  content: {
    gap: 10,
    paddingBottom: 4,
  },
  heading: {
    fontSize: 18,
    fontWeight: fontWeight.semibold,
  },
  input: {
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: fontSize.base,
  },
  textarea: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  kindRow: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: radius.lg,
    gap: 4,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  segmentLabel: {
    fontSize: 14,
    fontWeight: fontWeight.medium,
  },
  // Red unutar sheeta (već ima horizontalni padding) — bez dodatnog.
  moreRow: {
    paddingHorizontal: 0,
    borderRadius: radius.md,
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
