// Apple App Site Association — omogućava da `https://<DOMEN>/invite?...` linkovi
// (npr. iz email pozivnice) otvore iOS aplikaciju umesto Safarija.
//
// MORA se servirati kao application/json, bez ekstenzije, na
// `/.well-known/apple-app-site-association` — zato route handler, ne statički fajl.
//
// PLACEHOLDER: zameni `TEAMID` Apple Team ID-jem (Membership → Team ID). AppID je
// `<TeamID>.<bundleIdentifier>`; bundleIdentifier je u apps/mobile/app.json.
export const dynamic = "force-static";

export function GET() {
  const body = {
    applinks: {
      apps: [],
      details: [
        {
          appID: "TEAMID.com.PROMENI.notionclone",
          paths: ["/invite", "/invite/*"],
        },
      ],
    },
  };

  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}
