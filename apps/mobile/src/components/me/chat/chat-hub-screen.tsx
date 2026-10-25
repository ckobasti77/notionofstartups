import { hubGroups, type HubInput } from '@devotion/shared';
import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { AccessibilityInfo, Alert } from 'react-native';

import { UndoBar } from '@/components/undo-bar';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useListRefresh } from '@/hooks/use-list-refresh';
import { useQueryState } from '@/hooks/use-query-state';
import { useQueryTolerant } from '@/hooks/use-query-tolerant';
import { useToday } from '@/hooks/use-today';
import type { ChatChannel } from '@/lib/chat';
import { readChatHubCollapsedRaw, writeChatHubCollapsedRaw } from '@/lib/device-prefs';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';

import { GroupSettingsController } from './group-settings-controller';
import { HubActionsSheet } from './hub-actions-sheet';
import {
  leaveGroupPrompt,
  parseHubCollapsed,
  serializeHubCollapsed,
  toggleHubCollapsed,
  type HubRowAction,
} from './hub-model';
import { ChatHubView, type HubListState } from './hub-view';
import { NewDmSheet, NewGroupSheet, type PeopleState } from './people-sheets';
import { useResubscribe } from './use-resubscribe';

/**
 * Pauza između zatvaranja jednog sheet-a i otvaranja drugog: dva istovremena RN
 * `Modal`-a na Androidu umeju da progutaju `onRequestClose` (isti obrazac i
 * ista konstanta kao `conversation-header.tsx`).
 */
const SHEET_HANDOFF_MS = 320;

/**
 * Tab „Poruke" (K16) — par web `ChatHubContainer`: hub `chat.listConversations`
 * (lično + kanali svih mojih startupa), „Nova poruka" (`chat.listPeople` →
 * `chat.openPersonalDm`), „Nova grupa" (`chat.createPersonalGroup`), dugi
 * pritisak na red (označi pročitano, podešavanja grupe, napusti grupu). Dodir
 * otvara `razgovor/[id]` za razgovor BILO KOG opsega — ništa ne menja aktivan
 * startup. „Pokušaj ponovo" obnavlja samo pretplatu huba (pretraga, sklopljene
 * grupe i otvoreni sheet-ovi ostaju).
 */
export function ChatHubScreen() {
  const router = useRouter();
  const today = useToday();
  const profile = useQuery(api.profiles.getCurrent, {});
  const meId = profile?._id ?? null;
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsedState] = useState<Set<string>>(() =>
    parseHubCollapsed(readChatHubCollapsedRaw()),
  );
  const [hubPaused, retry] = useResubscribe();
  const hub = useQueryState(api.chat.listConversations, hubPaused ? 'skip' : {});
  // Isti izvor kao bedž taba (P14) — Convex deli pretplatu sa tab barom.
  const unread = useQueryTolerant(api.chat.unreadSummary, {});
  const refreshControl = useListRefresh();

  const [dmOpen, setDmOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [actionsFor, setActionsFor] = useState<ChatChannel | null>(null);
  const [settings, setSettings] = useState<{ channelId: Id<'chatChannels'>; open: boolean } | null>(
    null,
  );
  const [pendingPersonId, setPendingPersonId] = useState<string | null>(null);

  // Ljudi se učitavaju pri prvom otvaranju sheet-a i ostaju pretplaćeni: sheet u
  // izlaznoj animaciji ne sme da pređe u skeleton, a sledeće otvaranje je odmah spremno.
  const [peopleWanted, setPeopleWanted] = useState(false);
  if (!peopleWanted && (dmOpen || groupOpen)) setPeopleWanted(true);
  const [peoplePaused, retryPeople] = useResubscribe();
  const peopleQuery = useQueryState(
    api.chat.listPeople,
    peopleWanted && !peoplePaused ? {} : 'skip',
  );

  const openDm = useMutation(api.chat.openPersonalDm);
  const createGroup = useMutation(api.chat.createPersonalGroup);
  const leaveGroup = useMutation(api.chat.leavePersonalGroup);
  const markChannelRead = useMutation(api.chat.markChannelRead);

  const data: HubInput<ChatChannel> | null = hub.status === 'ready' ? hub.data : null;
  const groups = useMemo(
    () => (data ? hubGroups(data, { query, collapsed }) : []),
    [data, query, collapsed],
  );
  const listState: HubListState<ChatChannel> =
    hub.status === 'loading'
      ? { status: 'loading' }
      : hub.status === 'error'
        ? { status: 'error', retry }
        : { status: 'ready', input: hub.data, capped: hub.data.capped };

  const people: PeopleState =
    peopleQuery.status === 'ready'
      ? { status: 'ready', people: peopleQuery.data }
      : peopleQuery.status === 'error'
        ? { status: 'error', retry: retryPeople }
        : { status: 'loading' };

  function openConversation(channelId: Id<'chatChannels'>) {
    router.push({ pathname: '/razgovor/[id]', params: { id: channelId } });
  }

  function toggleGroup(key: string) {
    const next = toggleHubCollapsed(collapsed, key);
    setCollapsedState(next);
    writeChatHubCollapsedRaw(serializeHubCollapsed(next));
  }

  async function pickPerson(personId: string) {
    if (pendingPersonId !== null) return;
    setPendingPersonId(personId);
    try {
      const opened = await openDm({ otherProfileId: personId as Id<'profiles'> });
      haptics.success();
      setDmOpen(false);
      openConversation(opened);
    } catch (error) {
      haptics.error();
      Alert.alert('Razgovor nije otvoren', accessErrorMessage(error, 'Pokušaj ponovo.'));
    } finally {
      setPendingPersonId(null);
    }
  }

  async function createPersonalGroup(name: string, memberIds: string[]): Promise<string | null> {
    try {
      const created = await createGroup({ name, memberProfileIds: memberIds as Id<'profiles'>[] });
      haptics.success();
      setGroupOpen(false);
      AccessibilityInfo.announceForAccessibility(`Grupa „${name}“ je napravljena.`);
      openConversation(created);
      return null;
    } catch (error) {
      return accessErrorMessage(error, 'Grupa nije napravljena.');
    }
  }

  function confirmLeave(channel: ChatChannel) {
    haptics.warning();
    const prompt = leaveGroupPrompt(channel.name);
    Alert.alert(prompt.title, prompt.message, [
      { text: 'Otkaži', style: 'cancel' },
      {
        text: 'Napusti grupu',
        style: 'destructive',
        onPress: async () => {
          try {
            await leaveGroup({ channelId: channel._id });
            haptics.success();
            // Bez pretplata na grupu kojoj više nemam pristup.
            setSettings((current) => (current?.channelId === channel._id ? null : current));
            AccessibilityInfo.announceForAccessibility('Grupa je napuštena.');
          } catch (error) {
            haptics.error();
            Alert.alert('Grupa nije napuštena', accessErrorMessage(error, 'Pokušaj ponovo.'));
          }
        },
      },
    ]);
  }

  function runAction(action: HubRowAction, channel: ChatChannel) {
    setActionsFor(null);
    switch (action) {
      case 'open':
        openConversation(channel._id);
        return;
      case 'markRead':
        void markChannelRead({ channelId: channel._id })
          .then(() => {
            haptics.success();
            AccessibilityInfo.announceForAccessibility('Označeno kao pročitano.');
          })
          .catch((error: unknown) => {
            haptics.error();
            Alert.alert('Označavanje nije uspelo', accessErrorMessage(error, 'Pokušaj ponovo.'));
          });
        return;
      case 'groupSettings':
        // Dva RN `Modal`-a se ne otvaraju istovremeno: meni prvo ode, pa sheet.
        setTimeout(() => setSettings({ channelId: channel._id, open: true }), SHEET_HANDOFF_MS);
        return;
      case 'leaveGroup':
        setTimeout(() => confirmLeave(channel), SHEET_HANDOFF_MS);
        return;
    }
  }

  return (
    <>
      <ChatHubView
        now={today.now}
        meId={meId}
        state={listState}
        groups={groups}
        query={query}
        onQueryChange={setQuery}
        onToggleGroup={toggleGroup}
        onOpen={(channel) => openConversation(channel._id)}
        onLongPress={setActionsFor}
        onNewMessage={() => setDmOpen(true)}
        onNewGroup={() => setGroupOpen(true)}
        unreadTotal={unread ? { unreadCount: unread.total.unreadCount } : null}
        refreshControl={refreshControl}
      />

      <HubActionsSheet
        channel={actionsFor}
        onClose={() => setActionsFor(null)}
        onAction={(action, channel) => runAction(action, channel as ChatChannel)}
      />
      <NewDmSheet
        open={dmOpen}
        onClose={() => setDmOpen(false)}
        people={people}
        onPick={(personId) => void pickPerson(personId)}
        pendingId={pendingPersonId}
      />
      <NewGroupSheet
        open={groupOpen}
        onClose={() => setGroupOpen(false)}
        people={people}
        onCreate={createPersonalGroup}
      />
      {settings ? (
        <GroupSettingsController
          key={settings.channelId}
          channelId={settings.channelId}
          open={settings.open}
          onClose={() => setSettings({ channelId: settings.channelId, open: false })}
          meId={meId}
        />
      ) : null}

      {/* „Poništi" posle izmene grupe. Iznad tab bara: traka sama dodaje donji inset. */}
      <UndoBar />
    </>
  );
}
