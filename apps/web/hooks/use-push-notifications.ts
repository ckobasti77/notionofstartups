"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";

import { api } from "@/convex/_generated/api";

export type PushState =
  /** Browser ne podržava push (npr. iOS Safari bez instalirane aplikacije). */
  | "unsupported"
  /** Nedostaje javni VAPID ključ — pogrešna konfiguracija okruženja. */
  | "unconfigured"
  | "checking"
  /** Dozvola nije ni tražena. */
  | "idle"
  /** Dozvola data, ali ovaj uređaj nije pretplaćen. */
  | "permitted"
  | "enabled"
  /** Korisnik je blokirao obaveštenja — ponovno traženje nije moguće iz koda. */
  | "blocked";

const SERVICE_WORKER_PATH = "/sw.js";

/** VAPID ključ dolazi kao base64url tekst, a PushManager traži bajtove. */
function base64UrlToUint8Array(base64Url: string) {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }
  return output;
}

function readKeys(subscription: PushSubscription) {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!p256dh || !auth) {
    throw new Error("Pretplata nije vratila ključeve za šifrovanje.");
  }
  return { p256dh, auth };
}

/**
 * Vodi web push na ovom uređaju: dozvolu, service worker, pretplatu i njen upis
 * na server. Dozvola se traži isključivo iz korisničkog klika — browser tiho
 * odbija zahteve bez neposredne interakcije.
 */
export function usePushNotifications() {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const savePushSubscription = useMutation(api.pushSubscriptions.save);
  const removePushSubscription = useMutation(api.pushSubscriptions.remove);

  const [state, setState] = useState<PushState>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supported = useMemo(
    () =>
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window,
    [],
  );

  const readCurrentState = useCallback(async (): Promise<PushState> => {
    if (!supported) return "unsupported";
    if (vapidPublicKey.length === 0) return "unconfigured";
    if (Notification.permission === "denied") return "blocked";
    if (Notification.permission === "default") return "idle";

    const registration = await navigator.serviceWorker.getRegistration(
      SERVICE_WORKER_PATH,
    );
    const subscription = await registration?.pushManager.getSubscription();
    return subscription ? "enabled" : "permitted";
  }, [supported, vapidPublicKey]);

  useEffect(() => {
    let active = true;
    readCurrentState()
      .then((next) => {
        if (active) setState(next);
      })
      .catch(() => {
        if (active) setState("idle");
      });
    return () => {
      active = false;
    };
  }, [readCurrentState]);

  const enable = useCallback(async () => {
    if (!supported) {
      setError("Ovaj browser ne podržava obaveštenja na zaključanom ekranu.");
      return false;
    }
    if (vapidPublicKey.length === 0) {
      setError("Nedostaje javni VAPID ključ u okruženju.");
      return false;
    }

    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission === "denied") {
        setState("blocked");
        setError(
          "Obaveštenja su blokirana u browseru. Odblokiraj ih u podešavanjima sajta pa probaj ponovo.",
        );
        return false;
      }
      if (permission !== "granted") {
        setState("idle");
        return false;
      }

      const registration = await navigator.serviceWorker.register(
        SERVICE_WORKER_PATH,
      );
      await navigator.serviceWorker.ready;

      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          // Bez ovoga Chrome odbija pretplatu: svako obaveštenje mora da bude vidljivo.
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(vapidPublicKey),
        }));

      const keys = readKeys(subscription);
      await savePushSubscription({
        endpoint: subscription.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: navigator.userAgent,
      });

      setState("enabled");
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Uključivanje obaveštenja nije uspelo.",
      );
      setState(await readCurrentState());
      return false;
    } finally {
      setBusy(false);
    }
  }, [readCurrentState, savePushSubscription, supported, vapidPublicKey]);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration(
        SERVICE_WORKER_PATH,
      );
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscription({ endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      setState("permitted");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Isključivanje obaveštenja nije uspelo.",
      );
    } finally {
      setBusy(false);
    }
  }, [removePushSubscription]);

  return { state, busy, error, enable, disable };
}
