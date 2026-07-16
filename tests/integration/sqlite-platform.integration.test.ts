import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync, type SQLOutputValue } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { bootstrapDatabase } from "../../apps/server/src/platform/db/database.js";

interface TestMigration {
  sql: string;
  tag: string;
}

async function createTemporaryDirectory(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

async function writeMigrations(
  migrationsFolder: string,
  migrations: TestMigration[],
): Promise<void> {
  await Promise.all(
    migrations.map(async (migration) => {
      const migrationDirectory = join(migrationsFolder, migration.tag);
      await mkdir(migrationDirectory, { recursive: true });
      await writeFile(join(migrationDirectory, "migration.sql"), migration.sql);
    }),
  );
}

function readScalar(client: DatabaseSync, sql: string): SQLOutputValue | undefined {
  const row = client.prepare(sql).get();
  return row === undefined ? undefined : Object.values(row)[0];
}

describe("SQLite platform bootstrap", () => {
  it("migrates an empty data root and enforces database pragmas", async () => {
    const dataRoot = await createTemporaryDirectory("koradio-empty-db-");
    const context = await bootstrapDatabase({ dataRoot });

    try {
      expect(readScalar(context.client, "PRAGMA foreign_keys")).toBe(1);
      expect(readScalar(context.client, "PRAGMA journal_mode")).toBe("wal");
      expect(readScalar(context.client, "PRAGMA user_version")).toBe(3);
      expect(readScalar(context.client, "SELECT COUNT(*) FROM __drizzle_migrations")).toBe(3);
      expect(
        readScalar(
          context.client,
          "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('device_settings', 'profile_preferences', 'data_root_migration', 'profile', 'taste_overrides')",
        ),
      ).toBe(5);

      context.client.exec(`
        CREATE TABLE parent (id INTEGER PRIMARY KEY);
        CREATE TABLE child (
          id INTEGER PRIMARY KEY,
          parent_id INTEGER NOT NULL REFERENCES parent(id)
        );
      `);

      expect(() => {
        context.client.prepare("INSERT INTO child (id, parent_id) VALUES (1, 999)").run();
      }).toThrow();

      if (process.platform !== "win32") {
        expect((await stat(context.databasePath)).mode & 0o777).toBe(0o600);
      }
    } finally {
      context.close();
    }
  });

  it("keeps repeated migration runs idempotent", async () => {
    const dataRoot = await createTemporaryDirectory("koradio-repeat-db-");
    const first = await bootstrapDatabase({ dataRoot });
    first.close();

    const second = await bootstrapDatabase({ dataRoot });
    try {
      expect(readScalar(second.client, "SELECT COUNT(*) FROM __drizzle_migrations")).toBe(3);
      expect(readScalar(second.client, "PRAGMA user_version")).toBe(3);
    } finally {
      second.close();
    }
  });

  it("upgrades an existing database with only pending migrations", async () => {
    const dataRoot = await createTemporaryDirectory("koradio-upgrade-db-");
    const migrationsFolder = await createTemporaryDirectory("koradio-upgrade-migrations-");
    const firstMigration: TestMigration = {
      tag: "20260716000000_initial",
      sql: `
        CREATE TABLE migration_probe (
          id INTEGER PRIMARY KEY,
          version INTEGER NOT NULL
        );
        --> statement-breakpoint
        INSERT INTO migration_probe (id, version) VALUES (1, 1);
      `,
    };

    await writeMigrations(migrationsFolder, [firstMigration]);
    const first = await bootstrapDatabase({ dataRoot, migrationsFolder });
    first.close();

    await writeMigrations(migrationsFolder, [
      firstMigration,
      {
        tag: "20260716000100_upgrade",
        sql: `
          ALTER TABLE migration_probe ADD COLUMN label TEXT NOT NULL DEFAULT 'v1';
          --> statement-breakpoint
          UPDATE migration_probe SET version = 2, label = 'v2' WHERE id = 1;
        `,
      },
    ]);

    const upgraded = await bootstrapDatabase({ dataRoot, migrationsFolder });
    try {
      expect(
        upgraded.client.prepare("SELECT id, version, label FROM migration_probe").get(),
      ).toEqual({ id: 1, version: 2, label: "v2" });
      expect(readScalar(upgraded.client, "SELECT COUNT(*) FROM __drizzle_migrations")).toBe(2);
    } finally {
      upgraded.close();
    }
  });

  it("rolls back a failed migration without rebuilding existing data", async () => {
    const dataRoot = await createTemporaryDirectory("koradio-failed-db-");
    const migrationsFolder = await createTemporaryDirectory("koradio-failed-migrations-");
    const firstMigration: TestMigration = {
      tag: "20260716000000_preserved",
      sql: `
        CREATE TABLE preserved_data (
          id INTEGER PRIMARY KEY,
          value TEXT NOT NULL
        );
        --> statement-breakpoint
        INSERT INTO preserved_data (id, value) VALUES (1, 'keep-me');
      `,
    };

    await writeMigrations(migrationsFolder, [firstMigration]);
    const first = await bootstrapDatabase({ dataRoot, migrationsFolder });
    const databasePath = first.databasePath;
    first.close();

    await writeMigrations(migrationsFolder, [
      firstMigration,
      {
        tag: "20260716000100_failure",
        sql: `
          CREATE TABLE rolled_back_table (id INTEGER PRIMARY KEY);
          --> statement-breakpoint
          INSERT INTO missing_table (id) VALUES (1);
        `,
      },
    ]);

    await expect(bootstrapDatabase({ dataRoot, migrationsFolder })).rejects.toThrow();

    const preserved = new DatabaseSync(databasePath);
    try {
      expect(preserved.prepare("SELECT id, value FROM preserved_data").get()).toEqual({
        id: 1,
        value: "keep-me",
      });
      expect(
        preserved
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'rolled_back_table'",
          )
          .get(),
      ).toBeUndefined();
      expect(readScalar(preserved, "SELECT COUNT(*) FROM __drizzle_migrations")).toBe(1);
    } finally {
      preserved.close();
    }
  });
});
