/**
 * Keep the frontend's copy of the Shadow Atlas IDL in lockstep with the contract.
 *
 *   bun idl:sync    copy the IDL + generated TS types from the contract build
 *   bun idl:check   fail if the copy is stale, or the program isn't deployed at the IDL address
 *
 * The contract repo defaults to ../shadow-atlas; override with SHADOW_ATLAS_PROGRAM_DIR.
 * `bun idl:check --offline` skips the on-chain check.
 */
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const programDir = resolve(root, process.env.SHADOW_ATLAS_PROGRAM_DIR ?? "../shadow-atlas");
const rpc = process.env.NEXT_PUBLIC_BASE_RPC ?? "https://api.devnet.solana.com";

const files = [
  { from: "target/idl/shadow_atlas.json", to: "src/idl/shadow_atlas.json" },
  { from: "target/types/shadow_atlas.ts", to: "src/idl/shadow_atlas.ts" },
];

type Idl = { address: string; instructions: { name: string }[]; accounts?: { name: string }[] };

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function source(path: string) {
  const full = resolve(programDir, path);
  if (!existsSync(full)) fail(`${full} not found. Run \`anchor build\` in ${programDir}.`);
  return Bun.file(full);
}

async function sync() {
  mkdirSync(resolve(root, "src/idl"), { recursive: true });
  for (const f of files) {
    await Bun.write(resolve(root, f.to), source(f.from));
    console.log(`✓ ${f.from} → ${f.to}`);
  }
}

function names(idl: Idl, key: "instructions" | "accounts") {
  return (idl[key] ?? []).map((x) => x.name).sort();
}

async function check(offline: boolean) {
  let stale = false;
  for (const f of files) {
    const local = resolve(root, f.to);
    if (!existsSync(local)) fail(`${f.to} missing. Run \`bun idl:sync\`.`);
    const [a, b] = await Promise.all([source(f.from).text(), Bun.file(local).text()]);
    if (a === b) {
      console.log(`✓ ${f.to} matches the contract build`);
      continue;
    }
    stale = true;
    console.error(`✗ ${f.to} differs from ${f.from}`);
    if (f.to.endsWith(".json")) {
      const [want, have] = [JSON.parse(a) as Idl, JSON.parse(b) as Idl];
      if (want.address !== have.address) console.error(`  address: ${have.address} → ${want.address}`);
      for (const key of ["instructions", "accounts"] as const) {
        const [w, h] = [names(want, key), names(have, key)];
        const added = w.filter((n) => !h.includes(n));
        const removed = h.filter((n) => !w.includes(n));
        if (added.length) console.error(`  ${key} added:   ${added.join(", ")}`);
        if (removed.length) console.error(`  ${key} removed: ${removed.join(", ")}`);
      }
    }
  }
  if (stale) fail("IDL is stale. Run `bun idl:sync`.");

  const idl = (await Bun.file(resolve(root, "src/idl/shadow_atlas.json")).json()) as Idl;
  console.log(`  program ${idl.address}`);
  console.log(`  ${idl.instructions.length} instructions: ${names(idl, "instructions").join(", ")}`);

  if (offline) return;
  const res = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getAccountInfo",
      params: [idl.address, { encoding: "base64", dataSlice: { offset: 0, length: 0 } }],
    }),
  }).catch((e) => fail(`could not reach ${rpc}: ${e}`));
  const { result } = (await res.json()) as { result?: { value: { executable: boolean } | null } };
  if (!result?.value) fail(`no program deployed at ${idl.address} on ${rpc}`);
  if (!result.value.executable) fail(`${idl.address} exists but is not an executable program`);
  console.log(`✓ program is deployed on ${rpc}`);
}

const [cmd, ...flags] = process.argv.slice(2);
if (cmd === "sync") await sync();
else if (cmd === "check") await check(flags.includes("--offline"));
else fail("usage: bun scripts/idl.ts <sync|check> [--offline]");
