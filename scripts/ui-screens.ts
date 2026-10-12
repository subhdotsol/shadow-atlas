/**
 * Every game screen in real Chrome, without sending a transaction.
 *
 *   bun ui-screens            (needs `bun dev` running)
 *
 * Opens /dev/screens (development-only fixed match states), checks each screen's content,
 * walks the move composer (select a territory → Attack → target → troops → summary), and
 * fails on console errors, uncaught exceptions or horizontal scroll at 375 px. Screenshots
 * go to SHOTS_DIR when set.
 *
 * Env: APP_URL, CHROME_PATH, SHOTS_DIR.
 */
import { mkdirSync } from "node:fs";
import puppeteer, { type Page } from "puppeteer-core";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SHOTS = process.env.SHOTS_DIR;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

let failures = 0;
function check(ok: boolean, label: string) {
  console.log(`${ok ? "  ✅" : "  ❌"} ${label}`);
  if (!ok) failures++;
}

const text = (page: Page) => page.evaluate(() => document.body.innerText);
async function has(page: Page, ...needles: string[]) {
  // Card titles are uppercased by CSS, which innerText reflects: compare case-insensitively.
  const body = (await text(page)).toLowerCase();
  const missing = needles.filter((n) => !body.includes(n.toLowerCase()));
  return { ok: missing.length === 0, missing };
}
async function expectText(page: Page, label: string, ...needles: string[]) {
  const { ok, missing } = await has(page, ...needles);
  check(ok, ok ? label : `${label} (missing: ${missing.join(", ")})`);
}
async function click(page: Page, match: string | RegExp) {
  const ok = await page.evaluate(
    (src, flags) => {
      const re = new RegExp(src, flags);
      const el = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
        (b) => !b.disabled && (re.test((b.textContent ?? "").trim()) || re.test(b.getAttribute("aria-label") ?? "")),
      );
      el?.click();
      return Boolean(el);
    },
    typeof match === "string" ? `^${match.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}` : match.source,
    typeof match === "string" ? "" : match.flags,
  );
  if (!ok) throw new Error(`no enabled button matching ${match}`);
  await new Promise((r) => setTimeout(r, 150));
}
async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
const errors: string[] = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

async function open(scenario: string, width = 1280) {
  await page.setViewport({ width, height: 900 });
  await page.goto(`${APP}/dev/screens?s=${scenario}`, { waitUntil: "networkidle2", timeout: 60_000 });
  await page.waitForSelector("main nav[aria-label=Screens]", { timeout: 30_000 });
}

try {
  console.log("Lobby");
  await open("lobby-waiting");
  await expectText(page, "room code, wallets, status", "Game lobby", "Room ID", "K7Q2XM", "Player 1 · Ember", "Player 2 · Tide", "Status", "Waiting for an opponent", "Start game");
  check(await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Start game"))?.disabled === true), "Start game disabled until both are in");
  await shot(page, "01-lobby-waiting");
  await open("lobby-ready");
  await expectText(page, "both in: Start game", "Both players in. Ready to start", "Either player can start.");
  check(await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Start game"))?.disabled === false), "Start game enabled for a player");
  await shot(page, "02-lobby-ready");

  console.log("Board");
  await open("turn");
  await expectText(page, "one bar: who you are, score, opponent, clock", "You are Ember", "You 4/8", "Tide 4/8", "Tide is choosing", "Click one of your territories");
  check(await page.evaluate(() => !!document.querySelector('button[aria-label="Play full screen"]')), "full screen button");
  await click(page, "How to play");
  check(await page.evaluate(() => document.querySelector("dialog")?.open === true && document.querySelector("dialog")!.innerText.includes("Troops only travel along the dotted lines")), "? button opens the rules popup");
  await page.keyboard.press("Escape");
  check(await page.evaluate(() => document.querySelector("dialog")?.open === false), "Esc closes the rules popup");
  check(
    await page.evaluate(() => [...document.querySelectorAll("button[aria-label]")].filter((b) => /held by Tide/.test(b.getAttribute("aria-label")!)).every((b) => (b as HTMLButtonElement).disabled)),
    "enemy tiles can't be selected on their own",
  );
  check(await page.evaluate(() => !document.body.innerText.includes("Selected territory")), "no side panel duplicating the map");
  await expectText(page, "legend and rules", "First to 5 territories wins", "Border: attack or move along it");

  await click(page, /^North Africa, held by Ember/);
  const tagged = await page.evaluate(() =>
    [...document.querySelectorAll("button[aria-label]")]
      .map((b) => b.getAttribute("aria-label")!)
      .filter((l) => /, (attack target|move troops here)$/.test(l))
      .map((l) => `${l.split(",")[0]}:${l.endsWith("attack target") ? "attack" : "move"}`)
      .sort(),
  );
  check(
    JSON.stringify(tagged) === JSON.stringify(["Europe:attack", "Middle East:attack", "South Africa:move", "South America:move"]),
    `neighbours tagged Attack / Move here on the map: ${tagged.join(", ")}`,
  );
  await expectText(page, "map tags", "From here", "Attack", "Move here", "Click Attack or Move here");
  check(await page.evaluate(() => (document.querySelector('button[aria-label^="India,"]') as HTMLButtonElement).disabled), "out-of-reach enemy (India) can't be clicked");
  await shot(page, "03-selected");

  await click(page, /^Middle East, held by Tide/);
  await expectText(page, "clicking an enemy neighbour opens the order card on the map", "Attack Middle East", "from North Africa · up to 4 can go", "Commit attack", "4 vs 3 defending: you capture it", "Choose troops and commit");
  const sendTroops = () => page.$eval('output[aria-label="Troops to send"]', (el) => el.textContent);
  check((await sendTroops()) === "4", "attacks default to the most that can leave (4)");
  await click(page, "Send fewer troops");
  await expectText(page, "order card odds", "3 vs 3 defending: not enough");
  await click(page, "Send more troops");
  const card = await page.evaluate(() => {
    const r = document.querySelector('[aria-label="Order"]')!.getBoundingClientRect();
    const tiles = [...document.querySelectorAll("button[aria-label]")].filter((b) => /^(North Africa|Middle East),/.test(b.getAttribute("aria-label")!));
    return tiles.every((t) => {
      const b = t.getBoundingClientRect();
      return b.right < r.left || b.left > r.right || b.bottom < r.top || b.top > r.bottom;
    });
  });
  check(card, "order card sits on the map without covering the attacker or the target");
  await expectText(page, "order previewed on the tiles", "−4 leaving", "⚔ 4 incoming", "North Africa keeps 1.");
  await shot(page, "04-attack");

  await click(page, /^South Africa, held by Ember/); // switch the target to a transfer
  await expectText(page, "transfer card", "Move to South Africa", "Commit transfer", "North Africa keeps 4");
  check((await sendTroops()) === "1", "transfers default to 1 troop");
  await shot(page, "05-transfer");
  await expectText(page, "transfer previewed", "+1 arriving", "−1 leaving", "South Africa gets 3");
  await click(page, "Cancel order");
  check(await page.evaluate(() => !document.querySelector('[aria-label="Order"]')), "cancel closes the order card, selection stays");
  await page.keyboard.press("Escape");
  await expectText(page, "Esc clears the selection", "Click one of your territories");
  await click(page, /^North Africa, held by Ember/);
  await click(page, /^Cancel$/);
  await expectText(page, "Cancel in the hint clears the selection", "Click one of your territories");
  await click(page, /^North Africa, held by Ember/);
  await page.evaluate(() => {
    const box = document.querySelector('button[aria-label^="India,"]')!.closest(".relative")!.parentElement!.parentElement as HTMLElement;
    const map = [...document.querySelectorAll<HTMLElement>("div[style*='aspect-ratio']")][0];
    (map ?? box).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await expectText(page, "a click on empty map clears the selection", "Click one of your territories");
  await click(page, /^North Africa, held by Ember/);
  await click(page, /^North Africa, held by Ember/);
  await expectText(page, "clicking the selected tile again clears it", "Click one of your territories");

  console.log("Commit → reveal → turn complete");
  await open("committed");
  await expectText(page, "committed", "Move committed", "Waiting for Tide", "Move selected", "North Africa → Middle East", "Troops committed");
  await shot(page, "06-committed");
  await open("revealing");
  await expectText(page, "revealing transition", "Both moves committed", "Revealing the turn…");
  await shot(page, "07-revealing");
  await open("result");
  await expectText(page, "reveal table", "Turn 1 revealed", "Player", "Move", "Result", "Reinforce South Africa → North Africa · 2", "Reinforce East Asia → India · 1");
  await expectText(page, "fight changes shown on the tiles", "+2 this turn", "−2 this turn", "+1 this turn", "−1 this turn");
  await expectText(page, "turn result card, no Continue click needed", "Turn 1 complete", "Turn 2 is open: give your next order", "New troops: you +4, Ember +4");
  check(await page.evaluate(() => ![...document.querySelectorAll("button")].some((b) => b.textContent?.includes("Continue to turn"))), "no Continue button");
  check((await page.evaluate(() => [...document.querySelectorAll("button[aria-label] > span")].filter((el) => el.textContent === "+1").length)) === 8, "+1 shown on all 8 held tiles");
  const firstRow = await page.$eval("tbody tr th", (el) => el.textContent?.trim());
  check(firstRow === "You", `my row first (${firstRow})`);
  await expectText(page, "you can order during the result", "Click one of your territories");
  await shot(page, "08-turn-result");
  await new Promise((r) => setTimeout(r, 6_500));
  check(await page.evaluate(() => !document.body.innerText.includes("Turn 1 complete")), "the result card closes by itself");

  console.log("Game over");
  await open("victory");
  await expectText(page, "victory", "Victory!", "Winner:", "Ember", "Final territories", "5 – 3", "Turns played", "Result", "Ember holds 5 of 8 territories", "Back to lobby", "Saved on Solana");
  await expectText(page, "final turn reveal", "Final turn · turn 2", "Captured Middle East (4 vs 3)");
  await shot(page, "09-victory");
  await open("defeat");
  await expectText(page, "defeat", "Defeat", "Winner:");
  await open("spectator");
  await expectText(page, "spectator", "You're watching", "Turn 1 revealed");

  console.log("Phone width (375 px)");
  for (const s of ["lobby-waiting", "turn", "result", "victory"]) {
    await open(s, 375);
    if (s === "turn") await click(page, /^North Africa, held by Ember/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(overflow <= 0, `${s}: no horizontal scroll (${overflow}px)`);
    await shot(page, `phone-${s}`);
  }

  console.log("Dark theme");
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await open("turn");
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await click(page, /^North Africa, held by Ember/);
  await shot(page, "10-dark-selected");

  check(errors.length === 0, `no console errors${errors.length ? `: ${errors.slice(0, 3).join(" / ")}` : ""}`);
} catch (e) {
  check(false, String(e));
  await shot(page, "failure");
} finally {
  await browser.close();
}

console.log(failures === 0 ? "\nAll screen checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
