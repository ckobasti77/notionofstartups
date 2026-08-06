import type { AudioSource } from 'expo-audio';

import type { ChannelBase } from '@/convex/lib/notificationChannels';

/**
 * Izvori za probu zvuka na ekranu „Obaveštenja i zvuci" (dugme [▶]). To su ISTI
 * `.wav` fajlovi koje `app.json` (expo-notifications → `sounds`) vezuje za
 * kanale, pa korisnik čuje tačno ono što će stići kao obaveštenje
 * (docs/mobile/03-NOTIFIKACIJE.md sekcija 7).
 *
 * IZUZETAK (svesno zabeležen, po pravilu iz CLAUDE.md): proba zvuka postoji
 * samo na mobilnom — web nema način da pusti sistemski zvuk obaveštenja.
 *
 * Fajlovi se prave ručno i JOŠ NISU u repou (assets/sounds/README.md), pa je
 * mapa namerno prazna: `require(...)` fajla koji ne postoji obara Metro bundler.
 * Čim šest `.wav`-ova legne u `assets/sounds/`, otkomentariši linije — dugme za
 * probu se pali samo od sebe (`hasSoundPreview`), bez ijedne druge izmene.
 */
export const SOUND_PREVIEWS: Partial<Record<ChannelBase, AudioSource>> = {
  // dm: require('../../../assets/sounds/dm.wav'),
  // mention: require('../../../assets/sounds/mention.wav'),
  // channel: require('../../../assets/sounds/channel.wav'),
  // task: require('../../../assets/sounds/task.wav'),
  // deadline: require('../../../assets/sounds/deadline.wav'),
  // vote: require('../../../assets/sounds/vote.wav'),
};

/** Da li za dati kanal postoji izvor za probu (dugme [▶] se prikazuje/aktivira). */
export function hasSoundPreview(base: ChannelBase | null): base is ChannelBase {
  return base !== null && base in SOUND_PREVIEWS;
}
