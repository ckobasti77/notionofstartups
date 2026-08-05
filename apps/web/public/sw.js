/*
 * Service worker za web push obaveštenja.
 *
 * Postoji samo zbog obaveštenja: ne kešira ništa i ne presreće mrežu, pa ne može
 * da poremeti učitavanje aplikacije. Push radi i kad je aplikacija zatvorena —
 * browser drži ovaj worker, a ne stranicu.
 */

self.addEventListener("install", () => {
  // Nova verzija preuzima kontrolu odmah, bez čekanja na zatvaranje tabova.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "Novo obaveštenje";
  const options = {
    body: payload.body || undefined,
    icon: "/icon.svg",
    badge: "/icon.svg",
    lang: "sr-Latn-RS",
    // Grupisanje po zadatku/cilju: novo obaveštenje o istoj stvari zamenjuje
    // staro umesto da se gomila na ekranu.
    tag: payload.targetId ? `target:${payload.targetId}` : undefined,
    renotify: Boolean(payload.targetId),
    timestamp: Date.now(),
    data: {
      startupId: payload.startupId || null,
      targetType: payload.targetType || null,
      targetId: payload.targetId || null,
      notificationId: payload.notificationId || null,
    },
    actions: [{ action: "open", title: "Otvori" }],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/**
 * Pravi URL aplikacije koji vodi tačno na povod obaveštenja. Mora da se poklapa
 * sa `packages/backend/convex/lib/notificationTarget.ts` (SW je statički fajl i
 * ne može da uveze taj modul, pa ga preslikava) i sa `readWorkspaceRouteCandidate`
 * u `components/workspace/workspace-route.ts` koji ovaj URL čita pri učitavanju.
 */
function targetUrl(data) {
  const params = new URLSearchParams();
  if (data.startupId) params.set("startupId", data.startupId);

  if (data.targetType === "page" && data.targetId) {
    params.set("view", "page");
    params.set("pageId", data.targetId);
  } else if (data.targetType === "chat") {
    params.set("view", "chat");
    // channelId je opcion — bez njega chat se otvara na listi razgovora.
    if (data.targetId) params.set("channelId", data.targetId);
  } else if (data.targetType === "ideas") {
    params.set("view", "ideas");
  } else if (data.targetType === "approvals") {
    params.set("view", "approvals");
  } else if (data.targetType === "puls") {
    params.set("view", "puls");
  } else {
    params.set("view", "today");
  }

  const query = params.toString();
  return `/${query ? `?${query}` : ""}`;
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = targetUrl(event.notification.data || {});

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Ako je aplikacija već otvorena, fokusiramo taj tab i navodimo ga na
      // pravo mesto — ne otvaramo novi prozor svaki put.
      for (const client of clientList) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(url);
            } catch {
              // Neki browseri odbiju navigate na fokusiranom tabu; fokus je dovoljan.
            }
          }
          return;
        }
      }

      await self.clients.openWindow(url);
    })(),
  );
});
