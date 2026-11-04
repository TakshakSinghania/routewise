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

// Independent check of the routable set: from any routable node, a forward search must reach
// every routable node and a backward search must too; the nodes reached both ways are exactly it.
describe.each(CITY_IDS)('%s routable stops', (cityId) => {
  const { graph, routableNodes } = cityGraphs[cityId];

  function reachable(startId, neighbors) {
    const seen = new Set([startId]);
    const stack = [startId];
    while (stack.length > 0) {
      for (const next of neighbors(stack.pop())) {
        if (!seen.has(next)) { seen.add(next); stack.push(next); }
      }
    }
    return seen;
  }

  test('every routable node can reach, and be reached from, every other one', () => {
    expect(routableNodes.length).toBeGreaterThan(0);
    const reverse = new Map(graph.getAllNodes().map(n => [n.id, []]));
    for (const n of graph.getAllNodes()) {
      for (const e of graph.getNeighbors(n.id)) reverse.get(e.node).push(n.id);
    }
    const start = routableNodes[0].id;
    const forward = reachable(start, id => graph.getNeighbors(id).map(e => e.node));
    const backward = reachable(start, id => reverse.get(id));
    const both = [...forward].filter(id => backward.has(id)).sort();

    expect(routableNodes.map(n => n.id).sort()).toEqual(both);
  });

  test('the full graph is kept for routing and display', () => {
    expect(graph.getAllNodes().length).toBeGreaterThanOrEqual(routableNodes.length);
  });
});
