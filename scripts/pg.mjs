// Zero-install local PostgreSQL for development.
// Downloads a real Postgres binary on first run, then keeps a server alive
// on port 5433 with data persisted in ./.pgdata. Used by `npm run db:start`.
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(root, ".pgdata");

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "postgres",
  password: "postgres",
  port: 5433,
  persistent: true,
  // Force UTF8 so Vietnamese text stores correctly (Windows defaults to WIN1252).
  initdbFlags: ["--encoding=UTF8", "--no-locale"],
});

const alreadyInitialised = existsSync(join(dataDir, "PG_VERSION"));

async function main() {
  if (!alreadyInitialised) {
    console.log("⏳ Initialising PostgreSQL data directory (first run downloads the binary)...");
    await pg.initialise();
  }
  await pg.start();
  console.log("✅ PostgreSQL running on localhost:5433");

  try {
    await pg.createDatabase("powerplant");
    console.log("✅ Database 'powerplant' created");
  } catch {
    console.log("ℹ️  Database 'powerplant' already exists");
  }

  console.log("Leave this process running while you develop. Press Ctrl+C to stop.");
}

async function shutdown() {
  try {
    await pg.stop();
  } catch {}
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((e) => {
  console.error("Failed to start embedded PostgreSQL:", e);
  process.exit(1);
});
