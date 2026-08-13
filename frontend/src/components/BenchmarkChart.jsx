import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

export default function BenchmarkChart({ benchmarkData }) {
  if (!benchmarkData) return null;

  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: `Benchmark: ${benchmarkData.stopsCount} Stops`,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Time (ms)'
        }
      }
    }
  };

  const data = {
    labels: ['Nearest Neighbor + 2-opt', 'Brute Force Exact'],
    datasets: [
      {
        label: 'Execution Time (ms)',
        data: [benchmarkData.approximation.timeMs, benchmarkData.exact.timeMs],
        backgroundColor: [
          'rgba(16, 185, 129, 0.5)', // Green
          'rgba(239, 68, 68, 0.5)',  // Red
        ],
        borderColor: [
          'rgb(16, 185, 129)',
          'rgb(239, 68, 68)',
        ],
        borderWidth: 1,
      },
    ],
  };

  return (
    <div style={{ padding: '20px', backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', marginTop: '20px' }}>
      <Bar options={options} data={data} />
      <div style={{ marginTop: '16px', fontSize: '0.875rem', color: '#475569', display: 'flex', justifyContent: 'space-around' }}>
        <div>
          <strong>Approx Distance:</strong> {benchmarkData.approximation.distance.toFixed(4)}
        </div>
        <div>
          <strong>Exact Distance:</strong> {benchmarkData.exact.distance.toFixed(4)}
        </div>
      </div>
    </div>
  );
}
