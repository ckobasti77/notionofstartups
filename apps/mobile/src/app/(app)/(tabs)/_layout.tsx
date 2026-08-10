import { useQuery } from 'convex/react';
import { Tabs } from 'expo-router';
import { Bell, FolderClosed, House, MessageCircle, Menu, type LucideIcon } from 'lucide-react-native';
import type { ColorValue } from 'react-native';

import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight } from '@/theme/tokens';

/** Iznad ovoga badge prikazuje „99+" — dvocifren broj je granica čitljivosti. */
const BADGE_CAP = 99;

function badgeLabel(count: number, capped: boolean): string | undefined {
  if (count <= 0) return undefined;
  if (capped || count > BADGE_CAP) return `${BADGE_CAP}+`;
  return String(count);
}

/**
 * Tab bar sa pet tabova: Danas · Prostor · Chat · Obaveštenja · Više
 * (docs/mobile/02-EKRANI.md, sekcija 2). Zaglavlje nosi svaki tab sam
 * (`TabScreen` → `AppHeader`), zato je `headerShown: false`.
 *
 * Aktivan tab je JEDINO obojeno mesto u traci — accent ikonica i labela; neaktivni
 * su prigušeni (`subtle`), sa tanjim potezom ikonice. Jedini izuzetak su bedževi
 * nepročitanog na Chatu i Obaveštenjima — pandan web `workspace-shell` bedžu na
 * zvonu i ikonici chata. Na telefonu vrede više nego na webu jer je aplikacija
 * najčešće zatvorena kad obaveštenje stigne.
 */
export default function TabsLayout() {
  const colors = useThemeColors();
  const { activeStartupId } = useActiveStartup();

  const unreadNotifications = useQuery(
    api.notifications.unreadCount,
    activeStartupId ? { startupId: activeStartupId } : 'skip',
  );
  const chatUnread = useQuery(api.chat.unreadSummary, {});

  // Chat badge je po AKTIVNOM startupu, da odgovara onome što tab zaista prikazuje
  // (`chat.listChannels` je scope-ovan na startup). Globalni zbir bi obećavao
  // poruke koje se u tom tabu ne vide.
  const chatCount =
    activeStartupId === null
      ? 0
      : (chatUnread?.byStartup.find((entry) => entry.startupId === activeStartupId)?.unreadCount ??
        0);

  /** Ikonica taba: accent + deblji potez kad je aktivna, inače prigušeno. */
  const tabIcon =
    (Icon: LucideIcon) =>
    ({ focused, size }: { focused: boolean; color: ColorValue; size: number }) => (
      <Icon
        color={focused ? colors.primaryText : colors.subtle}
        size={size}
        strokeWidth={focused ? 2.4 : 1.8}
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
        options={{ title: 'Danas', tabBarIcon: tabIcon(House) }}
      />
      <Tabs.Screen
        name="prostor"
        options={{ title: 'Prostor', tabBarIcon: tabIcon(FolderClosed) }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: tabIcon(MessageCircle),
          tabBarBadge: badgeLabel(chatCount, false),
          tabBarAccessibilityLabel:
            chatCount > 0 ? `Chat, ${chatCount} nepročitanih poruka` : 'Chat',
        }}
      />
      <Tabs.Screen
        name="obavestenja"
        options={{
          title: 'Obaveštenja',
          tabBarIcon: tabIcon(Bell),
          tabBarBadge: badgeLabel(
            unreadNotifications?.count ?? 0,
            unreadNotifications?.capped ?? false,
          ),
          tabBarAccessibilityLabel:
            (unreadNotifications?.count ?? 0) > 0
              ? `Obaveštenja, ${unreadNotifications?.count} nepročitanih`
              : 'Obaveštenja',
        }}
      />
      <Tabs.Screen name="vise" options={{ title: 'Više', tabBarIcon: tabIcon(Menu) }} />
    </Tabs>
  );
}
