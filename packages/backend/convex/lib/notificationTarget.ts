import type { NotificationTargetType } from "./notifications";

/**
 * JEDAN izvor istine za „kuda vodi klik na obaveštenje". Isti `targetType` MORA
 * da vodi na isto mesto na oba klijenta (docs/mobile/00-PLAN.md, „backend je
 * deljen"). Zato mapiranje živi u deljenom `convex/lib/` modulu — isti obrazac
 * kao `notificationChannels.ts`, koji već koriste i server i mobilni.
 *
 * - Web: mapira `NotificationDestination` na `WorkspaceRoute`
 *   (`components/workspace/workspace-route.ts`), a `sw.js` gradi isti URL
 *   (`view=chat&channelId=…` itd.). SW je statički fajl i ne može da uveze ovaj
 *   modul, pa ga preslikava — svaka izmena ovde ide i tamo.
 * - Mobilni: mapira `NotificationDestination` na expo-router put
 *   (`lib/notifications/deep-link.ts`).
 *
 * `targetId` semantika po tipu (postavlja se u `lib/notifications.ts` na mestu
 * događaja): `page` → pageId, `chat` → channelId, `puls` → početak nedelje (ms),
 * `ideas`/`approvals` → null.
 */

export type NotificationScreen =
  | "chat"
  | "page"
  | "ideas"
  | "approvals"
  | "puls"
  | "today";

export type NotificationDestination = {
  screen: NotificationScreen;
  /** channelId za `chat`, pageId za `page` — inače null. */
  entityId: string | null;
  /** `puls`: početak tražene nedelje (ms) ako je poznat, inače null. */
  weekStart: number | null;
};

/**
 * Klijent-neutralna destinacija za dati cilj obaveštenja. Nepoznat ili
 * nedosledan cilj (npr. `page` bez id-ja) pada na komandni centar (`today`)
 * umesto na prazan ekran.
 */
export function notificationDestination(
  targetType: NotificationTargetType | string,
  targetId: string | null,
): NotificationDestination {
  switch (targetType) {
    case "chat":
      // Bez channelId chat se otvara na listi razgovora (nije greška).
      return { screen: "chat", entityId: targetId, weekStart: null };
    case "page":
      return targetId
        ? { screen: "page", entityId: targetId, weekStart: null }
        : { screen: "today", entityId: null, weekStart: null };
    case "ideas":
      return { screen: "ideas", entityId: null, weekStart: null };
    case "approvals":
      return { screen: "approvals", entityId: null, weekStart: null };
    case "puls": {
      const week = Number(targetId);
      return {
        screen: "puls",
        entityId: null,
        weekStart: Number.isFinite(week) && week > 0 ? week : null,
      };
    }
    default:
      return { screen: "today", entityId: null, weekStart: null };
  }
}
