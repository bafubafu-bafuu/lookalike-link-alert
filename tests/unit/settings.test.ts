import { describe, it, expect } from 'vitest';
import { defaults, parseSettings, importSettings, canonicalHost, isExcepted } from '../../src/shared/settings';

describe('settings validation', () => {
  it('round-trips defaults and careful mode', () => {
    expect(importSettings(JSON.stringify(defaults()))).toEqual(defaults());
    expect(parseSettings(defaults('careful')).warnLevel).toBe(1);
    expect(defaults().rules.japaneseIdn).toBe(false);
  });
  it('canonicalizes IDN hosts, case and trailing dot', () => {
    expect(canonicalHost(' 日本語.jp ')).toBe(new URL('https://日本語.jp').hostname);
    expect(canonicalHost('EXAMPLE.COM.')).toBe('example.com');
    expect(canonicalHost('127.0.0.1')).toBe('127.0.0.1');
  });
  it.each(['', 'https://example.com', 'a@b.test', 'host:443', 'a b', 'a/b', 'a?b', 'a#b', '-a.test', 'a-.test', 'a..test', 'a'.repeat(254), 'a'.repeat(64) + '.test', 'a\\b'])('rejects malformed domain: %s', (value) => {
    expect(() => canonicalHost(value)).toThrow();
  });
  it('deduplicates protected domains', () => {
    expect(parseSettings({ ...defaults(), protectedDomains: ['EXAMPLE.COM', 'example.com'] }).protectedDomains).toEqual(['example.com']);
  });
  it.each(['com', 'co.uk', 'github.io'])('rejects broad public-suffix scopes: %s', (host) => {
    expect(() => canonicalHost(host)).toThrow('公開サフィックス');
  });
  it.each([
    null, [], {}, { ...defaults(), version: 2 }, { ...defaults(), mode: 'unexpected' },
    { ...defaults(), enabled: 'true' }, { ...defaults(), unknown: true },
    { ...defaults(), rules: null }, { ...defaults(), rules: {} },
    { ...defaults(), rules: { ...defaults().rules, confusable: 'yes' } },
    { ...defaults(), protectedDomains: 'example.com' }, { ...defaults(), protectedDomains: [42] },
    { ...defaults(), protectedDomains: Array(101).fill('example.com') },
    { ...defaults(), exceptions: 'example.com' }, { ...defaults(), exceptions: Array(101).fill({ host: 'a.test', subdomains: false }) },
    { ...defaults(), exceptions: [null] }, { ...defaults(), exceptions: [{ host: 'a.test', subdomains: 'true' }] },
    { ...defaults(), exceptions: [{ host: 'a.test', subdomains: false, extra: 1 }] },
    { ...defaults(), warnLevel: 0 }, { ...defaults(), warnLevel: 4 }, { ...defaults(), warnLevel: 1.5 },
    { ...defaults(), maxLabels: 2 }, { ...defaults(), maxLabels: 21 }, { ...defaults(), maxLabels: '5' },
    { ...defaults(), longUrlLength: 255 }, { ...defaults(), longUrlLength: 8193 },
  ])('rejects invalid settings case %#', (value) => {
    expect(() => parseSettings(value)).toThrow();
  });
  it('rejects malformed and oversized JSON', () => {
    expect(() => importSettings('{')).toThrow('JSON');
    expect(() => importSettings('あ'.repeat(40_000))).toThrow('大きすぎ');
  });
  it('limits exceptions to the intended host boundary', () => {
    const settings = defaults();
    settings.exceptions = [{ host: 'example.test', subdomains: false }];
    expect(isExcepted('EXAMPLE.TEST.', settings)).toBe(true);
    expect(isExcepted('sub.example.test', settings)).toBe(false);
    settings.exceptions[0]!.subdomains = true;
    expect(isExcepted('sub.example.test', settings)).toBe(true);
    expect(isExcepted('notexample.test', settings)).toBe(false);
    expect(isExcepted('example.test.attacker.test', settings)).toBe(false);
    expect(parseSettings(settings).exceptions).toEqual(settings.exceptions);
  });
});
