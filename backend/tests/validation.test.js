const { isLatLng, stopsError } = require('../validation');

describe('isLatLng', () => {
  test.each([
    [{ lat: 40.7, lng: -74 }],
    [{ lat: 0, lng: 0 }],
    [{ lat: -90, lng: 180 }],
  ])('accepts %j', (p) => expect(isLatLng(p)).toBe(true));

  test.each([
    [undefined], [null], [42], ['40.7,-74'], [[40.7, -74]],
    [{ lat: '40.7', lng: '-74' }],
    [{ lat: 40.7 }],
    [{ lat: NaN, lng: 0 }],
    [{ lat: Infinity, lng: 0 }],
    [{ lat: 90.1, lng: 0 }],
    [{ lat: 0, lng: -180.1 }],
  ])('rejects %j', (p) => expect(isLatLng(p)).toBe(false));
});

describe('stopsError', () => {
  const p = { lat: 40.7, lng: -74 };

  test('returns null for a valid list within the limits', () => {
    expect(stopsError([p, p], 2, 25)).toBeNull();
    expect(stopsError(Array(25).fill(p), 2, 25)).toBeNull();
  });

  test('rejects non-arrays', () => {
    expect(stopsError('abc', 2, 25)).toMatch(/array/);
    expect(stopsError(undefined, 2, 25)).toMatch(/array/);
    expect(stopsError({ length: 3 }, 2, 25)).toMatch(/array/);
  });

  test('rejects too few or too many stops', () => {
    expect(stopsError([p], 2, 25)).toMatch(/Between 2 and 25/);
    expect(stopsError(Array(26).fill(p), 2, 25)).toMatch(/Between 2 and 25/);
  });

  test('names the first invalid stop', () => {
    expect(stopsError([p, { lat: 'x' }, p], 2, 25)).toMatch(/Stop 1/);
  });
});
