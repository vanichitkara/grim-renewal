import { describe, it, expect } from 'vitest';
import { keyForChar, keyForBackspace, isValidEmail, typedFrame, KEY_ROWS } from './email-entry.ts';
import { progressText, doneText } from './potion-loader.ts';

describe('keyForChar', () => {
  it('maps lowercase letters without shift', () => {
    const k = keyForChar('q')!;
    expect(KEY_ROWS[k.row]![k.col]!.id).toBe('q');
    expect(k.shift).toBe(false);
  });
  it('uses shift for capitals and @ + _', () => {
    expect(keyForChar('Q')!.shift).toBe(true);
    const at = keyForChar('@')!;
    expect(KEY_ROWS[at.row]![at.col]!.id).toBe('2');
    expect(at.shift).toBe(true);
    expect(KEY_ROWS[keyForChar('+')!.row]![keyForChar('+')!.col]!.id).toBe('=');
    expect(KEY_ROWS[keyForChar('_')!.row]![keyForChar('_')!.col]!.id).toBe('-');
  });
  it('maps digits, dot and dash; unknown is null', () => {
    expect(keyForChar('7')!.shift).toBe(false);
    expect(keyForChar('.')!.shift).toBe(false);
    expect(keyForChar('-')!.shift).toBe(false);
    expect(keyForChar('é')).toBeNull();
    expect(keyForChar('ab')).toBeNull();
  });
  it('every character of a typical email has a key', () => {
    for (const ch of 'Jane.Doe+news_1@mail-box.com') expect(keyForChar(ch), ch).not.toBeNull();
  });
  it('backspace is a real key', () => {
    const b = keyForBackspace();
    expect(KEY_ROWS[b.row]![b.col]!.id).toBe('bksp');
  });
});

describe('isValidEmail', () => {
  it('accepts normal addresses', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('jane.doe+x@mail.example.com')).toBe(true);
  });
  it('rejects bad ones', () => {
    for (const s of ['', 'a', 'a@b', 'a@b.', '@b.com', 'a b@c.com', 'a@@b.com']) expect(isValidEmail(s), s).toBe(false);
  });
});

describe('typedFrame', () => {
  it('detects add, remove, none', () => {
    expect(typedFrame('ab', 'abc')).toEqual({ kind: 'added', ch: 'c' });
    expect(typedFrame('abc', 'a')).toEqual({ kind: 'removed', count: 2 });
    expect(typedFrame('a', 'a')).toEqual({ kind: 'none' });
  });
});

describe('progress text', () => {
  it('handles unknown, known and done states', () => {
    expect(progressText()).toBe('Brewing...');
    expect(progressText({ read: 0, total: 0 })).toBe('Brewing...');
    expect(progressText({ read: 3, total: 12 })).toBe('Brewing... 3 of 12 receipts read');
    expect(doneText(4)).toBe('4 souls found');
    expect(doneText(1)).toBe('1 soul found');
    expect(doneText(0)).toMatch(/pot is empty/);
  });
});
