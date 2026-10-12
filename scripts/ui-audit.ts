/**
 * Browser audit against a running app (default http://localhost:3000).
 *
 *   bun ui-audit
 *
 * 1. Loads every page in real Chrome and fails on console errors or uncaught exceptions.
 * 2. Injects a fake Wallet Standard wallet that refuses every signature the way Phantom does
 *    when it's on the wrong network ("Unexpected error"), connects it through the wallet
 *    modal, and checks that a top-up shows clear guidance instead of an error overlay.
 *    The fake wallet reports your CLI wallet's address, so the devnet balance check passes
 *    and the wallet really is asked to send.
 *
 * 3. Theme: a first visit follows the OS setting before first paint, the light/dark switch
 *    works by mouse and keyboard, the saved choice beats the OS on reload, no hydration
 *    warnings, and no horizontal scroll at 375px.
 *
 * Env: APP_URL, CHROME_PATH, WALLET, MATCH (a match address to render; defaults to a settled one).
 */
import { Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { baseConnection } from "../src/lib/program";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import puppeteer, { type Page } from "puppeteer-core";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const MATCH = process.env.MATCH ?? "6YmLW7BdzjD19AQTzaGsnPt6EB5AMHu2zwnLhQC3nSq9";
const cliWallet = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(process.env.WALLET ?? `${homedir()}/.config/solana/id.json`, "utf8"))),
);
const walletAddress = cliWallet.publicKey;

let failures = 0;
function check(ok: boolean, label: string) {
  console.log(`${ok ? "  ✅" : "  ❌"} ${label}`);
  if (!ok) failures++;
}

const text = (page: Page) => page.evaluate(() => document.body.textContent ?? "");
async function waitForText(page: Page, needle: string, timeout = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if ((await text(page)).includes(needle)) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}
async function clickButton(page: Page, label: string) {
  const ok = await page.evaluate((l) => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => !x.disabled && ((x.textContent ?? "").includes(l) || (x.getAttribute("aria-label") ?? "").includes(l)),
    );
    b?.click();
    return Boolean(b);
  }, label);
  if (!ok) throw new Error(`button "${label}" not found`);
}

/** Runs in the page before any app code: a Wallet Standard wallet that refuses to sign. */
function installRefusingWallet(address: string, publicKey: number[]) {
  const account = {
    address,
    publicKey: new Uint8Array(publicKey),
    chains: ["solana:devnet", "solana:mainnet"],
    features: ["solana:signTransaction", "solana:signAndSendTransaction", "solana:signMessage"],
  };
  const refuse = async () => {
    // Phantom's error shape when it can't handle the request.
    throw Object.assign(new Error("Unexpected error"), { code: -32603 });
  };
  const wallet = {
    version: "1.0.0",
    name: "Refusing Wallet",
    icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxIDEiLz4=",
    chains: account.chains,
    accounts: [] as (typeof account)[],
    features: {
      "standard:connect": {
        version: "1.0.0",
        connect: async () => {
          wallet.accounts = [account];
          return { accounts: wallet.accounts };
        },
      },
      "standard:disconnect": { version: "1.0.0", disconnect: async () => void (wallet.accounts = []) },
      "standard:events": { version: "1.0.0", on: () => () => {} },
      "solana:signTransaction": { version: "1.0.0", supportedTransactionVersions: ["legacy", 0], signTransaction: refuse },
      "solana:signAndSendTransaction": { version: "1.0.0", supportedTransactionVersions: ["legacy", 0], signAndSendTransaction: refuse },
      "solana:signMessage": { version: "1.0.0", signMessage: refuse },
    },
  };
  const callback = ({ register }: { register: (w: unknown) => void }) => register(wallet);
  window.addEventListener("wallet-standard:app-ready", (e) => callback((e as CustomEvent).detail));
  try {
    window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: callback }));
  } catch {
    // App not listening yet; it will announce app-ready.
  }
}

/**
 * Runs in the page before any app code: a wallet like Phantom left on mainnet. It signs
 * (through `__signTx`, exposed by the test with a throwaway devnet key) but its own send
 * fails, because it would broadcast to mainnet.
 */
function installMainnetModeWallet(address: string, publicKey: number[]) {
  const account = {
    address,
    publicKey: new Uint8Array(publicKey),
    chains: ["solana:devnet", "solana:mainnet"],
    features: ["solana:signTransaction", "solana:signAndSendTransaction"],
  };
  const w = window as unknown as { __signTx: (tx: number[]) => Promise<number[]>; __prompts: number };
  w.__prompts = 0;
  const wallet = {
    version: "1.0.0",
    name: "Mainnet Mode Wallet",
    icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxIDEiLz4=",
    chains: account.chains,
    accounts: [] as (typeof account)[],
    features: {
      "standard:connect": {
        version: "1.0.0",
        connect: async () => {
          wallet.accounts = [account];
          return { accounts: wallet.accounts };
        },
      },
      "standard:disconnect": { version: "1.0.0", disconnect: async () => void (wallet.accounts = []) },
      "standard:events": { version: "1.0.0", on: () => () => {} },
      "solana:signTransaction": {
        version: "1.0.0",
        supportedTransactionVersions: ["legacy", 0],
        signTransaction: async (...inputs: { transaction: Uint8Array; chain?: string }[]) => {
          w.__prompts += 1;
          // Like Phantom on mainnet: a request that doesn't name the devnet chain is treated as
          // mainnet, where the devnet blockhash is unknown, and fails.
          if (inputs.some((i) => i.chain !== "solana:devnet")) throw Object.assign(new Error("Unexpected error"), { code: -32603 });
          return Promise.all(inputs.map(async ({ transaction }) => ({ signedTransaction: new Uint8Array(await w.__signTx([...transaction])) })));
        },
      },
      "solana:signAndSendTransaction": {
        version: "1.0.0",
        supportedTransactionVersions: ["legacy", 0],
        signAndSendTransaction: async () => {
          w.__prompts += 1;
          throw Object.assign(new Error("Unexpected error"), { code: -32603 });
        },
      },
    },
  };
  const callback = ({ register }: { register: (w: unknown) => void }) => register(wallet);
  window.addEventListener("wallet-standard:app-ready", (e) => callback((e as CustomEvent).detail));
  try {
    window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: callback }));
  } catch {
    // App not listening yet; it will announce app-ready.
  }
}

/** Records data-theme at the moment <body> is created, i.e. before first paint. */
function recordThemeAtFirstPaint() {
  const w = window as unknown as { __themeAtBody?: string | null };
  new MutationObserver((_, observer) => {
    if (document.body) {
      w.__themeAtBody = document.documentElement.getAttribute("data-theme");
      observer.disconnect();
    }
  // Observe the document itself: this runs before <html> exists.
  }).observe(document, { childList: true, subtree: true });
}

const themeAtBody = (page: Page) => page.evaluate(() => (window as unknown as { __themeAtBody?: string | null }).__themeAtBody ?? null);
const themeNow = (page: Page) => page.evaluate(() => document.documentElement.getAttribute("data-theme"));

async function themeAudit(shots: string) {
  console.log("Theme (light / dark)");
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const hydration: string[] = [];
  page.on("console", (m) => /hydrat/i.test(m.text()) && hydration.push(m.text()));
  await page.evaluateOnNewDocument(recordThemeAtFirstPaint);
  const SWITCH = 'button[role="switch"][aria-label="Dark mode"]';
  const checked = () => page.evaluate((sel) => document.querySelector(sel)?.getAttribute("aria-checked"), SWITCH);
  const flip = async () => {
    await page.waitForSelector(SWITCH, { timeout: 15_000 });
    await page.click(SWITCH);
    await new Promise((r) => setTimeout(r, 150));
  };
  const load = async (os: "light" | "dark", path = "/") => {
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: os }]);
    await page.goto(`${APP}${path}`, { waitUntil: "networkidle2", timeout: 60_000 }).catch(() => {});
    await page.waitForSelector(SWITCH, { timeout: 15_000 });
  };

  // First visit: no saved choice, so the page follows the OS setting from the first paint.
  for (const os of ["dark", "light"] as const) {
    await load(os);
    check((await themeAtBody(page)) === os, `first visit on a ${os} OS starts ${os} before first paint`);
    check((await checked()) === String(os === "dark"), `switch shows ${os}`);
  }

  // Flip to dark on a light OS; the choice is saved and beats the OS on the next load.
  await flip();
  check((await themeNow(page)) === "dark" && (await checked()) === "true", "switch → dark");
  await load("light");
  check((await themeAtBody(page)) === "dark", "saved dark survives a reload on a light OS, before first paint");
  await page.screenshot({ path: `${shots}/theme-dark-home.png` });

  // And back to light on a dark OS.
  await flip();
  check((await themeNow(page)) === "light" && (await checked()) === "false", "switch → light");
  await load("dark");
  check((await themeAtBody(page)) === "light", "saved light survives a reload on a dark OS, before first paint");
  await page.screenshot({ path: `${shots}/theme-light-home.png` });

  // Keyboard: Space toggles the focused switch.
  await page.focus(SWITCH);
  await page.keyboard.press("Space");
  await new Promise((r) => setTimeout(r, 150));
  check((await themeNow(page)) === "dark", "switch works from the keyboard");
  await page.goto(`${APP}/match/${MATCH}`, { waitUntil: "networkidle2", timeout: 60_000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 3000));
  await page.screenshot({ path: `${shots}/theme-dark-match.png` });

  await page.setViewport({ width: 375, height: 800 });
  await load("light");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 0, `no horizontal scroll at 375px${overflow > 0 ? ` (${overflow}px)` : ""}`);
  await page.screenshot({ path: `${shots}/theme-375.png` });

  check(hydration.length === 0, `no hydration warnings${hydration.length ? ` → ${hydration[0].slice(0, 160)}` : ""}`);
  await ctx.close();
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, defaultViewport: { width: 1280, height: 900 } });
try {
  console.log("Console audit");
  for (const path of ["/", `/match/${MATCH}`, "/match/not-a-match", "/does-not-exist"]) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    const problems: string[] = [];
    page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
    page.on("pageerror", (e) => problems.push(String((e as Error).message ?? e)));
    await page.goto(`${APP}${path}`, { waitUntil: "networkidle2", timeout: 60_000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 4000));
    // A 404 document request is expected for the unknown route.
    const relevant = problems.filter((p) => !(path === "/does-not-exist" && /404/.test(p)));
    check(relevant.length === 0, `${path}: no console errors${relevant.length ? ` → ${relevant.slice(0, 3).join(" | ")}` : ""}`);
    await ctx.close();
  }

  console.log("Wallet that refuses to sign (Phantom on the wrong network)");
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => consoleErrors.push(String((e as Error).message ?? e)));
  await page.evaluateOnNewDocument(installRefusingWallet, walletAddress.toBase58(), Array.from(walletAddress.toBytes()));
  await page.goto(APP, { waitUntil: "networkidle2", timeout: 60_000 }).catch(() => {});

  await waitForText(page, "Select Wallet");
  await clickButton(page, "Select Wallet");
  check(await waitForText(page, "Refusing Wallet", 10_000), "fake wallet listed in the wallet modal");
  await clickButton(page, "Refusing Wallet");
  check(await waitForText(page, "devnet SOL", 15_000), "connected; panel shows the wallet's devnet balance");

  await clickButton(page, "Top up");
  const guided = await waitForText(page, "Switch your wallet to Devnet", 30_000);
  check(guided, "top-up failure explains how to switch the wallet to devnet");
  check(await waitForText(page, "Get devnet SOL"), "wallet-free funding option is offered");
  check(consoleErrors.length === 0, `no console errors / overlay${consoleErrors.length ? ` → ${consoleErrors.slice(0, 2).join(" | ")}` : ""}`);
  await page.screenshot({ path: `${process.env.SHOTS_DIR ?? "/tmp"}/ui-audit-topup.png` });
  await ctx.close();

  console.log("Wallet on mainnet that can still sign (top-up is sent to devnet by the app)");
  {
    const tester = Keypair.generate();
    await sendAndConfirmTransaction(
      baseConnection(),
      new Transaction().add(SystemProgram.transfer({ fromPubkey: cliWallet.publicKey, toPubkey: tester.publicKey, lamports: 0.15 * LAMPORTS_PER_SOL })),
      [cliWallet],
    );
    const ctx2 = await browser.createBrowserContext();
    const p2 = await ctx2.newPage();
    const errs: string[] = [];
    p2.on("pageerror", (e) => errs.push(String((e as Error).message ?? e)));
    await p2.exposeFunction("__signTx", (bytes: number[]) => {
      const tx = Transaction.from(Uint8Array.from(bytes));
      tx.partialSign(tester);
      return [...tx.serialize({ requireAllSignatures: false })];
    });
    await p2.evaluateOnNewDocument(installMainnetModeWallet, tester.publicKey.toBase58(), Array.from(tester.publicKey.toBytes()));
    await p2.goto(APP, { waitUntil: "networkidle2", timeout: 60_000 }).catch(() => {});
    await p2.waitForFunction(() => localStorage.getItem("shadow-atlas:player-key:v1"), { timeout: 30_000 });
    const playerKey = Keypair.fromSecretKey(Uint8Array.from(JSON.parse((await p2.evaluate(() => localStorage.getItem("shadow-atlas:player-key:v1")))!))).publicKey;
    await waitForText(p2, "Select Wallet");
    await clickButton(p2, "Select Wallet");
    await waitForText(p2, "Mainnet Mode Wallet", 10_000);
    await clickButton(p2, "Mainnet Mode Wallet");
    check(await waitForText(p2, "devnet SOL", 15_000), "connected; devnet balance shown");
    await clickButton(p2, "Top up");
    let lamports = 0;
    for (let i = 0; i < 60 && lamports === 0; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      lamports = await baseConnection().getBalance(playerKey, "confirmed").catch(() => 0);
    }
    check(lamports === 0.1 * LAMPORTS_PER_SOL, `top-up reached the player key on devnet (${lamports / LAMPORTS_PER_SOL} SOL)`);
    check(!(await p2.evaluate(() => document.body.innerText)).includes("couldn't"), "no wallet error shown");
    const prompts = await p2.evaluate(() => (window as unknown as { __prompts: number }).__prompts);
    check(prompts === 1, `exactly one wallet prompt for the top-up (${prompts})`);
    check(errs.length === 0, `no page errors${errs.length ? ` → ${errs[0]}` : ""}`);
    await ctx2.close();
  }
  await themeAudit(process.env.SHOTS_DIR ?? "/tmp");
} finally {
  await browser.close();
}
console.log(failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
