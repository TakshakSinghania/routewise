import { describe, expect, test } from 'vitest';
import { renderToString } from 'react-dom/server';
import BenchmarkChart from './BenchmarkChart';

// Real POST /api/benchmark response for 4 New York stops, captured from the local backend.
const benchmarkResponse = {
  stopsCount: 4,
  approximation: { timeMs: 0.171125, distance: 2518.378029936089 },
  exact: { timeMs: 0.066625, distance: 2518.378029936089 },
};

describe('BenchmarkChart', () => {
  test('renders the chart from the `data` prop that App.jsx passes', () => {
    const html = renderToString(<BenchmarkChart data={benchmarkResponse} />);

    expect(html).toContain('<canvas');
    expect(html).toContain('Approx Distance');
    expect(html).toContain('Exact Distance');
    expect(html).toContain(benchmarkResponse.exact.distance.toFixed(4));
  });
});
