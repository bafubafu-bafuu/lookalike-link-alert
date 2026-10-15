import { describe, expect, it, vi } from 'vitest';
import { networkUrl, exactGetRule, escapeRegex } from '../../src/shared/navigation';
import { candidateRules } from '../../src/background/rules';
import { defaults, RULE_IDS } from '../../src/shared/settings';

vi.stubGlobal('chrome', {
  runtime: { getURL: (path: string) => `chrome-extension://fixture/${path}` },
  declarativeNetRequest: {
    RuleActionType: { ALLOW: 'allow', REDIRECT: 'redirect' },
    ResourceType: { MAIN_FRAME: 'main_frame' },
    RequestMethod: { GET: 'get' },
  },
});
describe('navigation rules', () => {
  it('makes exact tab-scoped GET rules without fragment coupling', () => {
    const rule = exactGetRule(100, 5, 'https://example.test/a?q=%23#fragment');
    expect(rule.condition.tabIds).toEqual([5]);
    expect(rule.condition.requestMethods).toEqual(['get']);
    expect(rule.condition.resourceTypes).toEqual(['main_frame']);
    const regex = new RegExp(rule.condition.regexFilter!);
    expect(regex.test('https://example.test/a?q=%23')).toBe(true);
    expect(regex.test('https://example.test/a?q=%23#different')).toBe(true);
    expect(regex.test('https://example.test/a?q=%23&extra=1')).toBe(false);
    expect(regex.test('https://example.test/b?q=%23')).toBe(false);
  });
  it('rejects non-web and credentialed continuation', () => {
    expect(() => networkUrl('javascript:alert(1)')).toThrow();
    expect(() => networkUrl('https://user:password@example.test')).toThrow();
    expect(() => networkUrl('https://user@example.test')).toThrow();
    expect(() => networkUrl('not a URL')).toThrow();
    expect(networkUrl('https://example.test/#abc')).toBe('https://example.test/');
    expect(escapeRegex('[x].*')).toBe('\\[x\\]\\.\\*');
  });
  it('installs only the relevant candidate rules and removes all when disabled', () => {
    const settings = defaults();
    expect(candidateRules(settings)).toHaveLength(2);
    settings.enabled = false;
    expect(candidateRules(settings)).toEqual([]);
    settings.enabled = true;
    for (const id of RULE_IDS) settings.rules[id] = false;
    expect(candidateRules(settings)).toEqual([]);
    settings.rules.userinfo = true;
    expect(candidateRules(settings)).toHaveLength(1);
    settings.rules.japaneseIdn = true;
    expect(candidateRules(settings)).toHaveLength(2);
  });
});
