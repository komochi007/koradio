import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import type { KoradioDatabase } from "./database.js";

const require = createRequire(import.meta.url);

interface DrizzleMigratorModule {
  migrate(database: KoradioDatabase, config: { migrationsFolder: string }): void;
}

const drizzleMigrator = require("drizzle-orm/node-sqlite/migrator") as DrizzleMigratorModule;

export const defaultMigrationsFolder = fileURLToPath(
  new URL("../../../migrations/", import.meta.url),
);

export function runMigrations(
  database: KoradioDatabase,
  migrationsFolder = defaultMigrationsFolder,
): void {
  drizzleMigrator.migrate(database, { migrationsFolder });
}
