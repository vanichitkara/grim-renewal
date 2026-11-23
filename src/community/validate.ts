/** Input checks for the shared payload. Pure. Accepts exactly three fields and nothing else. */
import { MAX_KEY_LENGTH } from './merchant-key.ts';
import { METHODS, type MethodKind, type Submission } from './types.ts';

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const KEY = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export function parseMerchantKey(v: unknown): ParseResult<string> {
  if (typeof v !== 'string') return { ok: false, error: 'bad_merchant' };
  if (v.length === 0 || v.length > MAX_KEY_LENGTH || !KEY.test(v)) return { ok: false, error: 'bad_merchant' };
  return { ok: true, value: v };
}

export function parseSubmission(body: unknown): ParseResult<Submission> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'bad_body' };
  const o = body as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length !== 3 || !['merchantKey', 'method', 'worked'].every((k) => keys.includes(k))) {
    return { ok: false, error: 'bad_fields' };
  }
  const key = parseMerchantKey(o['merchantKey']);
  if (!key.ok) return key;
  if (typeof o['method'] !== 'string' || !(METHODS as readonly string[]).includes(o['method'])) {
    return { ok: false, error: 'bad_method' };
  }
  if (typeof o['worked'] !== 'boolean') return { ok: false, error: 'bad_worked' };
  return { ok: true, value: { merchantKey: key.value, method: o['method'] as MethodKind, worked: o['worked'] } };
}
