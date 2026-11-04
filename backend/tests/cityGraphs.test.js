const { cityGraphs, getCity } = require('../services/cityGraphs');

const CITY_IDS = ['london', 'new_york', 'paris', 'seoul', 'tokyo'];

describe('city graph registry', () => {
  test('loads all five bundled cities', () => {
    expect(Object.keys(cityGraphs).sort()).toEqual(CITY_IDS);
  });

  test('getCity returns the named city', () => {
    expect(getCity('london').name).toBe('London');
  });

  test('getCity defaults to New York when no cityId is given', () => {
    expect(getCity(undefined).name).toBe('New York');
  });

  test.each(['atlantis', 'constructor', '__proto__', 'toString', '', null, 42, {}])(
    'getCity rejects %j',
    (cityId) => expect(getCity(cityId)).toBeUndefined(),
  );
});
