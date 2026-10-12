/**
 * Development-only diagnostics. Every entry goes to the browser console and, through
 * /api/dev-log, to the dev server terminal and `.logs/client.log`, so a failure in someone's
 * browser can be read from the project without screenshots. Production builds log nothing.
 */
const enabled = process.env.NODE_ENV !== "production";

export type LogLevel = "info" | "warn" | "error";

/** Everything useful in an error from web3.js, Anchor, the wallet adapter or a wallet. */
export function describeUnknown(e: unknown): Record<string, unknown> {
  if (e === null || typeof e !== "object") return { value: String(e) };
  const err = e as Record<string, unknown> & { error?: unknown; cause?: unknown; logs?: unknown; transactionLogs?: unknown };
  const out: Record<string, unknown> = {
    name: (err.constructor as { name?: string } | undefined)?.name ?? err.name,
    message: err.message,
  };
  for (const key of ["code", "data", "logs", "transactionLogs", "transactionMessage", "signature", "error", "cause"]) {
    const value = err[key];
    if (value === undefined) continue;
    out[key] = value && typeof value === "object" && !Array.isArray(value) && key !== "data" ? describeUnknown(value) : value;
  }
  return out;
}

function safe(value: unknown) {
  try {
    return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v instanceof Uint8Array ? `<${v.length} bytes>` : v)));
  } catch {
    return String(value);
  }
}

export function debugLog(scope: string, message: string, details?: unknown, level: LogLevel = "info") {
  if (!enabled) return;
  const entry = { at: new Date().toISOString(), level, scope, message, details: details === undefined ? undefined : safe(details), page: typeof location !== "undefined" ? location.pathname : undefined };
  // Errors print as warnings in the browser: they are already handled by the app, and a
  // console.error would trigger Next.js's dev overlay. The terminal and log file keep the level.
  const print = level === "info" ? console.info : console.warn;
  if (details === undefined) print(`[${scope}] ${message}`);
  else print(`[${scope}] ${message}`, entry.details);
  if (typeof window === "undefined") return;
  try {
    void fetch("/api/dev-log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(entry), keepalive: true }).catch(() => {});
  } catch {
    // Logging must never break the app.
  }
}

/** Log an error with its full shape, at error level. */
export function debugError(scope: string, message: string, e: unknown, extra?: Record<string, unknown>) {
  debugLog(scope, message, { ...extra, error: describeUnknown(e) }, "error");
}
