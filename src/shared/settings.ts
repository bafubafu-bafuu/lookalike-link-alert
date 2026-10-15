import { parse } from 'tldts';

export const RULES = {
  confusable: ['似た形の文字', '英字に見えるキリル文字・ギリシャ文字などを検査します。'],
  mixedScript: ['文字種の混在', '同じドメインラベル内の不自然な文字種の混在を検査します。'],
  invisible: ['不可視・表示方向の制御文字', '見えない文字や、表示順を変える文字を検査します。'],
  japaneseIdn: ['日本語の国際化ドメイン', '日本語であること自体についても確認します。ほかの検査とは独立しています。'],
  otherIdn: ['日本語以外の国際化ドメイン', '日本語以外の非 ASCII ドメインを注意情報として表示します。'],
  lookalike: ['保護対象に似たドメイン', '登録した正規ドメインと、似た文字や綴りを比較します。'],
  misleadingSubdomain: ['サブドメインによる偽装', '保護対象の名前が、本当の接続先とは違う場所に含まれていないか確認します。'],
  displayMismatch: ['表示 URL と接続先の不一致', 'リンクの文字が URL の場合、実際の接続先と比較します。'],
  userinfo: ['ユーザー情報を含む URL', '@ より前の文字列を接続先と誤認しないよう確認します。'],
  ip: ['IP アドレスへの接続', 'IP アドレス・ローカルホストを注意情報として表示します。'],
  http: ['暗号化されない HTTP', 'HTTP 接続を注意情報として表示します。詐欺の断定ではありません。'],
  port: ['非標準ポート', '通常と異なるポートを注意情報として表示します。'],
  deepHost: ['深いサブドメイン', '多すぎるサブドメインを補助的に検査します。'],
  longUrl: ['長すぎる URL', '極端に長い URL を補助的に検査します。'],
  shortener: ['短縮 URL', '同梱した一部の短縮サービスを識別します。接続して展開はしません。'],
  embeddedDomain: ['パス・検索語中の保護対象名', '接続先と異なる保護対象名が埋め込まれている場合に注意情報を表示します。'],
} as const;

export type RuleId = keyof typeof RULES;
export type Level = 1 | 2 | 3;
export type Mode = 'normal' | 'careful' | 'custom';
export interface HostException { host: string; subdomains: boolean }
export interface Settings {
  version: 1;
  enabled: boolean;
  mode: Mode;
  warnLevel: Level;
  rules: Record<RuleId, boolean>;
  protectedDomains: string[];
  exceptions: HostException[];
  maxLabels: number;
  longUrlLength: number;
}

export const MAX_INPUT_LENGTH = 8192;
export const MAX_SETTINGS_BYTES = 100_000;
export const MAX_LIST_ITEMS = 100;
export const RULE_IDS = Object.keys(RULES) as RuleId[];

export function defaults(mode: 'normal' | 'careful' = 'normal'): Settings {
  const rules = Object.fromEntries(RULE_IDS.map((id) => [id, id !== 'japaneseIdn'])) as Record<RuleId, boolean>;
  return {
    version: 1, enabled: true, mode,
    warnLevel: mode === 'careful' ? 1 : 2,
    rules: { ...rules, japaneseIdn: mode === 'careful' },
    protectedDomains: [], exceptions: [], maxLabels: 5, longUrlLength: 2048,
  };
}

export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function canonicalHost(value: string): string {
  const input = value.trim();
  if (!input || input.length > 253 || /[/\\@?#:\s]/u.test(input)) {
    throw new Error('ドメイン名だけを入力してください。スキーム・パス・ポートは指定できません。');
  }
  const host = new URL(`https://${input}`).hostname.toLowerCase().replace(/\.$/u, '');
  if (!host || host.split('.').some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label))) {
    throw new Error('ドメイン名の形式が正しくありません。');
  }
  const parsed = parse(host, { allowPrivateDomains: true });
  if (parsed.publicSuffix === host && (parsed.isIcann || parsed.isPrivate)) {
    throw new Error('公開サフィックス全体を保護対象や例外にはできません。具体的なホストを指定してください。');
  }
  return host;
}

function integer(value: unknown, min: number, max: number, name: string): number {
  if (!Number.isInteger(value) || typeof value !== 'number' || value < min || value > max) {
    throw new Error(`${name} は ${min} 〜 ${max} の整数で指定してください。`);
  }
  return value;
}

export function parseSettings(value: unknown): Settings {
  if (!record(value) || value.version !== 1) throw new Error('未対応の設定形式またはバージョンです。');
  const keys = ['version', 'enabled', 'mode', 'warnLevel', 'rules', 'protectedDomains', 'exceptions', 'maxLabels', 'longUrlLength'];
  if (Object.keys(value).some((key) => !keys.includes(key))) throw new Error('設定に未知の項目があります。');
  if (typeof value.enabled !== 'boolean' || !['normal', 'careful', 'custom'].includes(String(value.mode))) {
    throw new Error('設定の動作モードが正しくありません。');
  }
  if (!record(value.rules) || Object.keys(value.rules).length !== RULE_IDS.length) throw new Error('検査項目が不足しています。');
  const rules = { ...defaults().rules };
  for (const id of RULE_IDS) {
    const flag = value.rules[id];
    if (typeof flag !== 'boolean') throw new Error(`検査項目 ${id} が正しくありません。`);
    rules[id] = flag;
  }
  if (!Array.isArray(value.protectedDomains) || value.protectedDomains.length > MAX_LIST_ITEMS ||
      !Array.isArray(value.exceptions) || value.exceptions.length > MAX_LIST_ITEMS) {
    throw new Error(`保護対象・例外はそれぞれ ${MAX_LIST_ITEMS} 件までです。`);
  }
  const protectedDomains = value.protectedDomains.map((host: unknown) => {
    if (typeof host !== 'string') throw new Error('保護対象の形式が正しくありません。');
    return canonicalHost(host);
  });
  const exceptions = value.exceptions.map((item: unknown): HostException => {
    if (!record(item) || typeof item.host !== 'string' || typeof item.subdomains !== 'boolean' ||
        Object.keys(item).some((key) => key !== 'host' && key !== 'subdomains')) {
      throw new Error('例外の形式が正しくありません。');
    }
    return { host: canonicalHost(item.host), subdomains: item.subdomains };
  });
  const warnLevel = integer(value.warnLevel, 1, 3, '警告レベル');
  if (warnLevel !== 1 && warnLevel !== 2 && warnLevel !== 3) throw new Error('警告レベルが正しくありません。');
  const mode = value.mode;
  if (mode !== 'normal' && mode !== 'careful' && mode !== 'custom') throw new Error('未対応のモードです。');
  return {
    version: 1, enabled: value.enabled, mode, warnLevel, rules,
    protectedDomains: [...new Set(protectedDomains)],
    exceptions,
    maxLabels: integer(value.maxLabels, 3, 20, 'ラベル数'),
    longUrlLength: integer(value.longUrlLength, 256, MAX_INPUT_LENGTH, 'URL の長さ'),
  };
}

export function importSettings(text: string): Settings {
  if (new TextEncoder().encode(text).length > MAX_SETTINGS_BYTES) throw new Error('設定ファイルが大きすぎます。');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('JSON として読み取れません。'); }
  return parseSettings(value);
}

export function isExcepted(host: string, settings: Settings): boolean {
  const normalized = host.toLowerCase().replace(/\.$/u, '');
  return settings.exceptions.some((item) =>
    normalized === item.host || (item.subdomains && normalized.endsWith(`.${item.host}`)));
}
