import { chmod, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { ensureDataRoot } from "./data-root.js";
import { runMigrations } from "./migrations.js";
import { databaseSchema } from "./schema.js";

const databaseFilename = "koradio.sqlite";
const require = createRequire(import.meta.url);

export interface KoradioDatabase {
  readonly $client: DatabaseSync;
}

interface DrizzleRuntimeModule {
  drizzle(options: { client: DatabaseSync; schema: typeof databaseSchema }): KoradioDatabase;
}

const drizzleRuntime = require("drizzle-orm/node-sqlite") as DrizzleRuntimeModule;

export interface BootstrapDatabaseOptions {
  dataRoot: string;
  migrationsFolder?: string;
}

export interface DatabaseContext {
  client: DatabaseSync;
  database: KoradioDatabase;
  databasePath: string;
  dataRoot: string;
  close(): void;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function readPragma(client: DatabaseSync, pragma: string): string | number | bigint {
  const row = client.prepare(`PRAGMA ${pragma}`).get();
  const value = row === undefined ? undefined : Object.values(row)[0];

  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
    return value;
  }

  throw new Error(`SQLite pragma ${pragma} did not return a scalar value`);
}

function configureConnection(client: DatabaseSync): void {
  client.exec("PRAGMA foreign_keys = ON");
  client.exec("PRAGMA journal_mode = WAL");

  if (readPragma(client, "foreign_keys") !== 1) {
    throw new Error("SQLite foreign keys could not be enabled");
  }

  if (readPragma(client, "journal_mode") !== "wal") {
    throw new Error("SQLite WAL mode could not be enabled");
  }
}

export async function bootstrapDatabase(
  options: BootstrapDatabaseOptions,
): Promise<DatabaseContext> {
  await ensureDataRoot(options.dataRoot);

  const databasePath = join(options.dataRoot, databaseFilename);
  const databaseExisted = await pathExists(databasePath);
  const client = new DatabaseSync(databasePath, { timeout: 5_000 });

  try {
    if (!databaseExisted && process.platform !== "win32") {
      await chmod(databasePath, 0o600);
    }

    configureConnection(client);

    const database = drizzleRuntime.drizzle({ client, schema: databaseSchema });
    runMigrations(database, options.migrationsFolder);

    return {
      client,
      database,
      databasePath,
      dataRoot: options.dataRoot,
      close() {
        if (client.isOpen) {
          client.close();
        }
      },
    };
  } catch (error) {
    if (client.isOpen) {
      client.close();
    }

    throw error;
  }
}
