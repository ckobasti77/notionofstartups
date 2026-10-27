import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Embed protokol telefon ↔ WebView (`docs/mobile/00-PLAN.md` §5.2) je van
 * obima PROSTOR runa (K07 E5): redizajn Mape (K15) menja samo izgled čvora u
 * `embed-node.tsx`. Ovaj test čita IZVOR obe strane i dokazuje da je skup
 * poruka isti kao u §5.2 i da telefon ne šalje ni ne čeka ništa izvan njega.
 */
const ROOT = resolve(__dirname, "../../../../../../..");
const EMBED = readFileSync(resolve(__dirname, "canvas-embed.tsx"), "utf8");
const EMBED_NODE = readFileSync(resolve(__dirname, "embed-node.tsx"), "utf8");
const MOBILE = readFileSync(
  resolve(ROOT, "apps/mobile/src/app/(app)/canvas/[kind]/[id].tsx"),
  "utf8",
);

/** WebView → native (§5.2). */
const OUTGOING = [
  "connected",
  "moved",
  "node:actions",
  "node:open",
  "resized",
  "selection",
  "toast",
  "viewport",
];

/** native → WebView (§5.2; `auth` je osvežavanje tokena). */
const INCOMING = ["auth", "checkpoints", "connect", "fit", "focus", "mode", "theme", "zoom"];

function collect(source: string, pattern: RegExp): string[] {
  return [...new Set([...source.matchAll(pattern)].map((match) => match[1]))].sort();
}

describe("embed protokol kanvasa je nepromenjen (PROSTOR K15, E5)", () => {
  it("embed šalje tačno poruke iz §5.2", () => {
    expect(collect(EMBED, /postNative\(\{\s*type:\s*"([^"]+)"/g)).toEqual(OUTGOING);
  });

  it("embed prima tačno poruke iz §5.2", () => {
    expect(collect(EMBED, /msg\.type\s*[!=]==\s*"([^"]+)"/g)).toEqual(INCOMING);
  });

  it("telefon šalje samo poruke koje embed prima", () => {
    const sent = collect(MOBILE, /postToWeb\(\{\s*type:\s*'([^']+)'/g);
    expect(sent.length).toBeGreaterThan(0);
    for (const type of sent) expect(INCOMING).toContain(type);
  });

  it("telefon čeka samo poruke koje embed šalje", () => {
    const handled = collect(MOBILE, /msg\.type\s*===\s*'([^']+)'/g);
    expect(handled.length).toBeGreaterThan(0);
    for (const type of handled) expect(OUTGOING).toContain(type);
  });

  it("oblik čvora za telefon ostaje: prefiks koraka, nodeKind, veze se ne vuku sa tačke", () => {
    expect(EMBED).toContain("checkpoint:");
    expect(EMBED).toContain("nodeKind");
    expect(EMBED).toMatch(/nodesConnectable=\{false\}/);
    expect(EMBED).toContain('from "@/components/workspace/canvases/task-checkpoint-layout"');
  });

  it("embed-node i dalje izvozi isto što canvas-embed uvozi", () => {
    const imported = EMBED.match(/import \{([^}]+)\} from "\.\/embed-node"/)?.[1] ?? "";
    const names = imported
      .split(",")
      .map((name) => name.replace(/^\s*type\s+/, "").trim())
      .filter(Boolean);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(EMBED_NODE).toMatch(new RegExp(`export (const|type|function) ${name}\\b`));
    }
    expect(EMBED_NODE).toContain('export const EMBED_NODE_TYPE = "embed"');
    // Polja `data` koja puni `canvas-embed.tsx` (oblik se ne menja).
    for (const field of ["label", "meta", "color", "accent", "ghost", "canResize", "variant"]) {
      expect(EMBED_NODE).toMatch(new RegExp(`\\n  ${field}\\??: `));
    }
  });
});
