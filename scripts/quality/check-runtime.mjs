import process from "node:process";

const expectedNode = "24.18.0";
const expectedPnpm = "11.13.0";
const actualNode = process.versions.node;
const pnpmMatch = /pnpm\/([^\s]+)/.exec(process.env.npm_config_user_agent ?? "");

if (actualNode !== expectedNode) {
  throw new Error(
    `Koradio requires Node ${expectedNode}; current runtime is ${actualNode}. Switch Node before continuing.`,
  );
}

if (pnpmMatch !== null && pnpmMatch[1] !== expectedPnpm) {
  throw new Error(`Koradio requires pnpm ${expectedPnpm}; current runtime is ${pnpmMatch[1]}.`);
}

process.stdout.write(`Node ${actualNode} / pnpm ${pnpmMatch?.[1] ?? expectedPnpm}\n`);
