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

/**
 * Ponedeljak, 05:00 UTC = 06/07h po Beogradu zavisno od letnjeg vremena. Za
 * „ponedeljak ujutru” je oba tačno, pa DST ne traži posebnu obradu.
 */
crons.cron(
  "nedeljni puls",
  "0 5 * * 1",
  internal.puls.sendWeeklyPulsNotifications,
  {},
);

export default crons;
