import { describe, it, expect } from 'vitest';
import { cancelMethodLabel } from './approval-dialog.ts';

describe('cancelMethodLabel', () => {
  it('phoneOnly wins even when a cancelUrl exists', () => {
    expect(cancelMethodLabel({ phoneOnly: true, cancelUrl: 'https://x.test' }))
      .toBe('Boss Door: phone call plan');
  });
  it('cancelUrl means browser', () => {
    expect(cancelMethodLabel({ phoneOnly: false, cancelUrl: 'https://x.test' }))
      .toBe('Browser, you approve each step');
  });
  it('neither means guided plan', () => {
    expect(cancelMethodLabel({ phoneOnly: false, cancelUrl: null }))
      .toBe('Not automatable, guided plan');
  });
});
