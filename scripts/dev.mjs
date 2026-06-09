// One command to rule them all: `npm run dev` starts the embedded PostgreSQL
// (if it isn't already up) AND the Next.js dev server together, so you never
// have to remember to start the database first.
//
// Extra args are forwarded to `next dev` (e.g. the preview harness runs
// `npm run dev -- -p 3030`).
import { spawn } from "node:child_process";
import net from "node:net";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const extraArgs = process.argv.slice(2); // forwarded to `next dev`
const DB_PORT = 5433;
const children = [];

/** Resolve true if something is already listening on the given local port. */
function portInUse(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host: "127.0.0.1" });
    sock.setTimeout(800);
    sock.once("connect", () => { sock.destroy(); resolve(true); });
    sock.once("timeout", () => { sock.destroy(); resolve(false); });
    sock.once("error", () => resolve(false));
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function shutdown(code = 0) {
  for (const c of children) {
    try { c.kill(); } catch {}
  }
  process.exit(code);
}

async function main() {
  // 1) Ensure the database is running.
  if (await portInUse(DB_PORT)) {
    console.log(`ℹ️  PostgreSQL already running on ${DB_PORT} — reusing it.`);
  } else {
    console.log("▶️  Starting embedded PostgreSQL...");
    const db = spawn(process.execPath, ["scripts/pg.mjs"], { stdio: "inherit" });
    children.push(db);
    // Wait until it accepts connections (up to ~45s for the first-run download).
    let ready = false;
    for (let i = 0; i < 90; i++) {
      if (await portInUse(DB_PORT)) { ready = true; break; }
      await wait(500);
    }
    if (!ready) console.warn("⚠️  Database not confirmed ready — continuing; Next.js will retry on first query.");
  }

  // 2) Start the Next.js dev server by running its CLI JS directly with node.
  // This avoids spawning `next.cmd`/`npx.cmd` (which throws EINVAL on Windows
  // without shell:true, and triggers a deprecation warning with it).
  const nextBin = require.resolve("next/dist/bin/next");
  const next = spawn(process.execPath, [nextBin, "dev", ...extraArgs], { stdio: "inherit" });
  children.push(next);
  next.on("exit", (code) => shutdown(code ?? 0));
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

main().catch((e) => {
  console.error("dev launcher failed:", e);
  shutdown(1);
});
