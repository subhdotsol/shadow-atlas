/**
 * Regenerate the raster icons from the vector mark.
 *
 *   bun icons
 *
 * src/app/icon.svg is the source of truth. This renders it with headless Chrome and writes:
 * - src/app/favicon.ico      16, 32 and 48 px PNG frames, for browsers and tools that only ask for /favicon.ico
 * - src/app/apple-icon.png   180 px, full-bleed and opaque (iOS applies its own rounding)
 *
 * Env: CHROME_PATH.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer from "puppeteer-core";

const root = resolve(import.meta.dir, "..");
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const svg = readFileSync(resolve(root, "src/app/icon.svg"), "utf8");

// iOS masks the icon itself, so the Apple variant is a full square on an opaque fill.
const appleSvg = svg
  .replace('<rect x="2" y="2" width="60" height="60" rx="15"/>', '<rect x="0" y="0" width="64" height="64"/>')
  .replace('<rect x="2" y="2" width="30" height="60" fill="#d96014"/>', '<rect x="0" y="0" width="32" height="64" fill="#d96014"/>')
  .replace('<rect x="32" y="2" width="30" height="60" fill="#2c6be7"/>', '<rect x="32" y="0" width="32" height="64" fill="#2c6be7"/>')
  .replace('<rect x="2" y="2" width="60" height="60" fill="url(#sheen)"/>', '<rect x="0" y="0" width="64" height="64" fill="url(#sheen)"/>')
  .replace('r="9"', 'r="8"');

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
async function render(source: string, size: number): Promise<Buffer> {
  const page = await browser.newPage();
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await page.setContent(
    `<html><body style="margin:0;background:transparent"><img style="display:block;width:${size}px;height:${size}px" src="data:image/svg+xml;base64,${Buffer.from(source).toString("base64")}"></body></html>`,
  );
  await page.waitForFunction(() => document.images[0]?.complete);
  const png = Buffer.from(await page.screenshot({ type: "png", omitBackground: true }));
  await page.close();
  return png;
}

/** ICO container holding PNG frames (supported by every current browser and OS). */
function ico(frames: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(frames.length, 4);
  const entries: Buffer[] = [];
  let offset = 6 + 16 * frames.length;
  for (const { size, png } of frames) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...frames.map((f) => f.png)]);
}

try {
  const frames = [];
  for (const size of [16, 32, 48]) frames.push({ size, png: await render(svg, size) });
  writeFileSync(resolve(root, "src/app/favicon.ico"), ico(frames));
  console.log("✓ src/app/favicon.ico (16, 32, 48)");

  writeFileSync(resolve(root, "src/app/apple-icon.png"), await render(appleSvg, 180));
  console.log("✓ src/app/apple-icon.png (180)");
} finally {
  await browser.close();
}
