import { describe, expect, test } from "vitest";

import crons from "./crons";
import { typeBreaksQuietHours } from "./lib/notificationChannels";
import { notificationTypeValidator } from "./lib/validators";

/**
 * PROSTOR P9: Puls je kartica, ne obaveštenje. Cron „nedeljni puls” je uklonjen;
 * tip `puls_ready` ostaje (postojeća obaveštenja se i dalje prikazuju i utišavaju).
 */
describe("crons", () => {
  test("registrovan je samo „podsetnici za rokove”", () => {
    expect(Object.keys(crons.crons)).toEqual(["podsetnici za rokove"]);
    expect(crons.crons["podsetnici za rokove"].name).toBe(
      "notifications:remindDueTasks",
    );
  });

  test("nijedan cron ne poziva puls", () => {
    const targets = Object.values(crons.crons).map((job) => job.name);
    expect(targets.some((name) => name.startsWith("puls:"))).toBe(false);
  });

  test("tip puls_ready ostaje u validatoru i katalogu podešavanja", () => {
    const types = notificationTypeValidator.members.map((member) => member.value);
    expect(types).toContain("puls_ready");
    expect(typeBreaksQuietHours("puls_ready")).toBe(false);
  });
});
