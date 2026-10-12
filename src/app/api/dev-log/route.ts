import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * Development only: receives browser diagnostics (src/lib/debug-log.ts), prints them in the
 * dev server terminal and appends them to `.logs/client.log`. 404 in production.
 */
const LOG_DIR = join(process.cwd(), ".logs");
const MAX_BYTES = 20_000;

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return new Response(null, { status: 404 });
  const body = (await request.text()).slice(0, MAX_BYTES);
  let entry: { level?: string; scope?: string; message?: string; details?: unknown };
  try {
    entry = JSON.parse(body);
  } catch {
    return new Response(null, { status: 400 });
  }
  const line = `[client:${entry.scope ?? "?"}] ${entry.message ?? ""}${entry.details === undefined ? "" : ` ${JSON.stringify(entry.details)}`}`;
  if (entry.level === "error") console.error(line);
  else if (entry.level === "warn") console.warn(line);
  else console.log(line);
  await mkdir(LOG_DIR, { recursive: true });
  await appendFile(join(LOG_DIR, "client.log"), `${body}\n`);
  return new Response(null, { status: 204 });
}
