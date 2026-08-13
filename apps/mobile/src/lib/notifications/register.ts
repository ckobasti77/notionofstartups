import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { useMutation } from "convex/react";

import { api } from "@/convex/_generated/api";
import { CHANNEL_VERSION } from "@/convex/lib/notificationChannels";
import { readPushOptOut, writePushOptOut } from "@/lib/device-prefs";

import { registerNotificationChannels } from "./channels";

/**
 * Ponasanje kad je aplikacija u PRVOM planu (OS tad ne prikazuje obavestenje sam).
 * Postavlja se jednom, van React-a, da vazi pre nego sto bilo koji push stigne.
 *
 * `shouldPlaySound: true` je namerno: zahtev je da obavestenje UVEK zvoni, i kad
 * korisnik gleda aplikaciju. Bez ovoga poruka stigne nema, pa deluje kao da push
 * ne radi.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Stanje registracije ovog uredjaja. Ranije je greska isla u `console.warn` i
 * nestajala — na tudjem telefonu se to nikad ne vidi, pa je "ne zvoni" bilo
 * nemoguce dijagnostikovati. Sad stanje ima vlasnika i prikazuje se na ekranu
 * "Obavestenja i zvuci".
 */
export type PushRegistrationStatus =
  | { state: "idle" }
  | { state: "running" }
  | { state: "ok"; token: string }
  | { state: "error"; reason: string; detail: string | null }
  /** Korisnik je svesno isključio push NA OVOM UREĐAJU (PARITET-REVIZIJA C15). */
  | { state: "off" };

let currentStatus: PushRegistrationStatus = { state: "idle" };
const listeners = new Set<() => void>();

function setStatus(next: PushRegistrationStatus): void {
  currentStatus = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): PushRegistrationStatus {
  return currentStatus;
}

/** Trenutno stanje registracije, za prikaz u podesavanjima. */
export function usePushStatus(): PushRegistrationStatus {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
}

/**
 * Prevodi tehnicku gresku u recenicu koja kaze STA da se uradi. Poruke koje
 * Expo/FCM vracaju su na engleskom i bez konteksta.
 */
function explain(raw: string): string {
  const text = raw.toLowerCase();
  if (text.includes("firebaseapp is not initialized") || text.includes("default firebaseapp")) {
    return "Build nema Firebase podatke (google-services.json). Instaliraj noviji APK, napravljen posle podešavanja FCM-a.";
  }
  if (text.includes("expo go")) {
    return "Push ne radi u Expo Go aplikaciji — potreban je pravi build (APK).";
  }
  if (text.includes("projectid") || text.includes("project id")) {
    return "Buildu nedostaje EAS projectId. Aplikacija mora biti napravljena kroz `eas build`.";
  }
  if (text.includes("google play") || text.includes("play services")) {
    return "Uređaj nema Google Play usluge, a Android push ide isključivo kroz njih.";
  }
  return raw;
}

/**
 * Uradi registraciju i vrati ishod. Izdvojeno iz hook-a da bi ekran podesavanja
 * mogao da je pokrene rucno ("Registruj uredjaj ponovo") — na tudjem telefonu je
 * to jedini nacin da se vidi zasto push ne stize.
 */
export function useRegisterPushDevice(): () => Promise<PushRegistrationStatus> {
  const save = useMutation(api.expoPushTokens.save);

  return useCallback(async (): Promise<PushRegistrationStatus> => {
    // Ručno "Registruj (ponovo)" je EKSPLICITAN pristanak — briše zastavicu
    // isključivanja pre nego što uopšte pokuša (PARITET-REVIZIJA C15).
    writePushOptOut(false);
    setStatus({ state: "running" });

    if (Platform.OS !== "ios" && Platform.OS !== "android") {
      const result: PushRegistrationStatus = {
        state: "error",
        reason: "Native push radi samo na telefonu (Android/iOS).",
        detail: null,
      };
      setStatus(result);
      return result;
    }

    // Dozvola
    let granted = false;
    try {
      const existing = await Notifications.getPermissionsAsync();
      granted =
        existing.status === "granted" ||
        (await Notifications.requestPermissionsAsync()).status === "granted";
    } catch (error) {
      const result: PushRegistrationStatus = {
        state: "error",
        reason: "Provera dozvole za obaveštenja nije uspela.",
        detail: errorText(error),
      };
      setStatus(result);
      return result;
    }
    if (!granted) {
      const result: PushRegistrationStatus = {
        state: "error",
        reason:
          "Obaveštenja su zabranjena na nivou telefona. Otvori sistemska podešavanja ispod i dozvoli ih.",
        detail: null,
      };
      setStatus(result);
      return result;
    }

    // Kanali PRE tokena: kad prvi push stigne, kanali vec postoje (Android).
    try {
      await registerNotificationChannels();
    } catch (error) {
      const result: PushRegistrationStatus = {
        state: "error",
        reason: "Pravljenje Android kanala nije uspelo.",
        detail: errorText(error),
      };
      setStatus(result);
      return result;
    }

    // Token. NAMERNO se ne odustaje na `!Device.isDevice`: emulator sa Google
    // Play uslugama uredno dobija FCM token, a raniji preskok je onemogucavao
    // svako testiranje push-a pre nego sto se APK posalje ljudima.
    let token: string;
    try {
      const projectId = (
        Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined
      )?.eas?.projectId;
      token = (
        await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)
      ).data;
    } catch (error) {
      const raw = errorText(error);
      const result: PushRegistrationStatus = {
        state: "error",
        reason: explain(raw),
        detail: Device.isDevice ? raw : `${raw} (emulator)`,
      };
      setStatus(result);
      return result;
    }

    // Upis u bazu
    try {
      await save({
        token,
        platform: Platform.OS === "ios" ? "ios" : "android",
        deviceName: Device.deviceName ?? null,
        appVersion: Constants.expoConfig?.version ?? "0.0.0",
        channelVersion: CHANNEL_VERSION,
      });
    } catch (error) {
      const result: PushRegistrationStatus = {
        state: "error",
        reason: "Token je dobijen, ali upis u bazu nije uspeo. Proveri prijavu i internet.",
        detail: errorText(error),
      };
      setStatus(result);
      return result;
    }

    const result: PushRegistrationStatus = { state: "ok", token };
    setStatus(result);
    return result;
  }, [save]);
}

/**
 * Registruje uredjaj za push pri ulasku u zasticeni deo aplikacije: dozvola →
 * Android kanali → Expo token → upis u `expoPushTokens` sa tekucim
 * `channelVersion`. Neuspeh vise ne nestaje u konzoli — vidi se u
 * "Obavestenja i zvuci".
 */
export function usePushRegistration(): void {
  const register = useRegisterPushDevice();
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    // Korisnik je ranije isključio push NA OVOM UREĐAJU (PARITET-REVIZIJA C15) —
    // taj izbor mora da preživi restart, inače „Isključi" važi samo do sledećeg
    // hladnog starta i dugme laže.
    if (readPushOptOut()) {
      setStatus({ state: "off" });
      return;
    }
    void register();
  }, [register]);
}

/**
 * Isključuje push NA OVOM UREĐAJU (PARITET-REVIZIJA C15; web pandan:
 * `notifications-panel.tsx`, dugme "Isključi na ovom uređaju"). Radi samo dok
 * je stanje `ok` — tek tada znamo token koji treba obrisati sa servera.
 *
 * Redosled je bitan: PRVO server (`expoPushTokens.remove`), PA lokalna
 * zastavica. Obrnuto bi ostavilo uređaj koji misli da je isključen dok
 * serverski red i dalje šalje na njega.
 */
export function useDisablePushDevice(): () => Promise<{ ok: boolean; message: string }> {
  const remove = useMutation(api.expoPushTokens.remove);

  return useCallback(async (): Promise<{ ok: boolean; message: string }> => {
    const status = getSnapshot();
    if (status.state !== "ok") {
      return { ok: false, message: "Uređaj trenutno nije registrovan za obaveštenja." };
    }
    try {
      await remove({ token: status.token });
    } catch (error) {
      return {
        ok: false,
        message: `Isključivanje nije uspelo: ${errorText(error)}`,
      };
    }
    writePushOptOut(true);
    setStatus({ state: "off" });
    return { ok: true, message: "Obaveštenja su isključena na ovom uređaju." };
  }, [remove]);
}
