#!/usr/bin/env node
/**
 * generate-assets.mjs
 *
 * Generates the Companion Life icon set and companion creature PNGs from the
 * source artwork in assets/source/ using sharp (dev dependency):
 *
 *   npm run assets        (or: node scripts/generate-assets.mjs)
 *
 * Sources:
 *   assets/source/logo.png             the app logo (black disc + white creature)
 *   assets/source/companion/*.svg      companion stage art (hatchling / growing / thriving)
 *
 * Outputs (all relative to mobile/):
 *   assets/images/icon.png                      1024  app icon (logo as-is)
 *   assets/images/android-icon-foreground.png   1024  adaptive foreground (keyed, safe zone)
 *   assets/images/android-icon-background.png   1024  adaptive background (solid white)
 *   assets/images/android-icon-monochrome.png   1024  adaptive monochrome (creature silhouette)
 *   assets/images/splash-icon.png                512  splash glyph (logo)
 *   assets/images/favicon.png                    48   web favicon
 *   assets/images/notification-icon.png          96   Android notification glyph (white)
 *   assets/images/companion/hatchling.png        512  stage art PNGs (transparent bg)
 *   assets/images/companion/growing.png          512
 *   assets/images/companion/thriving.png         512
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'assets', 'source');
const OUT = join(ROOT, 'assets', 'images');
const COMPANION_OUT = join(OUT, 'companion');

mkdirSync(OUT, { recursive: true });
mkdirSync(COMPANION_OUT, { recursive: true });

const logo = join(SRC, 'logo.png');

/** Pixels at least this bright count as canvas-white for keying and flood fill. */
const WHITE = 235;

/**
 * Load the logo as raw RGBA and flood-fill from the border through white
 * pixels, marking the white canvas (`visited[p] === 1`). The creature sits
 * inside the black disc, so its white pixels are unreachable from the border
 * and stay unmarked. Returns the raw data plus the canvas mask.
 */
async function analyzeLogo() {
  const { data, info } = await sharp(logo)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;
  const at = (x, y) => (y * w + x) * 4;
  const isWhiteish = (x, y) => {
    const i = at(x, y);
    return data[i + 3] > 128 && data[i] > WHITE && data[i + 1] > WHITE && data[i + 2] > WHITE;
  };

  const visited = new Uint8Array(w * h);
  const queue = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (visited[p] || !isWhiteish(x, y)) return;
    visited[p] = 1;
    queue.push(p);
  };
  for (let x = 0; x < w; x += 1) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y += 1) {
    push(0, y);
    push(w - 1, y);
  }
  while (queue.length > 0) {
    const p = queue.pop();
    const x = p % w;
    const y = Math.floor(p / w);
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  return { data, w, h, channels, at, visited };
}

/**
 * Adaptive foreground: a self-contained "black disc + white creature" on a
 * transparent canvas (only the white canvas is keyed away; the creature and
 * disc stay opaque), so it renders correctly over any background layer.
 */
async function keyedForeground() {
  const { data, w, h, channels, at, visited } = await analyzeLogo();
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (visited[y * w + x]) data[at(x, y) + 3] = 0;
    }
  }
  return sharp(data, { raw: { width: w, height: h, channels } })
    .png()
    .toBuffer();
}

/**
 * The creature silhouette: white pixels NOT connected to the image border
 * (the white canvas) — used for the monochrome and notification glyphs.
 */
async function creatureSilhouette() {
  const { data, w, h, channels, at, visited } = await analyzeLogo();
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = at(x, y);
      const isCreature = !visited[y * w + x] && data[i + 3] > 128 && data[i] > WHITE && data[i + 1] > WHITE && data[i + 2] > WHITE;
      if (isCreature) {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = 255;
      } else {
        data[i + 3] = 0;
      }
    }
  }
  return sharp(data, { raw: { width: w, height: h, channels } })
    .png()
    .toBuffer();
}

/** Composite `art` (already `size`×`size`) centered on a `target` transparent canvas. */
function centered(art, target, size) {
  const pad = Math.round((target - size) / 2);
  return sharp({
    create: { width: target, height: target, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: art, top: pad, left: pad }])
    .png()
    .toBuffer();
}

async function main() {
  // App logo — used as-is (its white canvas blends with the white splash).
  await sharp(logo).resize(1024, 1024).png().toFile(join(OUT, 'icon.png'));
  await sharp(logo).resize(512, 512).png().toFile(join(OUT, 'splash-icon.png'));
  await sharp(logo).resize(48, 48).png().toFile(join(OUT, 'favicon.png'));
  console.log('wrote icon.png, splash-icon.png, favicon.png');

  // Android adaptive icon: white background + keyed disc in the safe zone.
  const keyed = await keyedForeground();
  const disc = await sharp(keyed)
    .trim()
    .raw()
    .toBuffer({ resolveWithObject: true });
  console.log(`logo disc: ${disc.info.width}x${disc.info.height} px (scaled to safe zone)`);
  const fgSize = Math.round(1024 * 0.62);
  const fgArt = await sharp(disc.data, {
    raw: { width: disc.info.width, height: disc.info.height, channels: 4 },
  })
    .resize(fgSize, fgSize, { fit: 'contain' })
    .png()
    .toBuffer();
  writeFileSync(join(OUT, 'android-icon-foreground.png'), await centered(fgArt, 1024, fgSize));
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#ffffff' } })
    .png()
    .toFile(join(OUT, 'android-icon-background.png'));
  console.log(`wrote android-icon-foreground.png (${fgSize}px art), android-icon-background.png`);

  // Monochrome + notification glyph from the creature silhouette.
  const silhouette = await creatureSilhouette();
  const sil = await sharp(silhouette)
    .trim()
    .raw()
    .toBuffer({ resolveWithObject: true });
  console.log(`creature silhouette: ${sil.info.width}x${sil.info.height} px`);
  const monoSize = Math.round(1024 * 0.6);
  const monoArt = await sharp(sil.data, {
    raw: { width: sil.info.width, height: sil.info.height, channels: 4 },
  })
    .resize(monoSize, monoSize, { fit: 'contain' })
    .png()
    .toBuffer();
  writeFileSync(join(OUT, 'android-icon-monochrome.png'), await centered(monoArt, 1024, monoSize));
  const notif = await sharp(sil.data, {
    raw: { width: sil.info.width, height: sil.info.height, channels: 4 },
  })
    .resize(84, 84, { fit: 'contain' })
    .extend({
      top: 6,
      right: 6,
      bottom: 6,
      left: 6,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  writeFileSync(join(OUT, 'notification-icon.png'), notif);
  console.log('wrote android-icon-monochrome.png, notification-icon.png');

  // Companion stage PNGs (transparent backgrounds from the SVGs).
  for (const stage of ['hatchling', 'growing', 'thriving']) {
    const svg = join(SRC, 'companion', `${stage}.svg`);
    const out = join(COMPANION_OUT, `${stage}.png`);
    await sharp(svg)
      .resize(512, 512, { fit: 'contain' })
      .png()
      .toFile(out);
    console.log(`wrote companion/${stage}.png`);
  }
  console.log('Asset set generated.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
