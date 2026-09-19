/**
 * Generate all NutriSLM logo assets from the uploaded brand logo.
 *  - public/images/nutrislm-logo.png            (full logo, original)
 *  - public/images/nutrislm-logo-mark.png       (emblem crop, background removed via border flood-fill)
 *  - public/images/nutrislm-logo-mark-white.png (emblem crop on white)
 *  - public/icons/icon-192.png / icon-512.png / icon-maskable-512.png / apple-touch-icon.png
 * Run: node scripts/gen-logo.js
 */
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const SRC = "/home/z/my-project/upload/ChatGPT Image Sep 18, 2026, 04_11_19 PM.png";
const PUB = "/home/z/my-project/public";

async function rawRgba(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

/** Flood-fill near-white pixels connected to the border → transparent. */
function removeBackground(data, w, h, thr = 242) {
  const isBgWhite = (i) => {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    return r >= thr && g >= thr && b >= thr;
  };
  const bg = new Uint8Array(w * h);
  const queue = [];
  for (let x = 0; x < w; x++) { queue.push(x); queue.push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { queue.push(y * w); queue.push(y * w + w - 1); }
  while (queue.length) {
    const p = queue.pop();
    if (bg[p] || !isBgWhite(p)) continue;
    bg[p] = 1;
    const x = p % w, y = (p / w) | 0;
    if (x > 0) queue.push(p - 1);
    if (x < w - 1) queue.push(p + 1);
    if (y > 0) queue.push(p - w);
    if (y < h - 1) queue.push(p + w);
  }
  // apply alpha + 1px feather (non-bg pixels touching bg get partial alpha)
  for (let p = 0; p < w * h; p++) {
    if (bg[p]) { data[p * 4 + 3] = 0; continue; }
    const x = p % w, y = (p / w) | 0;
    let touches = false;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h && bg[ny * w + nx]) { touches = true; break; }
    }
    if (touches) data[p * 4 + 3] = 140;
  }
  return bg;
}

/** Bounding box of non-background pixels. */
function bbox(bg, w, h) {
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!bg[y * w + x]) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY };
}

async function emblemCrop() {
  // The wordmark occupies the bottom of the image — find it by scanning row darkness.
  const { data, w, h } = await rawRgba(SRC);
  // Row occupancy (non-near-white count) to find the gap between emblem and text
  const rows = [];
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (!(r >= 242 && g >= 242 && b >= 242)) n++;
    }
    rows.push(n);
  }
  // find last fully-empty row band before the text block (scan from 45% down)
  let emblemBottom = h;
  let inGap = false;
  for (let y = Math.floor(h * 0.45); y < h; y++) {
    if (rows[y] < 12) { if (!inGap) { inGap = true; emblemBottom = y; } }
    else if (inGap) { break; } // text block started
  }
  // bbox of emblem region only (y < emblemBottom)
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < emblemBottom; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (!(r >= 242 && g >= 242 && b >= 242)) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  const pad = Math.round((maxX - minX) * 0.015);
  const left = Math.max(0, minX - pad), top = Math.max(0, minY - pad);
  const cw = Math.min(w, maxX + pad) - left, ch = Math.min(emblemBottom + pad, h) - top;
  const size = Math.max(cw, ch); // square
  const cx = left + Math.round(cw / 2), cy = top + Math.round(ch / 2);
  const sq = { left: Math.max(0, cx - Math.round(size / 2)), top: Math.max(0, cy - Math.round(size / 2)), size: Math.min(size, w, h) };
  console.log("emblem square:", JSON.stringify(sq));
  return sq;
}

async function main() {
  // 1. full logo copy
  fs.copyFileSync(SRC, path.join(PUB, "images/nutrislm-logo.png"));

  // 2. emblem square
  const sq = await emblemCrop();

  // 3. white-bg emblem (for icons + fallback)
  const whiteMark = await sharp(SRC)
    .extract({ left: sq.left, top: sq.top, width: sq.size, height: sq.size })
    .resize(760, 760, { fit: "contain", background: "#ffffff" })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(PUB, "images/nutrislm-logo-mark-white.png"), whiteMark);

  // 4. transparent emblem (flood-fill bg removal on the crop)
  const cropped = await sharp(SRC)
    .extract({ left: sq.left, top: sq.top, width: sq.size, height: sq.size })
    .resize(760, 760, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data, width, height } = { data: cropped.data, width: cropped.info.width, height: cropped.info.height };
  removeBackground(data, width, height);
  const transparent = await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
  fs.writeFileSync(path.join(PUB, "images/nutrislm-logo-mark.png"), transparent);
  console.log("marks written");

  // 5. icons (white background, emblem ~84% for regular, ~62% for maskable safe zone)
  const mk = async (size, ratio) =>
    sharp(SRC)
      .extract({ left: sq.left, top: sq.top, width: sq.size, height: sq.size })
      .resize(Math.round(size * ratio), Math.round(size * ratio), { fit: "contain", background: "#ffffff" })
      .extend({ top: Math.round((size - size * ratio) / 2), bottom: Math.round((size - size * ratio) / 2), left: Math.round((size - size * ratio) / 2), right: Math.round((size - size * ratio) / 2), background: "#ffffff" })
      .resize(size, size)
      .png()
      .toBuffer();

  fs.writeFileSync(path.join(PUB, "icons/icon-512.png"), await mk(512, 0.84));
  fs.writeFileSync(path.join(PUB, "icons/icon-192.png"), await mk(192, 0.84));
  fs.writeFileSync(path.join(PUB, "icons/apple-touch-icon.png"), await mk(180, 0.84));
  fs.writeFileSync(path.join(PUB, "icons/icon-maskable-512.png"), await mk(512, 0.62));
  console.log("icons written");
}

main().catch((e) => { console.error(e); process.exit(1); });
