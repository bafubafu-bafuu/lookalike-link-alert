import { describe, expect, it } from 'vitest';
import { analyze, redactUrl, registrable, skeleton } from '../../src/core/analyze';
import { defaults } from '../../src/shared/settings';

const ids = (url: string, text?: string) => analyze(url, defaults(), text).findings.map((item) => item.id);

describe('local URL analysis', () => {
  it.each([
    'https://example.com/',
    'https://example.co.jp/日本語?q=こんにちは',
    'https://日本語.jp/',
    'https://ひらがなカタカナ漢字.jp/',
    'https://my日本語.jp/',
  ])('does not warn solely for a normal URL: %s', (url) => {
    const result = analyze(url, defaults());
    expect(result.status).toBe('checked');
    expect(result.warn).toBe(false);
    expect(result.findings).toEqual([]);
  });
  it('compares Unicode and Punycode identically', () => {
    const url = new URL('https://раураl.test/');
    expect(analyze(url.href, defaults())).toEqual(analyze('https://раураl.test/', defaults()));
    expect(ids(url.href)).toContain('mixedScript');
    expect(ids(url.href)).toContain('confusable');
  });
  it('detects whole-script confusables without a Latin character in the label', () => {
    expect(ids('https://аррӏе.test')).toContain('confusable');
  });
  it('does not exempt Japanese from other suspicious scripts', () => {
    const result = analyze('https://日本ра.test/', defaults());
    expect(result.warn).toBe(true);
    expect(result.findings.map((item) => item.id)).toContain('mixedScript');
  });
  it('can warn on Japanese IDN independently', () => {
    const settings = defaults('careful');
    expect(analyze('https://日本語.jp', settings).warn).toBe(true);
    expect(analyze('https://日本語.jp', settings).findings[0]?.id).toBe('japaneseIdn');
    const normal = defaults(); normal.rules.japaneseIdn = true;
    expect(analyze('https://日本語.jp', normal).warn).toBe(true);
  });
  it('keeps raw href controls even when URL normalization removes them', () => {
    const raw = 'https://exa\u200bmple.test/';
    const normalized = new URL(raw).href;
    const result = analyze(normalized, defaults(), '移動', raw);
    expect(result.findings.map((item) => item.id)).toContain('invisible');
    expect(analyze('https://example.test', defaults(), '', 'a'.repeat(8193)).status).toBe('uninspected');
  });
  it('normalizes with NFD and the complete pinned confusables table', () => {
    expect(skeleton('раураl')).toBe(skeleton('paypal'));
    expect(skeleton('é')).toBe(skeleton('e\u0301'));
    expect(skeleton('m')).toBe('rn');
  });
  it.each(['https://example.test/a%E2%80%AEtxt', 'https://example.test/a\u200b', 'https://example.test/a%CD%8F'])('finds control characters: %s', (url) => {
    expect(ids(url)).toContain('invisible');
  });
  it('checks display direction controls and tolerates malformed percent encoding', () => {
    expect(ids('https://example.test', 'text\u202etest')).toContain('invisible');
    expect(ids('https://example.test/%XX')).not.toContain('invisible');
  });
  it('does not expose credentials in findings, display URL, or serialized results', () => {
    const result = analyze('https://name:private-password@example.test/', defaults());
    expect(result.warn).toBe(true);
    expect(result.url).toBe('https://REDACTED@example.test/');
    expect(JSON.stringify(result)).not.toContain('private-password');
    expect(redactUrl('not a url')).toBe('（表示できない URL）');
  });
  it('uses registrable boundaries including PSL private suffixes', () => {
    expect(registrable('a.b.example.co.uk')).toBe('example.co.uk');
    expect(registrable('one.github.io')).toBe('one.github.io');
    expect(registrable('127.0.0.1')).toBe('127.0.0.1');
    expect(registrable('localhost')).toBe('localhost');
  });
  it('finds a protected name in an attacker-controlled subdomain, not an official one', () => {
    const settings = defaults(); settings.protectedDomains = ['example.com'];
    expect(analyze('https://example.com.attacker.test/', settings).findings.map((item) => item.id)).toContain('misleadingSubdomain');
    expect(analyze('https://example.com-login.test/', settings).warn).toBe(true);
    expect(analyze('https://login.example.com/', settings).warn).toBe(false);
  });
  it('compares protected lookalikes and exact skeletons', () => {
    const settings = defaults(); settings.protectedDomains = ['paypal.test'];
    for (const host of ['раураl.test', 'paypa1.test', 'payapl.test', 'paypaal.test', 'paypl.test']) {
      expect(analyze(`https://${host}`, settings).findings.map((item) => item.id), host).toContain('lookalike');
    }
    for (const host of ['different.test', 'pypypl.test', 'paaypall.test', 'test.test', 'paypal.test']) {
      expect(analyze(`https://${host}`, settings).findings.map((item) => item.id), host).not.toContain('lookalike');
    }
  });
  it('does not compare short generic names by edit distance', () => {
    const settings = defaults(); settings.protectedDomains = ['cat.test'];
    expect(analyze('https://bat.test', settings).findings.map((item) => item.id)).not.toContain('lookalike');
  });
  it('explains protected names in query/path without strong warning', () => {
    const settings = defaults(); settings.protectedDomains = ['example.com'];
    const result = analyze('https://search.test/?q=example.com', settings);
    expect(result.findings.map((item) => item.id)).toContain('embeddedDomain');
    expect(result.warn).toBe(false);
  });
  it('compares URL-shaped link text only, with domain boundaries', () => {
    expect(ids('https://evil.test/', 'https://trusted.test/')).toContain('displayMismatch');
    expect(ids('https://evil.test/', 'www.trusted.test')).toContain('displayMismatch');
    expect(ids('https://login.trusted.test/', 'https://trusted.test/')).not.toContain('displayMismatch');
    expect(ids('https://evil.test/', 'サイトへ移動')).not.toContain('displayMismatch');
    expect(ids('https://evil.test/', 'https://%')).not.toContain('displayMismatch');
    expect(ids('https://evil.test/', 'https://x.test/' + 'a'.repeat(8200))).not.toContain('displayMismatch');
  });
  it.each([
    'http://127.0.0.1:8080/', 'http://[::1]:8080/', 'http://localhost/', 'http://app.localhost/', 'http://2130706433/',
  ])('treats IP and local host as informational: %s', (url) => {
    const result = analyze(url, defaults());
    expect(result.findings.map((item) => item.id)).toContain('ip');
    expect(result.warn).toBe(false);
  });
  it('keeps weak features informational in normal mode and warns in careful mode', () => {
    const url = 'http://a.b.c.d.example.test:8080/' + 'a'.repeat(2100);
    const result = analyze(url, defaults());
    expect(result.findings.map((item) => item.id)).toEqual(expect.arrayContaining(['http', 'port', 'deepHost', 'longUrl']));
    expect(result.warn).toBe(false);
    expect(analyze(url, defaults('careful')).warn).toBe(true);
    expect(ids('https://bit.ly/example')).toContain('shortener');
  });
  it('handles non-Latin scripts without claiming all are malicious', () => {
    for (const host of ['مثال.test', 'דוגמה.test', '한국.test', 'उदाहरण.test', 'ไทย.test', 'ქართული.test', '☃.test']) {
      expect(analyze(`https://${host}`, defaults()).status, host).toBe('checked');
    }
    expect(analyze('https://مثالa.test', defaults()).status).toBe('uninspected');
    expect(ids('https://उदाहरणa.test')).toContain('mixedScript');
  });
  it('respects independent rule toggles, enabled state and exact host exceptions', () => {
    const settings = defaults();
    for (const id of Object.keys(settings.rules) as (keyof typeof settings.rules)[]) settings.rules[id] = false;
    expect(analyze('https://раураl.test/', settings).warn).toBe(false);
    settings.rules.mixedScript = true;
    expect(analyze('https://раураl.test/', settings).warn).toBe(true);
    settings.enabled = false;
    expect(analyze('https://раураl.test/', settings).warn).toBe(false);
    settings.enabled = true;
    settings.exceptions = [{ host: new URL('https://раураl.test').hostname, subdomains: false }];
    expect(analyze('https://раураl.test/', settings).excepted).toBe(true);
    expect(analyze('https://раураl.test/', settings).warn).toBe(false);
    expect(analyze('https://x.раураl.test/', settings).excepted).toBe(false);
  });
  it.each(['not a URL', '', 'https://%', 'javascript:alert(1)', 'file:///test', 'https://' + 'a'.repeat(8200)])('explicitly marks invalid or unsupported input: %s', (input) => {
    const result = analyze(input, defaults());
    expect(result.status).toBe('uninspected');
    expect(result.error).toBeTruthy();
    expect(result.warn).toBe(true);
  });
});
