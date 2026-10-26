import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * Četiri puta dnevno umesto jednom: UTC cron izraz ne prati prelaz na letnje
 * računanje vremena, a dedupe ključevi čine ponovljena pokretanja bezopasnim.
 * Uz to, zadatak kome je rok postavljen u toku dana dobije podsetnik istog dana.
 */
crons.interval(
  "podsetnici za rokove",
  { hours: 6 },
  internal.notifications.remindDueTasks,
  {},
);

// PROSTOR P9: nema cron-a za nedeljni Puls. Puls je kartica u Komandnom centru,
// a obaveštenje koje niko ne otvara je buka. `puls.sendWeeklyPulsNotifications`
// ostaje u kodu, ali ga niko ne poziva.

export default crons;
