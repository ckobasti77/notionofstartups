import { AREA_LABEL_MAX, SETTINGS_TEXT, cleanAreaLabel } from '@devotion/shared';
import { Camera, ChevronDown, ChevronUp, KeyRound, Mail, Pencil, Plus, Trash2, Users } from 'lucide-react-native';
import { useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Row } from '@/components/ui/row';
import { SectionHeader } from '@/components/ui/section-header';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, text } from '@/theme/tokens';

/** Ogledalo `cleanRequiredText(..., "Naziv startupa", 100)`. */
const MAX_NAME_LENGTH = 100;
/** Ogledalo `cleanOptionalText(..., "Opis", 500)`. */
const MAX_DESCRIPTION_LENGTH = 500;

export type GeneralSectionProps = {
  name: string;
  description: string;
  logoUrl: string | null;
  /** Naziv, opis i logo menja samo admin; član vidi polja samo za čitanje. */
  canEdit: boolean;
  busySave: boolean;
  busyLogo: boolean;
  /** Ima nesačuvanih izmena naziva ili opisa. */
  dirty: boolean;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onSave: () => void;
  onPickFromLibrary: () => void;
  onPickFromCamera: () => void;
  onRemoveLogo: () => void;
};

/** Opšte: logo, naziv i opis startupa. */
export function GeneralSection(props: GeneralSectionProps) {
  const colors = useThemeColors();
  const { canEdit, busyLogo, busySave } = props;
  return (
    <View style={styles.section}>
      <SectionHeader title="Opšte" />
      <View style={styles.logoBlock}>
        <View>
          <Avatar name={props.name || 'Startup'} uri={props.logoUrl} size={72} />
          {busyLogo ? (
            <View style={[styles.logoBusy, { backgroundColor: `${colors.background}CC` }]}>
              <ActivityIndicator color={colors.primary} accessibilityLabel="Slanje loga" />
            </View>
          ) : null}
        </View>
        {canEdit ? (
          <>
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              PNG, JPG, WebP ili SVG · najviše 2 MB
            </Text>
            <View style={styles.logoActions}>
              <Button
                label="Iz galerije"
                variant="secondary"
                size="md"
                disabled={busyLogo}
                onPress={props.onPickFromLibrary}
              />
              <Button
                label="Slikaj"
                variant="secondary"
                size="md"
                icon={<Camera size={18} color={colors.foreground} />}
                disabled={busyLogo}
                onPress={props.onPickFromCamera}
              />
            </View>
            {props.logoUrl ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ukloni logo"
                disabled={busyLogo}
                onPress={props.onRemoveLogo}
                style={({ pressed }) => [
                  styles.removeLogo,
                  pressed && { backgroundColor: colors.muted },
                  busyLogo && styles.dimmed,
                ]}>
                <Trash2 size={18} color={colors.danger} />
                <Text style={[styles.removeLogoText, { color: colors.danger }]}>Ukloni logo</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
      </View>
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>Naziv</Text>
        <Input
          value={props.name}
          onChangeText={props.onNameChange}
          maxLength={MAX_NAME_LENGTH}
          editable={canEdit && !busySave}
          accessibilityLabel="Naziv startupa"
          accessibilityState={{ disabled: !canEdit }}
        />
      </View>
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>Kratak opis</Text>
        <Input
          value={props.description}
          onChangeText={props.onDescriptionChange}
          maxLength={MAX_DESCRIPTION_LENGTH}
          multiline
          numberOfLines={3}
          editable={canEdit && !busySave}
          accessibilityLabel="Opis startupa"
          accessibilityState={{ disabled: !canEdit }}
          style={styles.multiline}
        />
      </View>
      {canEdit ? (
        <Button
          label="Sačuvaj"
          loading={busySave}
          disabled={!props.name.trim() || !props.dirty || busySave}
          onPress={props.onSave}
        />
      ) : (
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          {SETTINGS_TEXT.adminOnlyGeneral}
        </Text>
      )}
    </View>
  );
}

export type SettingsArea = { _id: string; label: string };

export type AreasSectionProps = {
  areas: ReadonlyArray<SettingsArea>;
  /** Id oblasti čija izmena traje, ili `'nova'` za dodavanje. */
  busyId: string | null;
  /** `true` kad je izmena sačuvana (red izlazi iz izmene). */
  onRename: (areaId: string, label: string) => Promise<boolean>;
  onMove: (areaId: string, direction: -1 | 1) => void;
  onCreate: (label: string) => Promise<boolean>;
  /** Polje „Nova oblast” je dobilo fokus (ekran ga prelista iznad tastature). */
  onNewFieldFocus?: () => void;
};

/** Oblasti: preimenuj, pomeri gore/dole, nova oblast. Menja svaki član. */
export function AreasSection({ areas, busyId, onRename, onMove, onCreate, onNewFieldFocus }: AreasSectionProps) {
  const colors = useThemeColors();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newError, setNewError] = useState<string | null>(null);
  const busy = busyId !== null;

  const fail = (message: string, set: (value: string | null) => void) => {
    set(message);
    AccessibilityInfo.announceForAccessibility(message);
  };

  const commitEdit = async (area: SettingsArea) => {
    if (busy) return;
    const cleaned = cleanAreaLabel(draft);
    if (!cleaned.ok) {
      fail(cleaned.error, setError);
      return;
    }
    setError(null);
    // Isti naziv: nema šta da se šalje.
    if (cleaned.label === area.label || (await onRename(area._id, cleaned.label))) setEditingId(null);
  };

  const submitNew = async () => {
    if (busy) return;
    const cleaned = cleanAreaLabel(newLabel);
    if (!cleaned.ok) {
      fail(cleaned.error, setNewError);
      return;
    }
    setNewError(null);
    if (await onCreate(cleaned.label)) setNewLabel('');
  };

  return (
    <View style={styles.section}>
      <SectionHeader title="Oblasti" count={areas.length} />
      {areas.length === 0 ? (
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>Nema oblasti.</Text>
      ) : null}
      {areas.map((area, index) =>
        editingId === area._id ? (
          <View key={area._id} style={styles.editRow}>
            <Input
              value={draft}
              onChangeText={(value) => {
                setDraft(value);
                setError(null);
              }}
              maxLength={AREA_LABEL_MAX}
              invalid={error !== null}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => void commitEdit(area)}
              accessibilityLabel={`Naziv oblasti ${area.label}`}
            />
            {error ? (
              <Text
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
                style={[styles.error, { color: colors.destructive }]}>
                {error}
              </Text>
            ) : null}
            <View style={styles.editActions}>
              <Button
                label="Sačuvaj"
                size="md"
                loading={busyId === area._id}
                disabled={busy}
                onPress={() => void commitEdit(area)}
              />
              <Button
                label="Otkaži"
                size="md"
                variant="ghost"
                disabled={busy}
                onPress={() => {
                  setEditingId(null);
                  setError(null);
                }}
              />
            </View>
          </View>
        ) : (
          <View key={area._id} style={styles.areaRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${area.label}, preimenuj`}
              disabled={busy}
              onPress={() => {
                setEditingId(area._id);
                setDraft(area.label);
                setError(null);
              }}
              style={({ pressed }) => [styles.areaTitle, pressed && { backgroundColor: colors.muted }]}>
              <Text numberOfLines={1} style={[styles.areaLabel, { color: colors.foreground }]}>
                {area.label}
              </Text>
              {busyId === area._id ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Pencil size={16} color={colors.mutedForeground} />
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Pomeri ${area.label} gore`}
              accessibilityState={{ disabled: busy || index === 0 }}
              disabled={busy || index === 0}
              onPress={() => onMove(area._id, -1)}
              style={({ pressed }) => [
                styles.moveButton,
                pressed && { backgroundColor: colors.muted },
                (busy || index === 0) && styles.dimmed,
              ]}>
              <ChevronUp size={18} color={colors.foreground} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Pomeri ${area.label} dole`}
              accessibilityState={{ disabled: busy || index === areas.length - 1 }}
              disabled={busy || index === areas.length - 1}
              onPress={() => onMove(area._id, 1)}
              style={({ pressed }) => [
                styles.moveButton,
                pressed && { backgroundColor: colors.muted },
                (busy || index === areas.length - 1) && styles.dimmed,
              ]}>
              <ChevronDown size={18} color={colors.foreground} />
            </Pressable>
          </View>
        ),
      )}
      <View style={styles.newRow}>
        <View style={styles.newInput}>
          <Input
            value={newLabel}
            onChangeText={(value) => {
              setNewLabel(value);
              setNewError(null);
            }}
            onFocus={onNewFieldFocus}
            maxLength={AREA_LABEL_MAX}
            invalid={newError !== null}
            placeholder="Naziv nove oblasti"
            returnKeyType="done"
            onSubmitEditing={() => void submitNew()}
            accessibilityLabel="Naziv nove oblasti"
          />
        </View>
        <Button
          label="Nova oblast"
          variant="secondary"
          icon={<Plus size={18} color={colors.foreground} />}
          loading={busyId === 'nova'}
          disabled={busy}
          onPress={() => void submitNew()}
        />
      </View>
      {newError ? (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          style={[styles.error, { color: colors.destructive }]}>
          {newError}
        </Text>
      ) : null}
    </View>
  );
}

export type TeamSectionProps = {
  isAdmin: boolean;
  onMembers: () => void;
  onInvites: () => void;
  onPasswords: () => void;
  onCreateStartup: () => void;
};

/** Tim: članovi za sve, pozivnice, lozinke i novi startup samo za admina. */
export function TeamSection({ isAdmin, onMembers, onInvites, onPasswords, onCreateStartup }: TeamSectionProps) {
  const colors = useThemeColors();
  const icon = (Icon: typeof Users) => <Icon size={20} color={colors.mutedForeground} />;
  return (
    <View>
      <SectionHeader title="Tim" />
      <Row icon={icon(Users)} title="Članovi tima" onPress={onMembers} />
      {isAdmin ? (
        <>
          <Row icon={icon(Mail)} title="Pozivnice" onPress={onInvites} />
          <Row
            icon={icon(KeyRound)}
            title="Lozinke"
            subtitle={SETTINGS_TEXT.passwordsNote}
            onPress={onPasswords}
          />
          <Row icon={icon(Plus)} title="Novi startup" onPress={onCreateStartup} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 8,
  },
  logoBlock: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  logoBusy: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  logoActions: {
    flexDirection: 'row',
    gap: 8,
  },
  removeLogo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 12,
    borderRadius: radius.control,
  },
  removeLogoText: {
    ...text.body,
    fontWeight: fontWeight.medium,
  },
  dimmed: {
    opacity: 0.4,
  },
  field: {
    gap: 6,
  },
  label: {
    ...text.meta,
  },
  hint: {
    ...text.meta,
  },
  multiline: {
    minHeight: 80,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  editRow: {
    gap: 8,
    paddingVertical: 8,
  },
  editActions: {
    flexDirection: 'row',
    gap: 8,
  },
  error: {
    ...text.body,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  moveButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
  },
  newRow: {
    gap: 8,
    paddingTop: 8,
  },
  newInput: {
    flexGrow: 1,
  },
  areaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET,
  },
  areaTitle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 4,
    borderRadius: radius.control,
  },
  areaLabel: {
    ...text.body,
    flex: 1,
  },
});
