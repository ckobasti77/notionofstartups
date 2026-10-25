import { useMutation } from 'convex/react';
import { useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useQueryState } from '@/hooks/use-query-state';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { pushUndo } from '@/lib/undo';

import {
  GroupSettingsSheet,
  type GroupSettingsState,
  type HubPersonModel,
  type PeopleState,
} from './people-sheets';
import { useResubscribe } from './use-resubscribe';

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Podešavanja lične grupe sa podacima (K16) — par web `GroupSettingsContainer`:
 * ime i uloga iz `chat.getChannel`, članovi iz `chat.channelMembers`, ljudi iz
 * `chat.listPeople`. „Sačuvaj" zove `chat.updatePersonalGroup` i gura traku
 * „Poništi" (mutacija vraća stanje od pre); „Napusti grupu" zove
 * `chat.leavePersonalGroup`. Isti kontroler koriste hub (dugi pritisak) i
 * ekran razgovora (meni ⋯).
 *
 * Pretplate kreću pri prvom otvaranju i ostaju dok je kontroler montiran:
 * sheet u izlaznoj animaciji ne sme da padne u skeleton.
 */
export function GroupSettingsController({
  channelId,
  open,
  onClose,
  meId,
  onLeaveStart,
  onLeaveFailed,
  onLeft,
}: {
  channelId: Id<'chatChannels'>;
  open: boolean;
  onClose: () => void;
  /** Moj profil — ne prikazujem sebe među članovima (vlasnik ostaje uvek). */
  meId: string | null;
  /**
   * Tik PRE poziva `leavePersonalGroup`: ekran razgovora gasi pretplate koje bi
   * server odbio čim izlazak prođe (lista poruka baca). `onLeaveFailed` vraća.
   */
  onLeaveStart?: () => void;
  onLeaveFailed?: () => void;
  /** Posle uspešnog napuštanja (npr. razgovor → nazad na listu). */
  onLeft?: () => void;
}) {
  const [wanted, setWanted] = useState(open);
  if (open && !wanted) setWanted(true);
  // Izlazak iz grupe: pretplate se gase PRE poziva (posle njega server ih odbija),
  // a sheet do kraja izlazne animacije drži poslednje spremno stanje (`frozen`).
  const [leaving, setLeaving] = useState(false);
  const [frozen, setFrozen] = useState<GroupSettingsState | null>(null);
  const active = wanted && !leaving;

  const [paused, resubscribe] = useResubscribe();
  const [peoplePaused, retryPeople] = useResubscribe();
  const args = active && !paused ? { channelId } : 'skip';
  const channel = useQueryState(api.chat.getChannel, args);
  const members = useQueryState(api.chat.channelMembers, args);
  const peopleQuery = useQueryState(api.chat.listPeople, active && !peoplePaused ? {} : 'skip');
  const updateGroup = useMutation(api.chat.updatePersonalGroup);
  const leaveGroup = useMutation(api.chat.leavePersonalGroup);

  const people: PeopleState =
    peopleQuery.status === 'ready'
      ? { status: 'ready', people: peopleQuery.data }
      : peopleQuery.status === 'error'
        ? { status: 'error', retry: retryPeople }
        : { status: 'loading' };

  let state: GroupSettingsState;
  if (people.status === 'error') {
    state = people;
  } else if (channel.status === 'error' || members.status === 'error') {
    state = { status: 'error', retry: resubscribe };
  } else if (
    channel.status === 'loading' ||
    members.status === 'loading' ||
    people.status === 'loading'
  ) {
    state = { status: 'loading' };
  } else {
    const shared = new Map(people.people.map((person) => [person._id, person.sharedStartupNames]));
    const current: HubPersonModel[] = members.data
      .filter((member) => member.profile._id !== meId)
      .map((member) => ({
        _id: member.profile._id,
        displayName: member.profile.displayName,
        avatarUrl: member.profile.avatarUrl,
        sharedStartupNames: shared.get(member.profile._id) ?? [],
      }));
    state = {
      status: 'ready',
      name: channel.data.name,
      isOwner: channel.data.myRole === 'owner',
      members: current,
      people: people.people,
    };
  }

  async function save(name: string, memberIds: string[]): Promise<string | null> {
    try {
      const result = await updateGroup({
        channelId,
        name,
        memberProfileIds: memberIds as Id<'profiles'>[],
      });
      haptics.success();
      pushUndo({
        label: 'Grupa je sačuvana.',
        action: {
          kind: 'personalGroup',
          channelId,
          name: result.previousName,
          profileIds: result.previousProfileIds,
        },
      });
      return null;
    } catch (error) {
      return accessErrorMessage(error, 'Izmena grupe nije sačuvana.');
    }
  }

  async function leave(): Promise<string | null> {
    setFrozen(state);
    setLeaving(true);
    onLeaveStart?.();
    // Dva frejma: React mora da primeni `leaving` (demontira listu poruka i
    // skine pretplate) PRE nego što server oduzme pristup.
    await nextFrame();
    await nextFrame();
    try {
      await leaveGroup({ channelId });
      haptics.success();
      AccessibilityInfo.announceForAccessibility('Grupa je napuštena.');
      onLeft?.();
      return null;
    } catch (error) {
      setLeaving(false);
      setFrozen(null);
      onLeaveFailed?.();
      return accessErrorMessage(error, 'Grupa nije napuštena.');
    }
  }

  return (
    <GroupSettingsSheet
      open={open}
      onClose={onClose}
      state={frozen ?? state}
      onSave={save}
      onLeave={leave}
    />
  );
}
