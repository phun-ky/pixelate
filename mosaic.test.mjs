import test from 'node:test';
import assert from 'node:assert/strict';
import { rgbToLab, pickTiles } from './mosaic.mjs';

test('rgbToLab maps white and black to the ends of L', () => {
  const [L, a, b] = rgbToLab([255, 255, 255]);

  assert.ok(Math.abs(L - 100) < 0.1 && Math.abs(a) < 0.1 && Math.abs(b) < 0.1);
  assert.deepEqual(rgbToLab([0, 0, 0]).map(Math.round), [0, 0, 0]);
});

test('pickTiles swaps in a close tile for a neighbour, but never a wrong colour', () => {
  const red = rgbToLab([255, 0, 0]);
  const blue = rgbToLab([0, 0, 255]);
  const tiles = [red, rgbToLab([250, 10, 10]), blue];

  // 2x2 grid, radius 1: cell 1 avoids repeating cell 0; once both reds are neighbours, red beats blue
  assert.deepEqual(pickTiles([red, red, red, red], tiles, 2, 1), [0, 1, 0, 0]);
  assert.deepEqual(pickTiles([red, blue], tiles, 2, 1), [0, 2]);
});
