import { Tabs } from 'expo-router';
import { FolderClosed, Inbox, Menu, MessageCircle, Sun, type LucideIcon } from 'lucide-react-native';
import type { ColorValue } from 'react-native';

import { TabIcon } from '@/components/motion';
import { api } from '@/convex/_generated/api';
import { useQueryTolerant } from '@/hooks/use-query-tolerant';
import { haptics } from '@/lib/haptics';
import { chatBadge, inboxBadge, TAB_TITLES } from '@/lib/tabs';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight } from '@/theme/tokens';

/**
 * Tab bar posle prelaska na lični nivo (O1, plan K01 §6): Danas · Prostor ·
 * Poruke · Inbox · Više. Imena FAJLOVA su ista kao pre (D1) — deep linkovi
 * (`devotion://chat`) i `router.navigate('/chat')` ostaju važeći; menjaju se
 * naslovi, ikonice (E13) i izvor bedževa. Zaglavlje nosi svaki tab sam
 * (`MeHeader` za globalne, `AppHeader` sa biračem startupa u Prostoru), zato
 * je `headerShown: false`.
 *
 * Aktivan tab je JEDINO obojeno mesto u traci — accent ikonica i labela;
 * neaktivni su prigušeni (`subtle`), sa tanjim potezom. Ikonica izabranog taba
 * kratko odskoči (`TabIcon`, spring `bouncy`).
 *
 * Bedževi su GLOBALNI (P14): Poruke = nepročitane poruke svih aktivnih startupa
 * + lične (`chat.unreadSummary.total`), Inbox = nepročitana obaveštenja iz svih
 * startupa + lična (`inbox.unreadCounts.total`). Ne čitaju aktivan startup.
 * Greška brojača ne obara navigaciju — bedž se samo ne prikaže.
 */
export default function TabsLayout() {
  const colors = useThemeColors();
  const inboxCounts = useQueryTolerant(api.inbox.unreadCounts, {});
  const chatUnread = useQueryTolerant(api.chat.unreadSummary, {});
  const inbox = inboxBadge(inboxCounts);
  const chat = chatBadge(chatUnread);

  /** Ikonica taba: accent + deblji potez kad je aktivna, inače prigušeno. */
  const tabIcon =
    (Icon: LucideIcon) =>
    ({ focused, size }: { focused: boolean; color: ColorValue; size: number }) => (
      <TabIcon
        icon={Icon}
        focused={focused}
        color={focused ? colors.primaryText : colors.subtle}
        size={size}
      />
    );

  return (
    <Tabs
      // Promena taba je izbor, ne akcija — najtiši haptički signal, jednom po tabu.
      screenListeners={{ tabPress: () => haptics.select() }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primaryText,
        tabBarInactiveTintColor: colors.subtle,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: fontWeight.medium },
        tabBarItemStyle: { paddingTop: 4 },
        // Badge nosi belu na punom indigu (`primary`), ne na tintu — zato
        // `primary`, a ne `primaryText`.
        tabBarBadgeStyle: {
          backgroundColor: colors.primary,
          color: colors.primaryForeground,
          fontSize: 11,
          fontWeight: fontWeight.semibold,
        },
      }}>
      <Tabs.Screen
        name="danas"
        options={{ title: TAB_TITLES.danas, tabBarIcon: tabIcon(Sun) }}
      />
      <Tabs.Screen
        name="prostor"
        options={{ title: TAB_TITLES.prostor, tabBarIcon: tabIcon(FolderClosed) }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: TAB_TITLES.chat,
          tabBarIcon: tabIcon(MessageCircle),
          tabBarBadge: chat.label,
          tabBarAccessibilityLabel: chat.accessibilityLabel,
        }}
      />
      <Tabs.Screen
        name="obavestenja"
        options={{
          title: TAB_TITLES.obavestenja,
          tabBarIcon: tabIcon(Inbox),
          tabBarBadge: inbox.label,
          tabBarAccessibilityLabel: inbox.accessibilityLabel,
        }}
      />
      <Tabs.Screen name="vise" options={{ title: TAB_TITLES.vise, tabBarIcon: tabIcon(Menu) }} />
    </Tabs>
  );
}
