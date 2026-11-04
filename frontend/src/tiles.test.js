import { describe, expect, test } from 'vitest';
import { TILE_URL, TILE_ATTRIBUTION } from './tiles';

// Unit checks only: no network. Real tile availability is checked by `npm run check:tiles`.
describe('map tile configuration', () => {
  test('uses the keyless OpenStreetMap tile server over HTTPS', () => {
    expect(TILE_URL).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
  });

  test('credits OpenStreetMap contributors with a link to the copyright page', () => {
    expect(TILE_ATTRIBUTION).toContain('OpenStreetMap');
    expect(TILE_ATTRIBUTION).toContain('href="https://www.openstreetmap.org/copyright"');
  });
});
