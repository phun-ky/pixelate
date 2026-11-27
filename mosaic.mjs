import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const IMAGE = /\.(jpe?g|png|webp|avif|tiff?)$/i;

const linear = (c) => {
  const v = c / 255;

  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);

// sRGB (D65) -> CIELAB, so distances match how we see colour
export const rgbToLab = ([r, g, b]) => {
  const [R, G, B] = [linear(r), linear(g), linear(b)];
  const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const y = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);

  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};

// For each cell (Lab, row-major) pick the closest tile; reusing a tile within `radius` cells costs `penalty` ΔE
export const pickTiles = (cells, tiles, cols, radius = 2, penalty = 10) => {
  const picks = [];

  cells.forEach((cell, i) => {
    const x = i % cols;
    const y = Math.floor(i / cols);
    const near = new Set();

    for (let dy = -radius; dy <= 0; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if ((dy < 0 || dx < 0) && y + dy >= 0 && x + dx >= 0 && x + dx < cols) {
          near.add(picks[(y + dy) * cols + x + dx]);
        }
      }
    }

    let best = 0;
    let bestCost = Infinity;

    tiles.forEach((tile, k) => {
      const cost = Math.hypot(tile[0] - cell[0], tile[1] - cell[1], tile[2] - cell[2]) + (near.has(k) ? penalty : 0);

      if (cost < bestCost) {
        bestCost = cost;
        best = k;
      }
    });

    picks.push(best);
  });

  return picks;
};

const average = (buf) => {
  const sum = [0, 0, 0];

  for (let i = 0; i < buf.length; i += 3) {
    sum[0] += buf[i];
    sum[1] += buf[i + 1];
    sum[2] += buf[i + 2];
  }

  return sum.map((s) => s / (buf.length / 3));
};

const raw = (img) => img.rotate().toColourspace('srgb').removeAlpha().raw().toBuffer({ resolveWithObject: true });

export const buildMosaic = async ({ target, tilesDir, cols, tileSize, tint, out }) => {
  const files = (await fs.readdir(tilesDir).catch(() => [])).filter((f) => IMAGE.test(f));

  if (!files.length) throw new Error(`No images in ${tilesDir}. Run "pixelate pick" first.`);

  const loaded = await Promise.allSettled(
    files.map((f) => raw(sharp(path.join(tilesDir, f)).resize(tileSize, tileSize, { fit: 'cover' })))
  );
  const tiles = [];

  loaded.forEach((r, i) => {
    if (r.status === 'fulfilled') tiles.push(r.value.data);
    else console.error(`Skipping ${files[i]}: ${r.reason.message}`);
  });

  if (!tiles.length) throw new Error(`None of the images in ${tilesDir} could be read.`);

  // Shrinking the target to the grid gives one averaged colour per cell
  const { data: grid, info } = await raw(sharp(target).resize(cols, null));
  const rows = info.height;
  const cellRgb = Array.from({ length: cols * rows }, (_, i) => [grid[i * 3], grid[i * 3 + 1], grid[i * 3 + 2]]);
  const picks = pickTiles(cellRgb.map(rgbToLab), tiles.map((t) => rgbToLab(average(t))), cols);

  const width = cols * tileSize;
  const height = rows * tileSize;
  const output = Buffer.alloc(width * height * 3);

  picks.forEach((k, i) => {
    const ox = (i % cols) * tileSize;
    const oy = Math.floor(i / cols) * tileSize;
    const color = cellRgb[i];
    const tile = tiles[k];

    for (let y = 0; y < tileSize; y++) {
      for (let x = 0; x < tileSize; x++) {
        for (let c = 0; c < 3; c++) {
          output[((oy + y) * width + ox + x) * 3 + c] = Math.round(
            tile[(y * tileSize + x) * 3 + c] * (1 - tint) + color[c] * tint
          );
        }
      }
    }
  });

  await sharp(output, { raw: { width, height, channels: 3 } }).jpeg({ quality: 90 }).toFile(out);

  return { cols, rows, tiles: tiles.length, unique: new Set(picks).size, width, height };
};
