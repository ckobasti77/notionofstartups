// Osvezava tipove ruta za expo-router (apps/mobile/.expo/types/router.d.ts) bez
// pokretanja Expo/Metro servera — isto kao sto ih pravi `expo start`.
//
// Zasto: apps/mobile/app.json ima `typedRoutes: true`, a tsconfig ukljucuje
// `.expo/types/**/*.ts`. Fajl pravi samo dev server, a run ga ne pokrece; bez
// osvezavanja nova ruta (npr. `router.push('/moji-zadaci')`) pada na tsc-u.
//
// Pokretanje (iz korena repoa):  node .nocni-run/licno/alati/expo-rute.cjs
// Ne obara proveru: ako generator ne moze da se nadje, ispise upozorenje i izadje sa 0.
"use strict";
const path = require("node:path");
const fs = require("node:fs");

const repo = path.resolve(__dirname, "..", "..", "..");
const appRoot = path.join(repo, "apps", "mobile", "src", "app");
const outDir = path.join(repo, "apps", "mobile", ".expo", "types");
const nm = path.join(repo, "node_modules");

function warn(msg) {
  process.stderr.write("UPOZORENJE (expo-rute): tipovi ruta NISU osvezeni - " + msg + "\n");
}

try {
  const candidates = [
    path.join(nm, "expo", "node_modules", "@expo", "cli", "node_modules", "@expo", "router-server"),
    path.join(nm, "@expo", "cli", "node_modules", "@expo", "router-server"),
    path.join(nm, "@expo", "router-server"),
  ];
  const serverDir = candidates.find((d) => fs.existsSync(path.join(d, "build", "typed-routes", "generate.js")));
  if (!serverDir) {
    warn("ne nalazim @expo/router-server/build/typed-routes/generate.js");
    process.exit(0);
  }
  process.env.EXPO_ROUTER_APP_ROOT = appRoot;
  const req = (m) => require(require.resolve(m, { paths: [serverDir, path.join(repo, "apps", "mobile"), repo] }));
  const { requireContext } = req("expo-router/internal/testing");
  const { EXPO_ROUTER_CTX_IGNORE } = req("expo-router/_ctx-shared");
  const { getTypedRoutesDeclarationFile } = require(path.join(serverDir, "build", "typed-routes", "generate.js"));
  const ctx = requireContext(appRoot, true, EXPO_ROUTER_CTX_IGNORE);
  const file = getTypedRoutesDeclarationFile(ctx, {});
  if (typeof file !== "string" || file.length < 200) {
    warn("generator je vratio prazan rezultat");
    process.exit(0);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const target = path.join(outDir, "router.d.ts");
  const prev = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;
  if (prev !== file) {
    fs.writeFileSync(target, file);
    console.log("expo-rute: router.d.ts osvezen (" + file.length + " B)");
  } else {
    console.log("expo-rute: router.d.ts je vec azuran");
  }
} catch (e) {
  warn(e && e.message ? e.message : String(e));
  process.exit(0);
}
