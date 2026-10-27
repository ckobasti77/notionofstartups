import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  AreasSection,
  GeneralSection,
  TeamSection,
} from '@/components/podesavanja/settings-sections';
import { SectionHeader } from '@/components/ui/section-header';
import { useThemeColors } from '@/theme/theme-provider';
import { text } from '@/theme/tokens';

const noop = () => {};

const AREAS = [
  { _id: 'a1', label: 'Razvoj' },
  { _id: 'a2', label: 'Marketing' },
  { _id: 'a3', label: 'Prodaja' },
  { _id: 'a4', label: 'Ostalo' },
];

/** Katalog K20: Podešavanja startupa — admin, član, oblasti i Tim. */
export function PodesavanjaK20Katalog() {
  const colors = useThemeColors();
  const [areas, setAreas] = useState(AREAS);
  const [name, setName] = useState('Cluck Rush');
  const [description, setDescription] = useState('Naručivanje hrane za ceo sprat.');
  return (
    <View style={styles.root}>
      <SectionHeader title="Podešavanja startupa — admin (K20)" />
      <Text style={[styles.caption, { color: colors.mutedForeground }]}>
        Opšte menja admin; oblasti svaki član; Tim vodi na Članove, Pozivnice i Lozinke.
      </Text>
      <GeneralSection
        name={name}
        description={description}
        logoUrl={null}
        canEdit
        busySave={false}
        busyLogo={false}
        dirty
        onNameChange={setName}
        onDescriptionChange={setDescription}
        onSave={noop}
        onPickFromLibrary={noop}
        onPickFromCamera={noop}
        onRemoveLogo={noop}
      />
      <AreasSection
        areas={areas}
        busyId={null}
        onRename={async (areaId, label) => {
          setAreas((current) => current.map((area) => (area._id === areaId ? { ...area, label } : area)));
          return true;
        }}
        onMove={noop}
        onCreate={async () => true}
      />
      <TeamSection isAdmin onMembers={noop} onInvites={noop} onPasswords={noop} onCreateStartup={noop} />

      <SectionHeader title="Podešavanja startupa — član (K20)" />
      <GeneralSection
        name="Cluck Rush"
        description="Naručivanje hrane za ceo sprat."
        logoUrl={null}
        canEdit={false}
        busySave={false}
        busyLogo={false}
        dirty={false}
        onNameChange={noop}
        onDescriptionChange={noop}
        onSave={noop}
        onPickFromLibrary={noop}
        onPickFromCamera={noop}
        onRemoveLogo={noop}
      />
      <TeamSection isAdmin={false} onMembers={noop} onInvites={noop} onPasswords={noop} onCreateStartup={noop} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 16 },
  caption: { ...text.meta },
});
