import { analyze } from '../core/analyze';
import { defaults, parseSettings, record, MAX_INPUT_LENGTH, type Settings } from '../shared/settings';
import { exactGetRule, networkUrl } from '../shared/navigation';
import { candidateRules } from './rules';
import {
  admitPending, findPending, isBypass, isPending, nextBypassId, prunePending, splitBypasses,
  BYPASS_TTL_MS, HOST_ORIGINS, PENDING_TTL_MS, type Bypass, type Pending,
} from './state';
import type { Gate, State } from '../shared/messages';

const WARNING = chrome.runtime.getURL('warning.html');
const PRIVATE_PAGES = ['options.html', 'popup.html'].map((name) => chrome.runtime.getURL(name));
const PERMISSION_FAULT = 'サイトへのアクセス権限が取り消されました。設定で保護範囲を確認してください。';
let settings: Settings = defaults();
let fault: string | null = null;
let initialized = false;
let pending: Pending[] = [];
let bypasses: Bypass[] = [];
let tail: Promise<unknown> = Promise.resolve();

function serial<T>(action: () => Promise<T>): Promise<T> {
  const operation = tail.then(action);
  tail = operation.catch(() => undefined);
  return operation;
}
function errorText(error: unknown): string { return error instanceof Error ? error.message : '不明な拡張エラーです。'; }
async function report(error: unknown): Promise<void> {
  fault = errorText(error);
  console.error('Lookalike Link Alert:', fault);
  await chrome.action.setBadgeText({ text: '!' });
  await chrome.action.setBadgeBackgroundColor({ color: '#a33120' });
  await chrome.action.setTitle({ title: 'Lookalike Link Alert: 保護にエラーがあります。設定を確認してください。' });
}
async function badge(): Promise<void> {
  await chrome.action.setBadgeText({ text: settings.enabled ? '' : 'OFF' });
  await chrome.action.setBadgeBackgroundColor({ color: '#59636e' });
  await chrome.action.setTitle({ title: settings.enabled ? 'Lookalike Link Alert' : 'Lookalike Link Alert: 保護が無効です' });
}
async function persistSession(): Promise<void> {
  await chrome.storage.session.set({ pending, bypasses });
}
async function replaceRules(next: Settings): Promise<void> {
  const rules = candidateRules(next);
  for (const rule of rules) {
    const support = await chrome.declarativeNetRequest.isRegexSupported({ regex: rule.condition.regexFilter!, requireCapturing: true });
    if (!support.isSupported) throw new Error('Chrome が URL 保護ルールを受理しませんでした。');
  }
  const previous = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: previous.map((rule) => rule.id), addRules: rules });
}
const ready = (async () => {
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  const saved = await chrome.storage.local.get(['settings', 'initialized']);
  if (saved.settings !== undefined) settings = parseSettings(saved.settings);
  initialized = saved.initialized === true;
  const session = await chrome.storage.session.get(['pending', 'bypasses']);
  if (Array.isArray(session.pending)) pending = session.pending.filter(isPending);
  if (Array.isArray(session.bypasses)) bypasses = session.bypasses.filter(isBypass);
  await replaceRules(settings);
  await cleanup();
  await chrome.alarms.create('cleanup', { periodInMinutes: 1 });
  await badge();
})().catch(async (error: unknown) => { await report(error); });

async function state(): Promise<State> {
  const hostAccess = await chrome.permissions.contains({ origins: HOST_ORIGINS });
  return { settings, error: fault, hostAccess, initialized };
}
async function cleanup(tabId?: number): Promise<void> {
  const now = Date.now();
  const { keep } = splitBypasses(bypasses, now, tabId);
  const active = await chrome.declarativeNetRequest.getSessionRules();
  const keepIds = new Set(keep.map((item) => item.id));
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: active.filter((rule) => !keepIds.has(rule.id)).map((rule) => rule.id) });
  bypasses = keep;
  pending = prunePending(pending, now, tabId);
  await persistSession();
}
function pageOf(sender: chrome.runtime.MessageSender): string {
  if (sender.id !== chrome.runtime.id || !sender.url) throw new Error('送信元を確認できません。');
  return sender.url.split(/[?#]/u)[0]!;
}
function requirePrivate(sender: chrome.runtime.MessageSender): void {
  if (!PRIVATE_PAGES.includes(pageOf(sender))) throw new Error('この操作は拡張の設定・ポップアップからのみ利用できます。');
}
function requireWarning(sender: chrome.runtime.MessageSender): number {
  // A framed warning page would let the embedding site clickjack the continue button.
  if (pageOf(sender) !== WARNING || sender.tab?.id === undefined || sender.frameId !== 0) throw new Error('警告ページのタブを確認できません。');
  return sender.tab.id;
}
function stringField(message: Record<string, unknown>, key: string, max = MAX_INPUT_LENGTH): string {
  const value = message[key];
  if (typeof value !== 'string' || value.length > max) throw new Error('入力の形式または長さが正しくありません。');
  return value;
}
function livePending(token: string, tabId: number): Pending {
  const entry = findPending(pending, token, tabId, Date.now());
  if (!entry) throw new Error('この確認は期限切れです。元のリンクからやり直してください。');
  return entry;
}
async function register(url: string, text: string, rawHref: string, tabId: number, source: Pending['source']): Promise<Pending> {
  const result = analyze(url, settings, text, rawHref);
  if (result.status !== 'checked') throw new Error(result.error ?? 'URL を検査できません。');
  const entry: Pending = { token: crypto.randomUUID(), tabId, url: new URL(url).href, text, rawHref, source, expires: Date.now() + PENDING_TTL_MS, opened: false };
  pending = admitPending(pending, entry);
  await persistSession();
  return entry;
}
async function proceed(entry: Pending): Promise<void> {
  const url = networkUrl(entry.url);
  const existing = bypasses.filter((item) => item.tabId === entry.tabId);
  const id = nextBypassId(bypasses);
  const rule = exactGetRule(id, entry.tabId, entry.url);
  const support = await chrome.declarativeNetRequest.isRegexSupported({ regex: rule.condition.regexFilter! });
  if (!support.isSupported) throw new Error('この URL の一時許可ルールを Chrome が受理しませんでした。');
  const next = { id, tabId: entry.tabId, url, expires: Date.now() + BYPASS_TTL_MS };
  bypasses = [...bypasses.filter((item) => item.tabId !== entry.tabId), next];
  await persistSession();
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: existing.map((item) => item.id), addRules: [rule] });
  try {
    await chrome.tabs.update(entry.tabId, { url: entry.url });
  } catch (error) {
    await cleanup(entry.tabId);
    throw error;
  }
  pending = pending.filter((item) => item.token !== entry.token);
  await persistSession();
}
async function leave(tabId: number, opened: boolean): Promise<void> {
  await cleanup(tabId);
  if (opened) { await chrome.tabs.remove(tabId); return; }
  try { await chrome.tabs.goBack(tabId); }
  catch { await chrome.tabs.update(tabId, { url: 'chrome://newtab/' }); }
}
async function dispatch(value: unknown, sender: chrome.runtime.MessageSender): Promise<unknown> {
  await ready;
  pageOf(sender);
  if (!record(value) || typeof value.type !== 'string') throw new Error('メッセージ形式が正しくありません。');
  if (value.type === 'state') { requirePrivate(sender); return state(); }
  if (value.type === 'config') {
    if (fault) throw new Error(`保護を初期化できませんでした: ${fault}`);
    return settings;
  }
  if (value.type === 'save' || value.type === 'set-enabled') {
    requirePrivate(sender);
    if (value.type === 'set-enabled' && typeof value.enabled !== 'boolean') throw new Error('有効・無効の指定が正しくありません。');
    const next = parseSettings(value.type === 'save' ? value.settings : { ...settings, enabled: value.enabled });
    const previous = settings;
    await replaceRules(next);
    try { await chrome.storage.local.set({ settings: next, initialized: true }); }
    catch (error) { await replaceRules(previous); throw error; }
    settings = next;
    initialized = true;
    fault = null;
    await badge();
    for (const tab of await chrome.tabs.query({})) {
      if (tab.id === undefined) continue;
      try { await chrome.tabs.sendMessage(tab.id, { type: 'config-updated', settings }); }
      catch (error) {
        if (!errorText(error).includes('Receiving end does not exist')) {
          console.warn('Lookalike Link Alert: 設定通知が届かないタブがあります。再読み込みしてください。', errorText(error));
        }
      }
    }
    return state();
  }
  if (value.type === 'leave') {
    await leave(requireWarning(sender), false);
    return null;
  }
  if (fault) throw new Error(`保護を初期化できませんでした: ${fault}`);
  if (value.type === 'check') { requirePrivate(sender); return analyze(stringField(value, 'url'), settings); }
  if (value.type === 'open-warning') {
    const source = new URL(sender.url!);
    if (!['http:', 'https:'].includes(source.protocol) || sender.tab?.id === undefined || sender.frameId !== 0) throw new Error('リンクの送信元が検査対象外です。');
    const url = stringField(value, 'url');
    const text = stringField(value, 'text', 2000);
    const rawHref = stringField(value, 'rawHref');
    if (typeof value.newTab !== 'boolean') throw new Error('タブ指定が正しくありません。');
    const entry = await register(url, text, rawHref, sender.tab.id, 'link');
    if (value.newTab) {
      // Open the warning URL directly: an intermediate about:blank commit would trigger cleanup for the new tab.
      const tab = await chrome.tabs.create({ url: `${WARNING}#token=${entry.token}`, openerTabId: sender.tab.id });
      if (tab.id === undefined) {
        pending = pending.filter((item) => item.token !== entry.token);
        await persistSession();
        throw new Error('確認用タブを開けません。');
      }
      entry.tabId = tab.id;
      entry.opened = true;
      await persistSession();
    } else {
      await chrome.tabs.update(sender.tab.id, { url: `${WARNING}#token=${entry.token}` });
    }
    return null;
  }
  if (value.type === 'gate') {
    const tabId = requireWarning(sender);
    const fragment = stringField(value, 'value', MAX_INPUT_LENGTH + 50);
    let entry: Pending;
    if (fragment.startsWith('token=')) entry = livePending(fragment.slice(6), tabId);
    else {
      if (!/^https?:\/\//u.test(fragment)) throw new Error('確認する URL が指定されていません。');
      const known = pending.find((item) => item.tabId === tabId && item.url === fragment && item.expires > Date.now());
      entry = known ?? await register(fragment, '', '', tabId, 'dnr');
    }
    const result = analyze(entry.url, settings, entry.text, entry.rawHref);
    const parsed = new URL(entry.url);
    const canProceed = !parsed.username && !parsed.password;
    const gate: Gate = { token: entry.token, result, canProceed, source: entry.source };
    // Public warning URLs are untrusted input; only the page's explicit button can request continuation.
    return gate;
  }
  if (value.type === 'continue' || value.type === 'auto-continue') {
    const entry = livePending(stringField(value, 'token', 100), requireWarning(sender));
    if (value.type === 'auto-continue') {
      const result = analyze(entry.url, settings, entry.text, entry.rawHref);
      if (entry.source !== 'dnr' || result.status !== 'checked' || result.warn) {
        throw new Error('このリンクには利用者による確認が必要です。');
      }
    }
    await proceed(entry);
    return null;
  }
  if (value.type === 'cancel') {
    const tabId = requireWarning(sender);
    const entry = livePending(stringField(value, 'token', 100), tabId);
    await leave(tabId, entry.opened);
    return null;
  }
  throw new Error('未対応の操作です。');
}
chrome.runtime.onMessage.addListener((value: unknown, sender, sendResponse) => {
  void serial(() => dispatch(value, sender)).then(
    (result) => sendResponse({ ok: true, value: result }),
    async (error: unknown) => {
      console.error('Lookalike Link Alert request:', errorText(error));
      sendResponse({ ok: false, error: errorText(error) });
    },
  );
  return true;
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cleanup') void serial(async () => { await ready; await cleanup(); }).catch(report);
});
chrome.tabs.onRemoved.addListener((tabId) => { void serial(async () => { await ready; await cleanup(tabId); }).catch(report); });
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) return;
  void serial(async () => {
    await ready;
    if (details.url.startsWith(WARNING)) return;
    await cleanup(details.tabId);
  }).catch(report);
});
chrome.webNavigation.onErrorOccurred.addListener((details) => {
  if (details.frameId !== 0 || details.error === 'net::ERR_ABORTED') return;
  void serial(async () => { await ready; await cleanup(details.tabId); }).catch(report);
});
chrome.permissions.onRemoved.addListener(() => { void report(new Error(PERMISSION_FAULT)); });
chrome.permissions.onAdded.addListener(() => {
  void serial(async () => {
    await ready;
    if (fault === PERMISSION_FAULT && await chrome.permissions.contains({ origins: HOST_ORIGINS })) {
      fault = null;
      await badge();
    }
  }).catch(report);
});
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') void ready.then(() => chrome.runtime.openOptionsPage()).catch(report);
});
