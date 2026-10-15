import { describe, expect, it } from 'vitest';
import {
  admitPending, findPending, isBypass, isPending, nextBypassId, prunePending, splitBypasses,
  FIRST_BYPASS_ID, MAX_PENDING, type Bypass, type Pending,
} from '../../src/background/state';

const now = 1_000_000;
function entry(overrides: Partial<Pending> = {}): Pending {
  return {
    token: 'token', tabId: 1, url: 'https://example.test/', text: '', rawHref: '', expires: now + 1000,
    source: 'link', opened: false, ...overrides,
  };
}
function bypass(overrides: Partial<Bypass> = {}): Bypass {
  return { id: FIRST_BYPASS_ID, tabId: 1, url: 'https://example.test/', expires: now + 1000, ...overrides };
}

describe('session record validation', () => {
  it('accepts complete records and rejects malformed ones', () => {
    expect(isPending(entry())).toBe(true);
    expect(isPending(entry({ source: 'dnr' }))).toBe(true);
    expect(isPending({ ...entry(), source: 'other' })).toBe(false);
    expect(isPending({ ...entry(), opened: 'yes' })).toBe(false);
    expect(isPending({ ...entry(), tabId: '1' })).toBe(false);
    expect(isPending(null)).toBe(false);
    expect(isPending([])).toBe(false);
    expect(isBypass(bypass())).toBe(true);
    expect(isBypass({ ...bypass(), id: undefined })).toBe(false);
    expect(isBypass('bypass')).toBe(false);
  });
});

describe('pending reviews', () => {
  it('drops expired entries and entries for a closed tab', () => {
    const entries = [entry({ token: 'a' }), entry({ token: 'b', expires: now }), entry({ token: 'c', tabId: 2 })];
    expect(prunePending(entries, now).map((item) => item.token)).toEqual(['a', 'c']);
    expect(prunePending(entries, now, 2).map((item) => item.token)).toEqual(['a']);
  });
  it('matches tokens only within the same tab and before expiry', () => {
    const entries = [entry({ token: 'a', tabId: 1 }), entry({ token: 'b', tabId: 2, expires: now })];
    expect(findPending(entries, 'a', 1, now)?.token).toBe('a');
    expect(findPending(entries, 'a', 2, now)).toBeUndefined();
    expect(findPending(entries, 'b', 2, now)).toBeUndefined();
  });
  it('evicts the oldest entries instead of refusing new reviews when full', () => {
    const full = Array.from({ length: MAX_PENDING }, (_, index) => entry({ token: `t${index}`, expires: now + index }));
    const admitted = admitPending(full, entry({ token: 'new' }));
    expect(admitted).toHaveLength(MAX_PENDING);
    expect(admitted.at(-1)?.token).toBe('new');
    expect(admitted.some((item) => item.token === 't0')).toBe(false);
    expect(admitted.some((item) => item.token === 't1')).toBe(true);
    expect(admitPending([], entry({ token: 'only' }), 1).map((item) => item.token)).toEqual(['only']);
    expect(admitPending([entry({ token: 'old' })], entry({ token: 'new' }), 1).map((item) => item.token)).toEqual(['new']);
  });
});

describe('temporary bypasses', () => {
  it('separates expired and tab-scoped rules from the ones to keep', () => {
    const entries = [bypass({ id: 1 }), bypass({ id: 2, expires: now }), bypass({ id: 3, tabId: 2 })];
    const all = splitBypasses(entries, now);
    expect(all.keep.map((item) => item.id)).toEqual([1, 3]);
    expect(all.removed.map((item) => item.id)).toEqual([2]);
    const tab = splitBypasses(entries, now, 2);
    expect(tab.keep.map((item) => item.id)).toEqual([1]);
    expect(tab.removed.map((item) => item.id)).toEqual([2, 3]);
  });
  it('allocates session rule IDs above the dynamic rule range and existing rules', () => {
    expect(nextBypassId([])).toBe(FIRST_BYPASS_ID);
    expect(nextBypassId([bypass({ id: FIRST_BYPASS_ID }), bypass({ id: FIRST_BYPASS_ID + 5 })])).toBe(FIRST_BYPASS_ID + 6);
  });
});
