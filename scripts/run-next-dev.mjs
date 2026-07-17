import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { freemem, tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { spawn, spawnSync } from "node:child_process";

const projectRoot = process.cwd();
const projectKey = createHash("sha256").update(projectRoot).digest("hex").slice(0, 12);
const lockPath = join(tmpdir(), `notion-clone-next-${projectKey}.lock`);
const port = Number.parseInt(process.env.NOTION_CLONE_PORT ?? "3100", 10);
const useWebpack = process.argv.includes("--webpack");
const oneGigabyte = 1024 ** 3;
const minimumStartMemory = 2 * oneGigabyte;
const emergencyFreeMemory = 1.25 * oneGigabyte;

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function cleanupLock() {
  try {
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    if (lock.pid === process.pid) rmSync(lockPath, { force: true });
  } catch {
    // Lock je već uklonjen ili nije pripadao ovom procesu.
  }
}

function terminateProcessTree(pid) {
  if (!isProcessAlive(pid)) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Proces se već ugasio.
    }
  }
}

async function assertPortAvailable(targetPort) {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.once("error", reject);
    probe.listen(targetPort, "127.0.0.1", () => {
      probe.close(resolve);
    });
  });
}

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  console.error("NOTION_CLONE_PORT mora biti validan broj porta.");
  process.exit(1);
}

if (existsSync(lockPath)) {
  try {
    const existing = JSON.parse(readFileSync(lockPath, "utf8"));
    if (isProcessAlive(existing.pid)) {
      console.error(
        `Notion Clone Next dev već radi (PID ${existing.pid}, port ${existing.port ?? port}).`,
      );
      process.exit(1);
    }
  } catch {
    // Nevažeći ili zastareo lock se uklanja ispod.
  }
  rmSync(lockPath, { force: true });
}

if (freemem() < minimumStartMemory) {
  console.error(
    "Nema dovoljno slobodne memorije za bezbedno pokretanje Next dev servera (potrebno je najmanje 2 GB). Zatvori nepotrebne procese i pokušaj ponovo.",
  );
  process.exit(1);
}

try {
  await assertPortAvailable(port);
} catch {
  console.error(`Port ${port} je već zauzet. Ugasi postojeći server ili podesi NOTION_CLONE_PORT.`);
  process.exit(1);
}

writeFileSync(
  lockPath,
  JSON.stringify({ pid: process.pid, port, startedAt: Date.now() }),
  { flag: "wx" },
);

const nextCli = join(projectRoot, "node_modules", "next", "dist", "bin", "next");
const child = spawn(
  process.execPath,
  [nextCli, "dev", useWebpack ? "--webpack" : "--turbopack", "--port", String(port)],
  {
    cwd: projectRoot,
    stdio: "inherit",
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      NODE_OPTIONS: [process.env.NODE_OPTIONS, "--max-old-space-size=1536"]
        .filter(Boolean)
        .join(" "),
    },
  },
);

let emergencySamples = 0;
let stopping = false;
let requestedExitCode = null;
const memoryGuard = setInterval(() => {
  if (freemem() >= emergencyFreeMemory) {
    emergencySamples = 0;
    return;
  }

  emergencySamples += 1;
  if (emergencySamples < 3 || stopping) return;
  stopping = true;
  requestedExitCode = 1;
  console.error(
    "\nZaštita je ugasila Next dev server jer je slobodna sistemska memorija ostala ispod 1.25 GB. Ovo sprečava zamrzavanje Windowsa.",
  );
  terminateProcessTree(child.pid);
}, 1_000);
memoryGuard.unref();

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    requestedExitCode = 0;
    terminateProcessTree(child.pid);
  });
}

child.on("error", (error) => {
  clearInterval(memoryGuard);
  cleanupLock();
  console.error(`Next dev nije pokrenut: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  clearInterval(memoryGuard);
  cleanupLock();
  if (signal && !stopping) process.kill(process.pid, signal);
  else process.exit(requestedExitCode ?? code ?? 1);
});

process.on("exit", cleanupLock);
