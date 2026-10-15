import { describe, expect, it } from 'vitest';
import { SUGGESTED_DOMAINS } from '../../src/shared/suggestions';
import { canonicalHost, defaults, parseSettings } from '../../src/shared/settings';
import { analyze, registrable } from '../../src/core/analyze';

const all = SUGGESTED_DOMAINS.flatMap((group) => group.items);

describe('suggested protected domains', () => {
  it('are unique registrable domains that pass settings validation', () => {
    expect(new Set(all.map((item) => item.host)).size).toBe(all.length);
    for (const item of all) {
      expect(canonicalHost(item.host)).toBe(item.host);
      expect(registrable(item.host)).toBe(item.host);
      expect(item.label.trim()).not.toBe('');
    }
    expect(() => parseSettings({ ...defaults(), protectedDomains: all.map((item) => item.host) })).not.toThrow();
  });
  it('do not warn on their own sites once registered', () => {
    const settings = { ...defaults(), protectedDomains: all.map((item) => item.host) };
    for (const item of all) {
      const result = analyze(`https://www.${item.host}/login`, settings);
      expect(result.warn, item.host).toBe(false);
      expect(result.findings.map((finding) => finding.id), item.host).not.toContain('lookalike');
      expect(result.findings.map((finding) => finding.id), item.host).not.toContain('misleadingSubdomain');
    }
  });
  it('flag a registered brand placed under another domain', () => {
    const settings = { ...defaults(), protectedDomains: ['mufg.jp'] };
    const result = analyze('https://mufg.jp.login-verify.example/', settings);
    expect(result.findings.map((finding) => finding.id)).toContain('misleadingSubdomain');
    expect(result.warn).toBe(true);
  });
});
