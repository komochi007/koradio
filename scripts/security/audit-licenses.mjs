import { spawnSync } from "node:child_process";
import process from "node:process";

const allowedLicenses = new Set([
  "Apache-2.0",
  "BlueOak-1.0.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC0-1.0",
  "ISC",
  "MIT",
  "MIT-0",
]);
const result = spawnSync("pnpm", ["licenses", "list", "--prod", "--json"], {
  encoding: "utf8",
});

if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.exitCode = result.status ?? 1;
} else {
  const licenses = JSON.parse(result.stdout);
  const unsupported = Object.keys(licenses).filter((license) => !allowedLicenses.has(license));

  if (unsupported.length > 0) {
    process.stderr.write(`Unsupported production licenses: ${unsupported.join(", ")}\n`);
    process.exitCode = 1;
  } else {
    const packageCount = Object.values(licenses).reduce(
      (count, packages) => count + packages.length,
      0,
    );
    process.stdout.write(
      `Production license audit passed: ${String(packageCount)} packages; ${Object.keys(licenses).sort().join(", ")}\n`,
    );
  }
}
