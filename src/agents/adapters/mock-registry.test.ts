import { describe, it, expect } from 'vitest';
import { mockUrlFor, isMockMerchant } from './mock-registry.ts';

describe('mock registry', () => {
  it.each([
    ['Streamflix', './mock/streamflix/index.html'],
    ['StreamFlix Premium', './mock/streamflix/index.html'],
    ['Cloudboxpro', './mock/cloudbox/index.html'],
    ['CLOUDBOX Pro', './mock/cloudbox/index.html'],
    ['Mealcrate', './mock/mealcrate/index.html'],
    ['Designhub', './mock/designhub/index.html'],
    ['Ironcoregym', './mock/ironcoregym/index.html'],
    ['IronCore Gym', './mock/ironcoregym/index.html'],
  ])('%s -> %s', (name, url) => {
    expect(mockUrlFor(name)).toBe(url);
  });

  it('returns null for unknown or empty names', () => {
    expect(mockUrlFor('Netflix')).toBeNull();
    expect(mockUrlFor('')).toBeNull();
    expect(mockUrlFor('  ')).toBeNull();
    expect(isMockMerchant('Netflix')).toBe(false);
    expect(isMockMerchant('Mealcrate')).toBe(true);
  });
});
