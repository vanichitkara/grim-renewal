/**
 * Maps a merchant name to its dummy cancel page under public/mock/.
 * Names come from the scout (domain-based, e.g. "Streamflix", "Cloudboxpro")
 * or from demo data ("StreamFlix Premium"), so matching is case-insensitive
 * on letters and digits only, by prefix.
 */

const MOCKS: ReadonlyArray<readonly [prefix: string, path: string]> = [
  ['streamflix', './mock/streamflix/index.html'],
  ['cloudbox', './mock/cloudbox/index.html'],
  ['mealcrate', './mock/mealcrate/index.html'],
  ['designhub', './mock/designhub/index.html'],
  ['ironcore', './mock/ironcoregym/index.html'],
];

export function mockUrlFor(merchantName: string): string | null {
  const key = merchantName.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (key === '') return null;
  return MOCKS.find(([prefix]) => key.startsWith(prefix))?.[1] ?? null;
}

export function isMockMerchant(merchantName: string): boolean {
  return mockUrlFor(merchantName) !== null;
}
