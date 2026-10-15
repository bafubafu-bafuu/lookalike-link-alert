import { beforeAll, describe, expect, it, vi } from 'vitest';
import { defaults } from '../../src/shared/settings';

beforeAll(() => {
  vi.stubGlobal('chrome', {
    runtime: { getURL: (path: string) => `chrome-extension://extension-id/${path}` },
    declarativeNetRequest: {
      RuleActionType: { REDIRECT: 'redirect' },
      ResourceType: { MAIN_FRAME: 'main_frame' },
      RequestMethod: { GET: 'get' },
    },
  });
});

async function rules(settings = defaults()) {
  const { candidateRules } = await import('../../src/background/rules');
  return candidateRules(settings);
}

describe('candidate rules', () => {
  it('redirects IDN and userinfo GET navigations to the warning page by default', async () => {
    const result = await rules();
    expect(result).toHaveLength(2);
    expect(result.map((rule) => rule.id)).toEqual([1, 2]);
    for (const rule of result) {
      expect(rule.action).toEqual({ type: 'redirect', redirect: { regexSubstitution: 'chrome-extension://extension-id/warning.html#\\0' } });
      expect(rule.condition.resourceTypes).toEqual(['main_frame']);
      expect(rule.condition.requestMethods).toEqual(['get']);
    }
    const [idn, userinfo] = result.map((rule) => new RegExp(rule.condition.regexFilter!));
    expect(idn!.test('https://xn--80ak6aa92e.com/login')).toBe(true);
    expect(idn!.test('https://example.com/?next=xn--80ak6aa92e.com')).toBe(false);
    expect(userinfo!.test('https://bank.example@evil.test/')).toBe(true);
    expect(userinfo!.test('https://evil.test/?user=a@b')).toBe(false);
  });
  it('omits every rule when protection is disabled', async () => {
    expect(await rules({ ...defaults(), enabled: false })).toEqual([]);
  });
  it('keeps only the rules whose checks are still enabled', async () => {
    const settings = defaults();
    for (const id of ['confusable', 'mixedScript', 'invisible', 'japaneseIdn', 'otherIdn', 'lookalike'] as const) settings.rules[id] = false;
    const onlyUserinfo = await rules(settings);
    expect(onlyUserinfo).toHaveLength(1);
    expect(onlyUserinfo[0]!.condition.regexFilter).toContain('@');
    settings.rules.userinfo = false;
    expect(await rules(settings)).toEqual([]);
    settings.rules.lookalike = true;
    const onlyIdn = await rules(settings);
    expect(onlyIdn).toHaveLength(1);
    expect(onlyIdn[0]!.condition.regexFilter).toContain('xn--');
  });
});
