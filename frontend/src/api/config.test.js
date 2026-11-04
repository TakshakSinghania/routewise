import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { DEFAULT_API_URL } from './client';

// Reads KEY=value from an env example file, relative to this test file.
const envValue = (file, key) =>
  readFileSync(new URL(file, import.meta.url), 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1].trim();

describe('API URL configuration', () => {
  test('frontend/.env.example points at the same API URL the client uses by default (with /api)', () => {
    expect(envValue('../../.env.example', 'VITE_API_URL')).toBe(DEFAULT_API_URL);
  });

  test('the default API URL uses the backend default port', () => {
    expect(new URL(DEFAULT_API_URL).port).toBe(envValue('../../../backend/.env.example', 'PORT'));
  });
});
