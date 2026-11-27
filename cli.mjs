#!/usr/bin/env node
import meow from 'meow';
import { connect, pickPhotos } from './google.mjs';
import { buildMosaic } from './mosaic.mjs';

const cli = meow(
  `
  Usage
    $ pixelate connect                Connect your Google account
    $ pixelate pick                   Pick the photos to build from in Google Photos
    $ pixelate build <target-image>   Build the mosaic

  Options
    --tiles, -t  Folder for the tile photos (default: tiles)
    --cols, -c   Tiles across (default: 80)
    --size, -s   Pixel size of each tile in the output (default: 32)
    --tint       0-1, how much each tile is tinted toward its cell colour (default: 0.2)
    --out, -o    Output file (default: mosaic.jpg)

  Examples
    $ pixelate pick
    $ pixelate build me.jpg --cols 100 --out me-mosaic.jpg
`,
  {
    importMeta: import.meta,
    flags: {
      tiles: { type: 'string', alias: 't', default: 'tiles' },
      cols: { type: 'number', alias: 'c', default: 80 },
      size: { type: 'number', alias: 's', default: 32 },
      tint: { type: 'number', default: 0.2 },
      out: { type: 'string', alias: 'o', default: 'mosaic.jpg' }
    }
  }
);

const [command, target] = cli.input;
const { tiles, cols, size, tint, out } = cli.flags;

try {
  if (command === 'connect') {
    await connect();
    console.error('Connected to Google Photos.');
  } else if (command === 'pick') {
    const count = await pickPhotos(tiles);

    console.error(`${count} photos saved to ${tiles}/. Now run: pixelate build <target-image>`);
  } else if (command === 'build' && target) {
    if (!Number.isInteger(cols) || cols < 1) throw new Error('--cols must be a positive whole number');

    if (!Number.isInteger(size) || size < 1) throw new Error('--size must be a positive whole number');

    if (!(tint >= 0 && tint <= 1)) throw new Error('--tint must be between 0 and 1');

    const r = await buildMosaic({ target, tilesDir: tiles, cols, tileSize: size, tint, out });

    console.error(`${out}: ${r.width}x${r.height}, ${r.cols}x${r.rows} cells, ${r.unique} of ${r.tiles} photos used`);
  } else {
    cli.showHelp();
  }
} catch (e) {
  console.error(`pixelate: ${e.message}`);
  process.exit(1);
}
