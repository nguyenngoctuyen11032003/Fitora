import { describe, expect, it } from 'vitest';
import { BANK, formatVnd, vietQrUrl } from './bank';

describe('vietQrUrl', () => {
  it('puts bank, account, amount and memo in the link', () => {
    const u = new URL(vietQrUrl(50000));
    expect(u.pathname).toBe(`/image/MB-${BANK.account}-compact2.png`);
    expect(u.searchParams.get('amount')).toBe('50000');
    expect(u.searchParams.get('addInfo')).toBe('FITORA PRO');
  });
  it('omits a zero amount', () => {
    expect(new URL(vietQrUrl(0)).searchParams.has('amount')).toBe(false);
  });
  it('formats VND', () => {
    expect(formatVnd(50000).replace(/\s/g, '')).toBe('50.000đ');
  });
});
