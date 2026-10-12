/**
 * Full-match UI test in real Chrome against a running app (default http://localhost:3000).
 *
 *   bun ui-e2e
 *
 * Two isolated browser profiles (Ember and Tide) each get their own player key, which is
 * funded from your Solana CLI wallet (0.04 devnet SOL each). The test then plays by clicking
 * the real buttons: create, join by room code, Start game, give orders (troop transfers and an attack),
 * play until the match ends, and settle to Solana. It also checks that Tide's screen never
 * shows Ember's order before the reveal.
 *
 * Env: APP_URL, CHROME_PATH, WALLET, HEADFUL=1 to watch it.
 */
import { Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { mkdirSync, readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer, { type BrowserContext, type Page } from "puppeteer-core";
import { baseConnection } from "../src/lib/program";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SHOTS = process.env.SHOTS_DIR ?? tmpdir();
mkdirSync(SHOTS, { recursive: true });
const funder = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(process.env.WALLET ?? `${homedir()}/.config/solana/id.json`, "utf8"))),
);

let failures = 0;
function check(ok: boolean, label: string) {
  console.log(`${ok ? "  ✅" : "  ❌"} ${label}`);
  if (!ok) failures++;
}

const text = (page: Page) => page.evaluate(() => document.body.textContent ?? "");

/** The match screen's error banner has a "Dismiss error" button; it must never appear. */
const banners: string[] = [];
async function noErrorBanner(page: Page, who: string) {
  const banner = await page.evaluate(() => {
    const el = document.querySelector('[aria-label="Dismiss error"]')?.closest('[role="status"]');
    return el ? String(el.textContent ?? "") : null;
  });
  if (banner) banners.push(`${who}: ${banner}`);
}

async function waitForText(page: Page, needle: string | RegExp, timeout = 90_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const t = await text(page);
    if (typeof needle === "string" ? t.includes(needle) : needle.test(t)) return t;
    await new Promise((r) => setTimeout(r, 500));
  }
  await page.screenshot({ path: join(SHOTS, `ui-e2e-timeout.png`) });
  throw new Error(`timed out waiting for "${needle}" on ${page.url()}`);
}

/** Click the first enabled button whose text or aria-label matches. */
async function click(page: Page, label: string | RegExp, timeout = 90_000) {
  const start = Date.now();
  const source = typeof label === "string" ? label : label.source;
  const isRegex = typeof label !== "string";
  while (Date.now() - start < timeout) {
    const clicked = await page.evaluate(
      (src, regex) => {
        const match = (s: string) => (regex ? new RegExp(src).test(s) : s.includes(src));
        const button = [...document.querySelectorAll("button")].find(
          (b) => !b.disabled && (match(b.textContent?.trim() ?? "") || match(b.getAttribute("aria-label") ?? "")),
        );
        button?.click();
        return Boolean(button);
      },
      source,
      isRegex,
    );
    if (clicked) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  await page.screenshot({ path: join(SHOTS, `ui-e2e-timeout.png`) });
  throw new Error(`no enabled button "${label}" on ${page.url()}`);
}

async function playerKey(page: Page) {
  // The key is created once the app hydrates; wait for it rather than for any text.
  await page.waitForFunction(() => localStorage.getItem("shadow-atlas:player-key:v1"), { timeout: 30_000 });
  const secret = await page.evaluate(() => localStorage.getItem("shadow-atlas:player-key:v1"));
  if (!secret) throw new Error("player key not created");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret))).publicKey;
}

/** The "Your matches" entry for `match` on the home page, opened in a second tab of the same profile. */
async function homeEntry(ctx: BrowserContext, match: string, expect: string) {
  const home = await ctx.newPage();
  await home.goto(APP, { waitUntil: "networkidle2" }).catch(() => {});
  let entry = "";
  const start = Date.now();
  while (Date.now() - start < 60_000) {
    entry = await home.evaluate((m) => document.querySelector(`a[href="/match/${m}"]`)?.textContent ?? "", match);
    if (entry.includes(expect)) break;
    await new Promise((r) => setTimeout(r, 1000));
    if (Date.now() - start > 15_000 && !entry) await home.reload({ waitUntil: "networkidle2" }).catch(() => {});
  }
  return { home, entry };
}

/**
 * Give one order the way a player does, entirely on the map: acknowledge the last turn's
 * result if it's showing, click the territory, click the target (an enemy is attacked, your
 * own receives troops), set the troops in the order card, and commit.
 */
async function order(page: Page, kind: "Attack" | "Reinforce", from: string, to: string, troops: number) {
  const continueTo = await page.evaluate(() =>
    [...document.querySelectorAll("button")].some((b) => !b.disabled && (b.textContent ?? "").includes("Continue to turn")),
  );
  if (continueTo) await click(page, "Continue to turn");
  await click(page, new RegExp(`^${from}, held by`));
  await click(page, new RegExp(`^${to}, held by .*, ${kind === "Attack" ? "attack target" : "move troops here"}$`));
  await waitForText(page, kind === "Attack" ? `Attack ${to}` : `Move to ${to}`);
  for (let i = 0; i < 40; i++) {
    const value = Number(await page.$eval('output[aria-label="Troops to send"]', (el) => el.textContent));
    if (value === troops) break;
    await click(page, value < troops ? "Send more troops" : "Send fewer troops");
  }
  await click(page, kind === "Attack" ? "Commit attack" : "Commit transfer");
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: !process.env.HEADFUL, defaultViewport: { width: 1280, height: 900 } });
const errors: string[] = [];
const consoleErrors: string[] = [];
const rateLimited = new Map<string, number>();
const actionFailures: string[] = [];
try {
  const [ctxA, ctxB] = await Promise.all([browser.createBrowserContext(), browser.createBrowserContext()]);
  const [ember, tide] = await Promise.all([ctxA.newPage(), ctxB.newPage()]);
  for (const [name, page] of [["ember", ember], ["tide", tide]] as const) {
    page.on("pageerror", (e) => errors.push(`${name}: ${(e as Error).message ?? String(e)}`));
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(`${name}: ${m.text().slice(0, 200)}`);
      if (m.text().startsWith("[action]")) actionFailures.push(`${name}: ${m.text().slice(0, 200)}`);
    });
    page.on("response", (r) => {
      if (r.status() !== 429) return;
      const host = new URL(r.url()).host;
      const body = r.request().postData() ?? "";
      const method = body.match(/"method":"(\w+)"/)?.[1] ?? "?";
      rateLimited.set(`${name} ${host} ${method}`, (rateLimited.get(`${name} ${host} ${method}`) ?? 0) + 1);
    });
  }

  console.log("Player keys");
  await Promise.all([ember.goto(APP), tide.goto(APP)]);
  await Promise.all([waitForText(ember, "Player key"), waitForText(tide, "Player key")]);
  const [keyA, keyB] = await Promise.all([playerKey(ember), playerKey(tide)]);
  check(!keyA.equals(keyB), `separate player keys: ${keyA.toBase58().slice(0, 6)}… / ${keyB.toBase58().slice(0, 6)}…`);
  await sendAndConfirmTransaction(
    baseConnection(),
    new Transaction().add(
      SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: keyA, lamports: 0.04 * LAMPORTS_PER_SOL }),
      SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: keyB, lamports: 0.04 * LAMPORTS_PER_SOL }),
    ),
    [funder],
  );
  await Promise.all([ember.reload(), tide.reload()]);

  console.log("Lobby");
  await click(ember, "Create match");
  await ember.waitForFunction(() => location.pathname.startsWith("/match/"), { timeout: 60_000 });
  const url = ember.url();
  const matchId = url.split("/match/")[1];
  check(true, `Ember created ${matchId}`);
  await waitForText(ember, "Waiting for an opponent");
  await ember.screenshot({ path: join(SHOTS, "screen-4-lobby.png") });
  {
    const { home, entry } = await homeEntry(ctxA, matchId, "Waiting for opponent");
    check(entry.includes("Waiting for opponent"), "Ember's home lists the match: waiting for opponent");
    await home.close();
  }
  const code = (await ember.$eval("[data-room-code]", (el) => el.getAttribute("data-room-code"))) ?? "";
  check(/^[A-HJ-NP-Z2-9]{6}$/.test(code) && matchId === code, `lobby shows room code ${code}, the URL uses it`);

  console.log("Tide joins by room code");
  await tide.goto(APP, { waitUntil: "networkidle2" });
  await tide.type("#match-code", code.toLowerCase());
  await click(tide, "Join room");
  await tide.waitForFunction((c) => location.pathname === `/match/${c}`, { timeout: 30_000 }, code);
  await click(tide, `Join room ${code}`);

  console.log("Start game");
  await waitForText(ember, "Both players in. Ready to start", 150_000);
  await ember.screenshot({ path: join(SHOTS, "screen-5-lobby-ready.png") });
  await click(ember, "Start game", 150_000);
  await Promise.all([waitForText(ember, "Turn 1 of 20", 150_000), waitForText(tide, "Turn 1 of 20", 150_000)]);
  check(true, "Start game opens turn 1 on both screens, no wallet prompts");
  {
    const { home, entry } = await homeEntry(ctxB, matchId, "Your move");
    check(entry.includes("Your move"), `Tide's home lists the joined match: your move${entry.includes("Your move") ? "" : ` (saw: "${entry}")`}`);
    await home.close();
  }

  console.log("Turn 1: transfers, privacy");
  await order(ember, "Reinforce", "South Africa", "North Africa", 2);
  await waitForText(ember, "Move committed");
  const emberCommitted = await text(ember);
  check(emberCommitted.includes("South Africa → North Africa") && emberCommitted.includes("Troops committed"), "Ember sees its own committed move with troops");
  await ember.screenshot({ path: join(SHOTS, "screen-6-committed.png") });
  {
    const { home, entry } = await homeEntry(ctxA, matchId, "Waiting for Tide");
    check(entry.includes("Waiting for Tide"), "after committing, Ember's home shows waiting for Tide");
    await home.close();
  }
  const tideView = await waitForText(tide, /Ember[\s\S]*Committed/);
  check(!tideView.includes("South Africa → North Africa"), "Tide sees Ember 'Committed' but not the move");
  // Tide gives no order: when the 30 s turn clock runs out the turn resolves by itself and Tide holds.
  console.log("  (Tide sits out turn 1: waiting for the turn clock)");
  await Promise.all([waitForText(ember, "Turn 2 of 20", 90_000), waitForText(tide, "Turn 2 of 20", 90_000)]);
  const tideResult = await waitForText(tide, "Turn 1 complete");
  check(
    tideResult.includes("Reinforce South Africa → North Africa · 2") && tideResult.includes("You held (no order in time)"),
    "turn clock ran out: the turn resolved by itself, Ember's move applied and Tide held",
  );
  await tide.screenshot({ path: join(SHOTS, "screen-8-turn-result.png") });

  console.log("Turn 2: attack for the win");
  await order(ember, "Attack", "North Africa", "Middle East", 4);
  await order(tide, "Reinforce", "East Asia", "India", 1);
  const result = await waitForText(ember, "Back to lobby", 120_000);
  await Promise.all([noErrorBanner(ember, "ember"), noErrorBanner(tide, "tide")]);
  check(result.includes("Victory!") && result.includes("5 – 3") && result.includes("Captured Middle East (4 vs 3)"), "Ember captures the Middle East: Victory, 5 – 3 territories");
  const tideOver = await waitForText(tide, "Back to lobby", 60_000);
  check(tideOver.includes("Defeat") && tideOver.includes("Winner:"), "Tide sees Defeat with the winner's wallet");

  console.log("Settle (automatic)");
  await waitForText(ember, "Saved on Solana", 180_000);
  check(true, "result saved to Solana automatically and read back");
  // Tide's backup save fires after 8 s; it must find the match already saved and stay quiet.
  await new Promise((r) => setTimeout(r, 10_000));
  await Promise.all([noErrorBanner(ember, "ember (game over)"), noErrorBanner(tide, "tide (game over)")]);
  await ember.screenshot({ path: join(SHOTS, "screen-9-game-over.png"), fullPage: true });
  await ember.screenshot({ path: join(SHOTS, "ui-e2e-settled.png") });
  {
    const { home, entry } = await homeEntry(ctxA, matchId, "Settled on Solana");
    check(/Victory|Defeat|Draw/.test(entry) && entry.includes("Settled on Solana"), `Ember's home shows the result: ${entry.match(/Victory|Defeat|Draw/)?.[0]}`);
    await home.screenshot({ path: join(SHOTS, "ui-e2e-your-matches.png"), fullPage: true });
    await home.click(`a[href="/match/${matchId}"]`);
    await home.waitForFunction((m) => location.pathname === `/match/${m}`, { timeout: 30_000 }, matchId);
    check(true, "clicking the entry opens the match room");
    await home.close();
  }

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  check(banners.length === 0, `no error banners during play${banners.length ? `: ${banners.join(" | ")}` : ""}`);
  if (actionFailures.length) console.log(`  failed actions:\n    ${actionFailures.join("\n    ")}`);
  if (rateLimited.size) console.log(`  rate-limited (429) requests:\n    ${[...rateLimited].map(([k, n]) => `${k} ×${n}`).join("\n    ")}`);
  if (consoleErrors.length) console.log(`  console errors seen:\n    ${consoleErrors.slice(0, 6).join("\n    ")}`);
  console.log(`\nMatch: ${url}`);
} finally {
  await browser.close();
}
console.log(failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
