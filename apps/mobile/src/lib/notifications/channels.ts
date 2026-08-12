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
/**
 * Sadržaj se vidi i na zaključanom ekranu — kao kod WhatsApp-a. Bez ovoga na
 * zaključanom ekranu piše samo „Devotion", pa se ne vidi ni ko piše ni šta.
 * `quiet` ostaje PRIVATE: ideje i puls ne moraju da stoje otvoreni na ekranu.
 */
const PUBLIC = Notifications.AndroidNotificationVisibility.PUBLIC;

const ANDROID_PROPS: Record<ChannelBase, AndroidChannelProps> = {
  // Vibracija je prepoznatljiva kao i zvuk: „traže te" i „odluka" imaju jači,
  // dvostruki puls; kanalska priča i tiho — bez vibracije.
  dm: { enableVibrate: true, vibrationPattern: [0, 200], bypassDnd: false, lockscreenVisibility: PUBLIC, showBadge: true },
  mention: { enableVibrate: true, vibrationPattern: [0, 120, 60, 120], bypassDnd: false, lockscreenVisibility: PUBLIC, showBadge: true },
  channel: { enableVibrate: false, bypassDnd: false, lockscreenVisibility: PUBLIC, showBadge: true },
  task: { enableVibrate: true, vibrationPattern: [0, 200], bypassDnd: false, lockscreenVisibility: PUBLIC, showBadge: true },
  deadline: { enableVibrate: true, vibrationPattern: [0, 250, 100, 250], bypassDnd: false, lockscreenVisibility: PUBLIC, showBadge: true },
  vote: { enableVibrate: true, vibrationPattern: [0, 300, 120, 300], bypassDnd: false, lockscreenVisibility: PUBLIC, showBadge: true },
  quiet: { enableVibrate: false, bypassDnd: false, lockscreenVisibility: PRIVATE, showBadge: false },
};

/**
 * `high` se mapira na Androidov MAX, ne na HIGH. Oba u teoriji daju heads-up
 * baner, ali proizvođačke nadgradnje (Samsung One UI, MIUI) i Androidov
 * „notification cooldown" prvo prigušuju HIGH — a upravo to je bio simptom:
 * zvuk se čuje, obaveštenje uđe u listu, ali ne iskoči preko vrha ekrana.
 */
const IMPORTANCE: Record<ChannelImportance, Notifications.AndroidImportance> = {
  high: Notifications.AndroidImportance.MAX,
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

/** Ljudski naziv Androidove važnosti — broj sam po sebi nikome ništa ne znači. */
const IMPORTANCE_LABEL: Record<number, string> = {
  [Notifications.AndroidImportance.MAX]: 'najviša — iskače preko ekrana',
  [Notifications.AndroidImportance.HIGH]: 'visoka — iskače preko ekrana',
  [Notifications.AndroidImportance.DEFAULT]: 'podrazumevana — NE iskače, samo zvoni',
  [Notifications.AndroidImportance.LOW]: 'niska — bez zvuka',
  [Notifications.AndroidImportance.MIN]: 'najniža',
  [Notifications.AndroidImportance.NONE]: 'isključena',
  [Notifications.AndroidImportance.UNKNOWN]: 'nepoznata',
  [Notifications.AndroidImportance.UNSPECIFIED]: 'neodređena',
};

/**
 * Čita kanale koji STVARNO postoje na uređaju i opisuje ih rečima.
 *
 * Postoji zato što se „meni je sve štiklirano, a ne iskače" ne može proveriti
 * kroz tuđi ekran. Ako naši kanali ne postoje, obaveštenje pada na Androidov
 * podrazumevani kanal — koji pušta zvuk ali NE iskače, što je tačno taj simptom.
 * Ovo tu razliku pretvara u rečenicu koju čovek može da pročita i pošalje dalje.
 */
export async function describeNotificationChannels(): Promise<string> {
  if (Platform.OS !== 'android') return 'Kanali postoje samo na Androidu.';

  const existing = (await Notifications.getNotificationChannelsAsync()) ?? [];
  if (existing.length === 0) {
    return 'Uređaj nema nijedan kanal. Obaveštenja zato idu na podrazumevani kanal i ne iskaču. Pritisni „Registruj ponovo".';
  }

  const ours = existing.filter((channel) => OUR_CHANNEL_ID.test(channel.id));
  const current = ours.filter((channel) => channel.id.endsWith(`_v${CHANNEL_VERSION}`));

  if (current.length === 0) {
    return [
      `Očekivana generacija kanala: v${CHANNEL_VERSION}, ali je nema na uređaju.`,
      ours.length > 0
        ? `Postoje samo starije: ${ours.map((channel) => channel.id).join(', ')}.`
        : 'Nijedan naš kanal ne postoji — obaveštenja padaju na podrazumevani kanal.',
      'Pritisni „Registruj ponovo" pa probaj opet.',
    ].join('\n\n');
  }

  const lines = current.map((channel) => {
    const importance = IMPORTANCE_LABEL[channel.importance] ?? String(channel.importance);
    const sound = channel.sound ? '' : ' · BEZ ZVUKA';
    return `• ${channel.name}: ${importance}${sound}`;
  });

  return [`Generacija v${CHANNEL_VERSION}, kanala: ${current.length}`, ...lines].join('\n');
}
