import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import {
  CHANNEL_VERSION,
  NOTIFICATION_CHANNELS,
  channelIdFor,
  type ChannelBase,
  type ChannelImportance,
} from "@/convex/lib/notificationChannels";

/**
 * Kreiranje Android kanala pri pokretanju + brisanje starijih generacija.
 *
 * Katalog (imena, zvuci, importance, ID-jevi) dolazi iz deljenog modula
 * `@/convex/lib/notificationChannels` — isti izvor koji server koristi da cilja
 * kanal, pa se telefon i backend NE mogu razići oko ID-jeva.
 *
 * iOS nema kanale: tamo zvuk i `interruptionLevel` idu po push payload-u.
 */

/**
 * Android-only propovi koji su — kao i zvuk — ZAKLJUČANI pri kreiranju kanala i
 * menjaju se samo kroz nov `_vN` kanal (bump `CHANNEL_VERSION`). Zato se
 * odlučuju odmah. Server ih ne koristi, pa žive ovde, ne u deljenom katalogu.
 */
type AndroidChannelProps = {
  vibrationPattern?: number[];
  enableVibrate: boolean;
  bypassDnd: boolean;
  lockscreenVisibility: Notifications.AndroidNotificationVisibility;
  showBadge: boolean;
};

const PRIVATE = Notifications.AndroidNotificationVisibility.PRIVATE;

const ANDROID_PROPS: Record<ChannelBase, AndroidChannelProps> = {
  // Vibracija je prepoznatljiva kao i zvuk: „traže te" i „odluka" imaju jači,
  // dvostruki puls; kanalska priča i tiho — bez vibracije.
  dm: { enableVibrate: true, vibrationPattern: [0, 200], bypassDnd: false, lockscreenVisibility: PRIVATE, showBadge: true },
  mention: { enableVibrate: true, vibrationPattern: [0, 120, 60, 120], bypassDnd: false, lockscreenVisibility: PRIVATE, showBadge: true },
  channel: { enableVibrate: false, bypassDnd: false, lockscreenVisibility: PRIVATE, showBadge: true },
  task: { enableVibrate: true, vibrationPattern: [0, 200], bypassDnd: false, lockscreenVisibility: PRIVATE, showBadge: true },
  deadline: { enableVibrate: true, vibrationPattern: [0, 250, 100, 250], bypassDnd: false, lockscreenVisibility: PRIVATE, showBadge: true },
  vote: { enableVibrate: true, vibrationPattern: [0, 300, 120, 300], bypassDnd: false, lockscreenVisibility: PRIVATE, showBadge: true },
  quiet: { enableVibrate: false, bypassDnd: false, lockscreenVisibility: PRIVATE, showBadge: false },
};

const IMPORTANCE: Record<ChannelImportance, Notifications.AndroidImportance> = {
  high: Notifications.AndroidImportance.HIGH,
  default: Notifications.AndroidImportance.DEFAULT,
  low: Notifications.AndroidImportance.LOW,
};

/** Prepoznaje NAŠ verzionisani kanal bilo koje generacije, npr. `dm_v1`, `vote_v2`. */
const OUR_CHANNEL_ID = new RegExp(
  `^(${Object.keys(NOTIFICATION_CHANNELS).join("|")})_v\\d+$`,
);

/**
 * Idempotentno: pri svakom pokretanju napravi/ažuriraj tekuće kanale i obriši
 * naše kanale starijih generacija (npr. `*_v1` kad `CHANNEL_VERSION` postane 2).
 * Tuđe i sistemske kanale ne dira.
 */
export async function registerNotificationChannels(): Promise<void> {
  if (Platform.OS !== "android") return;

  const bases = Object.keys(NOTIFICATION_CHANNELS) as ChannelBase[];
  const currentIds = new Set(
    bases.map((base) => channelIdFor(base, CHANNEL_VERSION)),
  );

  // 1. Obriši naše kanale koji nisu tekuća verzija (samočišćenje pri bump-u).
  const existing = (await Notifications.getNotificationChannelsAsync()) ?? [];
  for (const channel of existing) {
    if (OUR_CHANNEL_ID.test(channel.id) && !currentIds.has(channel.id)) {
      await Notifications.deleteNotificationChannelAsync(channel.id);
    }
  }

  // 2. Kreiraj/ažuriraj tekuće kanale.
  for (const base of bases) {
    const def = NOTIFICATION_CHANNELS[base];
    const props = ANDROID_PROPS[base];
    await Notifications.setNotificationChannelAsync(
      channelIdFor(base, CHANNEL_VERSION),
      {
        name: def.name,
        importance: IMPORTANCE[def.importance],
        // Ime fajla iz `res/raw` (config plugin `sounds`); `undefined` = bez zvuka.
        // Zvuk je zaključan za kanal od ovog trenutka — menja se samo novom verzijom.
        sound: def.soundBase ? `${def.soundBase}.wav` : undefined,
        enableVibrate: props.enableVibrate,
        vibrationPattern: props.vibrationPattern,
        bypassDnd: props.bypassDnd,
        lockscreenVisibility: props.lockscreenVisibility,
        showBadge: props.showBadge,
      },
    );
  }
}
