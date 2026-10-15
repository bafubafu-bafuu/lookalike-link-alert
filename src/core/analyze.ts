import { toUnicode } from 'punycode/';
import { getDomain } from 'tldts';
import confusables from './confusables.json';
import { type Settings, type RuleId, type Level, MAX_INPUT_LENGTH, isExcepted } from '../shared/settings';

const CONFUSABLES: Readonly<Record<string, string>> = confusables;
// These code points are inspected as controls, not displayed as a character class.
// eslint-disable-next-line no-control-regex, no-misleading-character-class
const INVISIBLE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u00ad\u034f\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u;
const JAPANESE = /^[\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}\p{Script_Extensions=Latin}\p{M}0-9-]+$/u;
const HAS_JAPANESE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const SHORTENERS = new Set(['bit.ly', 't.co', 'tinyurl.com', 'goo.gl', 'ow.ly', 'buff.ly', 'is.gd']);
export interface Finding { id: RuleId; level: Level; title: string; detail: string; evidence: string }
export interface Analysis {
  status: 'checked' | 'uninspected';
  error: string | null;
  url: string;
  asciiHost: string;
  unicodeHost: string;
  domain: string;
  findings: Finding[];
  warn: boolean;
  excepted: boolean;
}

export function skeleton(value: string): string {
  return Array.from(value.normalize('NFD'), (character) => CONFUSABLES[character] ?? character)
    .join('').normalize('NFD').toLowerCase();
}

export function registrable(host: string): string {
  return getDomain(host, { allowPrivateDomains: true }) ?? host;
}

export function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.username || url.password) { url.username = 'REDACTED'; url.password = ''; }
    return url.href;
  } catch { return '（表示できない URL）'; }
}

function decodeOnce(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

function scripts(label: string): Set<string> {
  const patterns: [string, RegExp][] = [
    ['Latin', /\p{Script=Latin}/u], ['Cyrillic', /\p{Script=Cyrillic}/u], ['Greek', /\p{Script=Greek}/u],
    ['Japanese', /[\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}]/u],
    ['Arabic', /\p{Script=Arabic}/u], ['Hebrew', /\p{Script=Hebrew}/u],
    ['Hangul', /\p{Script=Hangul}/u], ['Devanagari', /\p{Script=Devanagari}/u], ['Thai', /\p{Script=Thai}/u],
  ];
  const found = new Set<string>();
  for (const character of label) {
    if (!/\p{L}/u.test(character)) continue;
    found.add(patterns.find(([, pattern]) => pattern.test(character))?.[0] ?? 'Other');
  }
  return found;
}

function oneEditApart(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    const positions = Array.from(a).flatMap((character, index) => character === b[index] ? [] : [index]);
    if (positions.length === 1) return true;
    const [i, j] = positions;
    return positions.length === 2 && i !== undefined && j === i + 1 && a[i] === b[j] && a[j] === b[i];
  }
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  let offset = 0;
  for (let i = 0; i < long.length; i++) {
    if (short[i - offset] !== long[i]) {
      if (offset) return false;
      offset++;
    }
  }
  return true;
}

export function analyze(input: string, settings: Settings, displayText?: string, rawHref?: string): Analysis {
  const empty: Analysis = {
    status: 'uninspected', error: null, url: '', asciiHost: '', unicodeHost: '', domain: '',
    findings: [], warn: true, excepted: false,
  };
  if (input.length > MAX_INPUT_LENGTH || (rawHref !== undefined && rawHref.length > MAX_INPUT_LENGTH)) {
    return { ...empty, error: `URL が ${MAX_INPUT_LENGTH} 文字を超えているため未検査です。` };
  }
  let url: URL;
  try { url = new URL(input); } catch { return { ...empty, error: 'URL の形式が正しくありません。' }; }
  if (!['https:', 'http:'].includes(url.protocol)) return { ...empty, error: 'HTTP / HTTPS 以外は検査対象外です。' };
  const host = url.hostname.toLowerCase().replace(/\.$/u, '');
  let unicode: string;
  try { unicode = toUnicode(host); } catch { return { ...empty, error: '国際化ドメインを読み取れません。' }; }
  const domain = registrable(host);
  const unicodeDomain = toUnicode(domain);
  const findings: Finding[] = [];
  const add = (id: RuleId, level: Level, title: string, detail: string, evidence: string) => {
    if (settings.rules[id] && !findings.some((item) => item.id === id)) {
      findings.push({ id, level, title, detail, evidence });
    }
  };
  const sanitized = redactUrl(input);
  const noUserinfo = new URL(url.href);
  noUserinfo.username = '';
  noUserinfo.password = '';
  const visibleInput = input.replace(/^(https?:\/\/)[^/?#]*@/iu, '$1');
  const rawWithoutUserinfo = rawHref?.replace(/^(https?:\/\/)[^/?#]*@/iu, '$1');
  if (INVISIBLE.test(visibleInput) || INVISIBLE.test(decodeOnce(noUserinfo.href)) ||
      (rawWithoutUserinfo !== undefined && INVISIBLE.test(rawWithoutUserinfo)) ||
      (displayText !== undefined && INVISIBLE.test(displayText))) {
    add('invisible', 3, '見えない文字・表示順を変える文字があります',
      '文字の表示と実際の URL が一致しない原因になります。', '不可視文字または双方向制御文字');
  }
  for (const label of unicode.split('.')) {
    const types = scripts(label);
    const normalJapanese = types.size <= 2 && types.has('Japanese') && [...types].every((type) => ['Japanese', 'Latin'].includes(type));
    if (types.size > 1 && !normalJapanese) {
      add('mixedScript', 3, 'ドメインに異なる文字種が混在しています',
        `同じラベルに ${[...types].join(' / ')} が含まれています。`, label);
    }
    if (/\P{ASCII}/u.test(label) && !HAS_JAPANESE.test(label) && /^[a-z0-9-]+$/u.test(skeleton(label))) {
      add('confusable', 3, '英数字に似た別の文字が使われています',
        `見た目の比較用表現は「${skeleton(label)}」です。これは正規サイトの判定ではありません。`, label);
    }
  }
  if (/\P{ASCII}/u.test(unicode)) {
    const japanese = HAS_JAPANESE.test(unicode) && unicode.split('.').every((label) => JAPANESE.test(label));
    add(japanese ? 'japaneseIdn' : 'otherIdn', japanese ? 2 : 1, japanese ? '日本語の国際化ドメインです' : '国際化ドメインです',
      '国際化ドメイン自体は危険という意味ではありません。Unicode と Punycode を確認できます。', host);
  }
  for (const protectedHost of settings.protectedDomains) {
    const protectedDomain = registrable(protectedHost);
    if (domain === protectedDomain) continue;
    const protectedUnicode = toUnicode(protectedDomain);
    if (skeleton(unicodeDomain) === skeleton(protectedUnicode)) {
      add('lookalike', 3, '保護対象と見た目が似ています', `登録された ${protectedDomain} とは別のドメインです。`, unicodeDomain);
    } else if (protectedDomain.split('.')[0]!.length >= 5 && oneEditApart(domain, protectedDomain)) {
      add('lookalike', 2, '保護対象と綴りが似ています', `登録された ${protectedDomain} とは別のドメインです。`, domain);
    }
    if (host.includes(`${protectedDomain}.`) || host.startsWith(`${protectedDomain}-`)) {
      add('misleadingSubdomain', 3, '保護対象名が接続先以外にあります', `実際の登録可能ドメインは ${domain} です。`, protectedDomain);
    }
    if (decodeOnce(url.pathname + url.search).toLowerCase().includes(protectedDomain)) {
      add('embeddedDomain', 1, 'URL の途中に保護対象名があります',
        `検索・共有リンクでも使われる形式です。実際の接続先は ${domain} です。`, protectedDomain);
    }
  }
  if (displayText && displayText.length <= MAX_INPUT_LENGTH) {
    const text = displayText.trim();
    if (/^(?:https?:\/\/|www\.)[^\s]+$/iu.test(text)) {
      let displayed: URL | null = null;
      try { displayed = new URL(text.startsWith('www.') ? `https://${text}` : text); } catch { /* Invalid display text is not a URL. */ }
      if (displayed && ['http:', 'https:'].includes(displayed.protocol) && registrable(displayed.hostname) !== domain) {
        add('displayMismatch', 3, 'リンクの表示と実際の接続先が違います',
          `表示の接続先は ${registrable(displayed.hostname)}、実際の接続先は ${domain} です。`, domain);
      }
    }
  }
  if (url.username || url.password) add('userinfo', 3, 'URL にユーザー情報が含まれています', '@ より前は接続先ではありません。この拡張からは継続できません。', host);
  if (/^\[.*\]$/u.test(host) || /^\d+\.\d+\.\d+\.\d+$/u.test(host) || host === 'localhost' || host.endsWith('.localhost')) {
    add('ip', 1, 'IP アドレスまたはローカルホストです', '開発環境でも使われます。接続先を確認してください。', host);
  }
  if (url.protocol === 'http:') add('http', 1, '暗号化されない接続です', 'HTTP では通信内容が保護されません。', 'HTTP');
  if (url.port) add('port', 1, '通常と異なるポートです', '正当なサービスでも使われます。接続先を確認してください。', url.port);
  if (host.split('.').length > settings.maxLabels) add('deepHost', 1, 'サブドメインの階層が深くなっています', `本当の登録可能ドメインは ${domain} です。`, host);
  if (input.length > settings.longUrlLength) add('longUrl', 1, 'URL が長く、接続先を確認しにくくなっています', '長さだけで危険とは判断できません。', `${input.length} 文字`);
  if (SHORTENERS.has(host)) add('shortener', 1, '短縮 URL のため最終接続先が分かりません', 'この拡張は外部へ接続して展開しません。移動後の接続先は別途検査します。', host);
  findings.sort((a, b) => b.level - a.level);
  const excepted = isExcepted(host, settings);
  return {
    status: 'checked', error: null, url: sanitized, asciiHost: host, unicodeHost: unicode, domain,
    findings, excepted,
    warn: settings.enabled && !excepted && findings.some((finding) => finding.level >= settings.warnLevel),
  };
}
