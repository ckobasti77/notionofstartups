import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const projectRoot = process.cwd();
const projectKey = createHash("sha256").update(projectRoot).digest("hex").slice(0, 12);
const lockPath = join(tmpdir(), `notion-clone-convex-${projectKey}.lock`);

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

if (existsSync(lockPath)) {
  const existingPid = Number.parseInt(readFileSync(lockPath, "utf8"), 10);
  if (isProcessAlive(existingPid)) {
    console.error(
      `Convex dev već radi za ovaj projekat (PID ${existingPid}). Nemoj pokretati drugi watcher.`,
    );
    process.exit(1);
  }
  rmSync(lockPath, { force: true });
}

writeFileSync(lockPath, String(process.pid), { flag: "wx" });

const convexCli = join(projectRoot, "node_modules", "convex", "bin", "main.js");
const child = spawn(process.execPath, [convexCli, "dev", "--typecheck=disable"], {
  cwd: projectRoot,
  stdio: "inherit",
});

function cleanup() {
  try {
    if (readFileSync(lockPath, "utf8") === String(process.pid)) {
      rmSync(lockPath, { force: true });
    }
  } catch {
    // Lock je već uklonjen ili ga je zamenio sledeći validan proces.
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on("error", (error) => {
  cleanup();
  console.error(`Convex dev nije pokrenut: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  cleanup();
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});

process.on("exit", cleanup);
