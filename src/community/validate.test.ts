import { describe, expect, it } from 'vitest';
import { parseMerchantKey, parseSubmission } from './validate.ts';

const good = { merchantKey: 'netflix.com', method: 'email', worked: true };

describe('parseSubmission', () => {
  it('accepts the three fields', () => {
    expect(parseSubmission(good)).toEqual({ ok: true, value: good });
  });
  it.each([
    ['extra field', { ...good, note: 'hi' }, 'bad_fields'],
    ['missing field', { merchantKey: 'netflix.com', method: 'email' }, 'bad_fields'],
    ['array', [good], 'bad_body'],
    ['null', null, 'bad_body'],
    ['unknown method', { ...good, method: 'fax' }, 'bad_method'],
    ['worked as string', { ...good, worked: 'yes' }, 'bad_worked'],
    ['email as key', { ...good, merchantKey: 'a@netflix.com' }, 'bad_merchant'],
    ['slash in key', { ...good, merchantKey: 'netflix.com/x' }, 'bad_merchant'],
    ['space in key', { ...good, merchantKey: 'net flix.com' }, 'bad_merchant'],
    ['upper case key', { ...good, merchantKey: 'Netflix.com' }, 'bad_merchant'],
    ['long key', { ...good, merchantKey: `${'a'.repeat(100)}.com` }, 'bad_merchant'],
    ['no dot', { ...good, merchantKey: 'netflix' }, 'bad_merchant'],
  ])('rejects %s', (_n, body, error) => {
    expect(parseSubmission(body)).toEqual({ ok: false, error });
  });
  it('merchant query uses the same rules', () => {
    expect(parseMerchantKey('netflix.com').ok).toBe(true);
    expect(parseMerchantKey(null).ok).toBe(false);
    expect(parseMerchantKey('x'.repeat(101)).ok).toBe(false);
  });
});
