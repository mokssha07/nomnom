/**
 * One-off: turns the raw 2048px dish photos into web-sized WebP.
 *
 * The originals are ~700 KB each — 11 MB for sixteen dishes, on a menu a
 * student opens on campus wifi while standing in a queue. The cards never
 * render them above 340px, so anything past 680px (2x for retina) is bytes
 * nobody sees.
 *
 * Run with `npm run photos` after dropping new files in src/assets/raw/.
 * Output goes to src/assets/food/<id>-<slug>.webp, where <id> matches the
 * menu item id in src/api/mock.js — that naming is what lets the menu resolve
 * a photo with one glob instead of a hand-maintained lookup table.
 */

import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const RAW = 'src/assets/raw';
const OUT = 'src/assets/food';
const SIZE = 680;

// Maps a fragment of the incoming filename to its menu item. Matching on a
// fragment rather than the whole name means the photo tool's timestamp suffix
// doesn't matter.
const DISHES = [
  [1, 'masala-dosa', 'masala_dosa'],
  [2, 'idli-sambar', 'idli_sambar'],
  [3, 'medu-vada', 'medu_vada'],
  [4, 'poha', 'poha'],
  [10, 'veg-thali', 'veg_thali'],
  [11, 'rajma-chawal', 'rajma_chawal'],
  [12, 'chole-bhature', 'chole_bhature'],
  [13, 'paneer-butter-masala', 'paneer'],
  [20, 'veg-sandwich', 'sandwich'],
  [21, 'samosa', 'samosa'],
  [22, 'pav-bhaji', 'pav_bhaji'],
  [23, 'maggi', 'maggi'],
  [30, 'masala-chai', 'masala_chai'],
  [31, 'filter-coffee', 'filter_coffee'],
  [32, 'fresh-lime-soda', 'lime_soda'],
  [33, 'cold-coffee', 'cold_coffee'],
];

const files = await readdir(RAW);
await mkdir(OUT, { recursive: true });

const missing = [];

for (const [id, slug, match] of DISHES) {
  const file = files.find((f) => f.toLowerCase().includes(match));
  if (!file) {
    missing.push(`${id} ${slug}`);
    continue;
  }

  const to = path.join(OUT, `${id}-${slug}.webp`);
  await sharp(path.join(RAW, file))
    // The photos are already square and centred, so cover() is a no-op that
    // also protects us if a future one isn't.
    .resize(SIZE, SIZE, { fit: 'cover' })
    .webp({ quality: 78 })
    .toFile(to);

  console.log(`${file}  →  ${path.basename(to)}`);
}

if (missing.length) console.log(`\nNo photo for: ${missing.join(', ')}`);
