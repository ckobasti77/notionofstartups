import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useMutation } from "convex/react";

import { api } from "@/convex/_generated/api";
import { CHANNEL_VERSION } from "@/convex/lib/notificationChannels";

import { registerNotificationChannels } from "./channels";

/**
 * Ponašanje kad je aplikacija u PRVOM planu (OS tad ne prikazuje obaveštenje sam).
 * Postavlja se jednom, van React-a, da važi pre nego što bilo koji push stigne.
 * Zvuk u prvom planu (OS ga ne pušta) ide kasnije preko `expo-audio` — van opsega.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

/**
 * Registruje uređaj za push: dozvola → Android kanali → Expo token → upis u
 * `expoPushTokens` sa tekućim `channelVersion` (da server zna koje kanale uređaj
 * poznaje, sekcija 4.1). Zove se iz zaštićenog lejauta, dakle tek po prijavi
 * (`save` traži profil). Radi samo na fizičkom uređaju; u Expo Go / simulatoru
 * ili bez EAS `projectId`-a tiho odustane i pokuša ponovo pri sledećem pokretanju.
 */
export function usePushRegistration(): void {
  const save = useMutation(api.expoPushTokens.save);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    void (async () => {
      try {
        if (Platform.OS !== "ios" && Platform.OS !== "android") return;
        if (!Device.isDevice) return;

        const existing = await Notifications.getPermissionsAsync();
        const status =
          existing.status === "granted"
            ? existing.status
            : (await Notifications.requestPermissionsAsync()).status;
        if (status !== "granted") return;

        // Kanali PRE tokena: kad prvi push stigne, kanali već postoje (Android).
        await registerNotificationChannels();

        const projectId = (
          Constants.expoConfig?.extra as
            | { eas?: { projectId?: string } }
            | undefined
        )?.eas?.projectId;

        const token = (
          await Notifications.getExpoPushTokenAsync(
            projectId ? { projectId } : undefined,
          )
        ).data;

        await save({
          token,
          platform: Platform.OS === "ios" ? "ios" : "android",
          deviceName: Device.deviceName ?? null,
          appVersion: Constants.expoConfig?.version ?? "0.0.0",
          channelVersion: CHANNEL_VERSION,
        });
      } catch (error) {
        // Registracija ne sme da sruši app (odbijena dozvola, Expo Go, bez
        // EAS projectId-a…). Sledeće pokretanje pokušava ponovo.
        console.warn("Push registracija preskočena:", error);
      }
    })();
  }, [save]);
}
