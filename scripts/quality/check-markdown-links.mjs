import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const excluded = new Set([
  ".git",
  "artifacts",
  "coverage",
  "node_modules",
  "playwright-report",
  "test-results",
]);
const markdownLink = /!?\[[^\]]*]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;

async function collect(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excluded.has(entry.name)) {
      continue;
    }
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collect(path)));
    } else if (extname(entry.name) === ".md") {
      files.push(path);
    }
  }
  return files;
}

const failures = [];
for (const file of await collect(repositoryRoot)) {
  const content = await readFile(file, "utf8");
  for (const match of content.matchAll(markdownLink)) {
    const target = match[1];
    if (
      target.startsWith("#") ||
      target.startsWith("http://") ||
      target.startsWith("https://") ||
      target.startsWith("mailto:")
    ) {
      continue;
    }
    const decoded = decodeURIComponent(target.split("#", 1)[0]);
    if (decoded.length === 0) {
      continue;
    }
    try {
      await stat(resolve(dirname(file), decoded));
    } catch {
      failures.push(`${file.slice(repositoryRoot.length + 1)} -> ${target}`);
    }
  }
}

if (failures.length > 0) {
  process.stderr.write(`Broken Markdown links:\n${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Markdown relative links are valid.\n");
}
