import { test, expect, type BrowserContext, type Worker } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { resolve } from 'node:path';
import { defaults } from '../../src/shared/settings';

let context: BrowserContext;
let worker: Worker;
let server: Server;
let port: number;
let extension: string;
let received: { host: string; path: string; method: string }[];
const hostileHost = new URL('http://раураl.test').hostname;
const japaneseHost = new URL('http://日本語.test').hostname;
const origin = (host: string) => `http://${host}:${port}`;
const target = () => `${origin(hostileHost)}/destination?q=%23%26&x=1#original`;

test.beforeAll(async ({ playwright }, testInfo) => {
  received = [];
  server = createServer((req, res) => {
    const host = req.headers.host ?? '';
    const path = req.url ?? '';
    received.push({ host, path, method: req.method ?? '' });
    res.setHeader('content-type', 'text/html; charset=utf-8');
    if (path === '/redirect') {
      res.writeHead(302, { location: target() }); res.end(); return;
    }
    if (path.startsWith('/source')) {
      res.end(`<!doctype html><html lang="ja"><meta charset="utf-8"><title>Fixture source</title>
        <h1>Local link fixture</h1>
        <a id="hostile" href="${target().replaceAll('&', '&amp;')}">移動する</a>
        <a id="mismatch" href="${origin('plain.test')}/destination">https://different.test</a>
        <a id="japanese" href="${origin(japaneseHost)}/destination">日本語のサイト</a>
        <a id="safe" href="${origin('plain.test')}/destination">通常のリンク</a>
        <a id="spoof" href="${origin('example.com.attacker.test')}/destination">example.com のログイン</a>
        <form action="${origin(hostileHost)}/post" method="post"><button id="post">POST</button></form>
        </html>`);
    } else res.end('<!doctype html><html lang="ja"><meta charset="utf-8"><title>Destination</title><h1>Local destination</h1></html>');
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test address');
  port = address.port;
  const path = resolve('dist');
  const installedChrome = testInfo.project.name === 'chrome';
  context = await playwright.chromium.launchPersistentContext('', {
    channel: installedChrome ? 'chrome' : 'chromium', headless: true,
    ignoreDefaultArgs: installedChrome ? ['--disable-extensions'] : [],
    args: [
      ...(installedChrome ? ['--enable-unsafe-extension-debugging'] : [`--disable-extensions-except=${path}`, `--load-extension=${path}`]),
      '--host-resolver-rules=MAP *.test 127.0.0.1, EXCLUDE localhost',
      '--no-proxy-server',
    ],
  });
  if (installedChrome) {
    const browser = context.browser();
    if (!browser) throw new Error('Missing persistent browser handle');
    const session = await browser.newBrowserCDPSession();
    await session.send('Extensions.loadUnpacked', { path });
    await session.detach();
  }
  worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  extension = worker.url().replace('/background.js', '');
  await expect.poll(() => worker.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules()).length)).toBe(2);
});
test.afterAll(async () => {
  await context?.close();
  if (server) await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()));
});
test.beforeEach(async () => {
  const page = await context.newPage();
  await page.goto(`${extension}/options.html`);
  await expect(page.getByRole('button', { name: '変更を保存する' })).toBeEnabled();
  await page.evaluate(async (settings) => {
    const response = await chrome.runtime.sendMessage({ type: 'save', settings });
    if (!response.ok) throw new Error(response.error);
  }, defaults());
  await page.close();
  received.length = 0;
});

test('direct URL is held before request; continue preserves query and fragment and expires the rule', async () => {
  const page = await context.newPage();
  await page.goto(target());
  await expect(page.getByRole('heading', { name: 'URL の警告' })).toBeVisible();
  await expect(page.getByRole('button', { name: '危険性を理解して今回だけ進む' })).toBeEnabled();
  expect(received.filter((item) => item.host.startsWith(hostileHost))).toEqual([]);
  await page.getByRole('button', { name: '危険性を理解して今回だけ進む' }).click();
  await expect(page).toHaveTitle('Destination');
  expect(page.url()).toBe(target());
  expect(received.filter((item) => item.path.startsWith('/destination'))).toHaveLength(1);
  await expect.poll(() => worker.evaluate(async () => (await chrome.declarativeNetRequest.getSessionRules()).length)).toBe(0);
  const second = await context.newPage();
  await second.goto(target());
  await expect(second.getByRole('button', { name: '移動をやめる', exact: true })).toBeVisible();
  expect(received.filter((item) => item.path.startsWith('/destination'))).toHaveLength(1);
  await page.close(); await second.close();
});

test('normal Japanese IDN passes without warning, but its explicit setting warns', async () => {
  const page = await context.newPage();
  await page.goto(`${origin(japaneseHost)}/destination#日本語`);
  await expect(page).toHaveTitle('Destination');
  expect(page.url()).toContain('/destination#');
  const options = await context.newPage();
  await options.goto(`${extension}/options.html`);
  await options.getByLabel('日本語の国際化ドメイン', { exact: false }).first().check();
  await options.getByRole('button', { name: '変更を保存する' }).click();
  await expect(options.getByText('設定を保存して、保護ルールを適用しました。')).toBeVisible();
  received.length = 0;
  await page.goto(`${origin(japaneseHost)}/destination`);
  await expect(page.getByRole('button', { name: '移動をやめる', exact: true })).toBeVisible();
  expect(received.filter((item) => item.host.startsWith(japaneseHost))).toHaveLength(0);
  await page.close(); await options.close();
});

test('content warning handles URL display mismatch before any destination request', async () => {
  const page = await context.newPage();
  await page.goto(`${origin('plain.test')}/source`);
  await page.locator('#mismatch').click();
  const session = await context.newCDPSession(page);
  const tree = await session.send('Accessibility.getFullAXTree');
  expect(tree.nodes.some((item) => item.role?.value === 'dialog' && item.name?.value === 'URL の警告')).toBe(true);
  expect(received.filter((item) => item.path === '/destination')).toHaveLength(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('#mismatch')).toBeFocused();
  await session.detach();
  await page.close();
});

test('keyboard can open the isolated warning page from the content dialog', async () => {
  const page = await context.newPage();
  await page.goto(`${origin('plain.test')}/source`);
  await page.locator('#hostile').focus();
  await page.keyboard.press('Enter');
  const session = await context.newCDPSession(page);
  await expect.poll(async () => (await session.send('Accessibility.getFullAXTree')).nodes.some((item) => item.role?.value === 'dialog')).toBe(true);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`${extension}/warning.html#token=`));
  await expect(page.getByRole('heading', { name: '強い注意 ドメインに異なる文字種が混在しています', exact: true })).toBeVisible();
  expect(received.some((item) => item.host.startsWith(hostileHost))).toBe(false);
  await session.detach();
  await page.close();
});

test('modifier click opens the warning page in a new tab with a live token', async () => {
  const page = await context.newPage();
  await page.goto(`${origin('plain.test')}/source`);
  await page.locator('#hostile').click({ modifiers: ['ControlOrMeta'] });
  const session = await context.newCDPSession(page);
  await expect.poll(async () => (await session.send('Accessibility.getFullAXTree')).nodes.some((item) => item.role?.value === 'dialog')).toBe(true);
  const opened = context.waitForEvent('page');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  const review = await opened;
  await expect(review).toHaveURL(new RegExp(`${extension}/warning.html#token=`));
  await expect(review.getByRole('button', { name: '危険性を理解して今回だけ進む' })).toBeEnabled();
  await expect(review.getByText('この確認は期限切れです', { exact: false })).toHaveCount(0);
  expect(page.url()).toBe(`${origin('plain.test')}/source`);
  expect(received.some((item) => item.host.startsWith(hostileHost))).toBe(false);
  await session.detach();
  await review.close(); await page.close();
});

test('cancelling a held navigation returns to the previous page', async () => {
  const page = await context.newPage();
  await page.goto(`${origin('plain.test')}/source`);
  await page.goto(target());
  await page.getByRole('button', { name: '移動をやめる', exact: true }).click();
  await expect(page).toHaveURL(`${origin('plain.test')}/source`);
  expect(received.some((item) => item.host.startsWith(hostileHost))).toBe(false);
  await page.close();
});

test('cancelling in a tab the extension opened closes that tab', async () => {
  const page = await context.newPage();
  await page.goto(`${origin('plain.test')}/source`);
  await page.locator('#hostile').click({ modifiers: ['ControlOrMeta'] });
  const session = await context.newCDPSession(page);
  await expect.poll(async () => (await session.send('Accessibility.getFullAXTree')).nodes.some((item) => item.role?.value === 'dialog')).toBe(true);
  const opened = context.waitForEvent('page');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  const review = await opened;
  const closed = review.waitForEvent('close');
  await review.getByRole('button', { name: '移動をやめる', exact: true }).click();
  await closed;
  expect(page.url()).toBe(`${origin('plain.test')}/source`);
  expect(received.some((item) => item.host.startsWith(hostileHost))).toBe(false);
  await session.detach();
  await page.close();
});

test('the warning error state can leave to the previous page', async () => {
  const page = await context.newPage();
  await page.goto(`${origin('plain.test')}/source`);
  await page.goto(`${extension}/warning.html#token=bogus`);
  await expect(page.getByText('この確認は期限切れです', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '前のページへ戻る' }).click();
  await expect(page).toHaveURL(`${origin('plain.test')}/source`);
  await page.close();
});

test('synthetic clicks are ignored so pages cannot probe the verdict', async () => {
  const page = await context.newPage();
  await page.goto(`${origin('plain.test')}/source`);
  // The extension listens in the capture phase and stops propagation when it intercepts,
  // so the anchor's own listener only runs if the synthetic click was ignored.
  const reachedPage = await page.evaluate(() => {
    const anchor = document.getElementById('hostile')!;
    let reached = false;
    anchor.addEventListener('click', (event) => { reached = true; event.preventDefault(); }, { once: true });
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return reached;
  });
  expect(reachedPage).toBe(true);
  const session = await context.newCDPSession(page);
  const tree = await session.send('Accessibility.getFullAXTree');
  expect(tree.nodes.some((item) => item.role?.value === 'dialog')).toBe(false);
  await session.detach();
  await page.close();
});

test('warning page cannot be framed by web pages', async () => {
  const page = await context.newPage();
  await page.goto(`${origin('plain.test')}/source`);
  await page.evaluate((src) => {
    const frame = document.createElement('iframe');
    frame.id = 'framed-warning'; frame.src = src; frame.width = '800'; frame.height = '600';
    document.body.append(frame);
  }, `${extension}/warning.html#${target()}`);
  await page.waitForTimeout(1000);
  await expect(page.frameLocator('#framed-warning').getByRole('button', { name: '危険性を理解して今回だけ進む' })).toHaveCount(0);
  expect(page.url()).toBe(`${origin('plain.test')}/source`);
  expect(received.some((item) => item.host.startsWith(hostileHost))).toBe(false);
  await page.close();
});

async function saveSettings(settings: unknown): Promise<void> {
  const page = await context.newPage();
  await page.goto(`${extension}/options.html`);
  await expect(page.getByRole('button', { name: '変更を保存する' })).toBeEnabled();
  await page.evaluate(async (value) => {
    const response = await chrome.runtime.sendMessage({ type: 'save', settings: value });
    if (!response.ok) throw new Error(response.error);
  }, settings);
  await page.close();
}

test('userinfo URLs are held and cannot be continued from the warning page', async () => {
  const page = await context.newPage();
  await page.goto(`http://bank.example@plain.test:${port}/destination`);
  await expect(page.getByRole('heading', { name: 'URL の警告' })).toBeVisible();
  await expect(page.getByRole('button', { name: '危険性を理解して今回だけ進む' })).toBeDisabled();
  await expect(page.getByText('ユーザー情報を含む URL にはこの画面から進めません', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: '強い注意 URL にユーザー情報が含まれています', exact: true })).toBeVisible();
  expect(received.filter((item) => item.path === '/destination')).toHaveLength(0);
  await page.close();
});

test('a protected domain used as a subdomain is explained in the content dialog', async () => {
  await saveSettings({ ...defaults(), protectedDomains: ['example.com'] });
  const page = await context.newPage();
  await page.goto(`${origin('plain.test')}/source`);
  await page.locator('#spoof').click();
  const session = await context.newCDPSession(page);
  const tree = await session.send('Accessibility.getFullAXTree');
  const names = tree.nodes.map((item) => item.name?.value ?? '');
  expect(names.some((name) => name.includes('保護対象名が接続先以外にあります'))).toBe(true);
  expect(names.some((name) => name === 'attacker.test')).toBe(true);
  expect(received.filter((item) => item.host.startsWith('example.com.attacker.test'))).toHaveLength(0);
  await session.detach();
  await page.close();
});

test('an exact host exception lets the held navigation continue without a prompt', async () => {
  await saveSettings({ ...defaults(), exceptions: [{ host: hostileHost, subdomains: false }] });
  const page = await context.newPage();
  await page.goto(target());
  await expect(page).toHaveTitle('Destination');
  expect(page.url()).toBe(target());
  expect(received.filter((item) => item.path.startsWith('/destination'))).toHaveLength(1);
  await page.goto(`${origin(`sub.${hostileHost}`)}/destination`);
  await expect(page.getByRole('button', { name: '移動をやめる', exact: true })).toBeVisible();
  await page.close();
});

test('disabling protection stops the content dialog and the pre-request rules', async () => {
  await saveSettings({ ...defaults(), enabled: false });
  const page = await context.newPage();
  await page.goto(`${origin('plain.test')}/source`);
  await page.locator('#hostile').click();
  await expect(page).toHaveTitle('Destination');
  expect(received.some((item) => item.host.startsWith(hostileHost))).toBe(true);
  await page.close();
});

test('settings export and import round-trip through the options page', async () => {
  const options = await context.newPage();
  await options.goto(`${extension}/options.html`);
  await options.locator('#protected-domain').fill('bank.example');
  await options.getByRole('button', { name: '保護対象に追加' }).click();
  await options.locator('#rule-shortener').uncheck();
  const download = options.waitForEvent('download');
  await options.getByRole('button', { name: '設定を JSON で保存' }).click();
  const file = await (await download).path();
  const exported = JSON.parse(await (await import('node:fs/promises')).readFile(file, 'utf8'));
  expect(exported.protectedDomains).toEqual(['bank.example']);
  expect(exported.rules.shortener).toBe(false);
  await options.reload();
  await expect(options.getByText('bank.example', { exact: true })).toHaveCount(0);
  await options.locator('#import-file').setInputFiles(file);
  await expect(options.getByText('保護対象 1 件 / 例外 0 件', { exact: false })).toBeVisible();
  await options.getByRole('button', { name: 'この内容を設定画面に取り込む' }).click();
  await options.getByRole('button', { name: '変更を保存する' }).click();
  await expect(options.getByText('設定を保存して、保護ルールを適用しました。')).toBeVisible();
  await options.reload();
  await expect(options.getByText('bank.example', { exact: true })).toBeVisible();
  await expect(options.locator('#rule-shortener')).not.toBeChecked();
  const rejected = await options.locator('#import-file').evaluate((input) => {
    const data = new DataTransfer();
    data.items.add(new File(['{"version":1,"enabled":true,"extra":1}'], 'bad.json', { type: 'application/json' }));
    (input as HTMLInputElement).files = data.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  });
  expect(rejected).toBe(true);
  await expect(options.getByText('設定に未知の項目があります。', { exact: false })).toBeVisible();
  await options.close();
});

test('suggested services can be added as protected domains with one click', async () => {
  const options = await context.newPage();
  await options.goto(`${extension}/options.html`);
  await expect(options.getByRole('button', { name: '変更を保存する' })).toBeEnabled();
  const panel = options.locator('.suggestions');
  await panel.locator('summary').click();
  const chip = panel.getByRole('button', { name: '三菱UFJ銀行（mufg.jp）' });
  await chip.click();
  await expect(options.locator('.list').getByText('mufg.jp', { exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: '三菱UFJ銀行（mufg.jp）' })).toBeDisabled();
  await expect(panel).toHaveJSProperty('open', true);
  await options.getByRole('button', { name: '変更を保存する' }).click();
  await expect(options.getByText('設定を保存して、保護ルールを適用しました。')).toBeVisible();
  const popup = await context.newPage();
  await popup.goto(`${extension}/popup.html`);
  await popup.getByLabel('URL を開かずにチェック').fill('https://mufg.jp.secure-login.test/');
  await popup.getByRole('button', { name: 'この URL を調べる' }).click();
  await expect(popup.locator('.domain')).toHaveText('secure-login.test');
  await popup.locator('.inspection-details > summary').click();
  await expect(popup.getByText('保護対象名が接続先以外にあります', { exact: false })).toBeVisible();
  await options.close(); await popup.close();
});

test('settings footer exposes developer copyright and the email contact', async () => {
  const page = await context.newPage();
  await page.goto(`${extension}/options.html`);
  const footer = page.locator('footer');
  await expect(footer.getByRole('heading', { name: '問い合わせ' })).toBeVisible();
  await expect(footer.getByRole('link', { name: 'bafubafu-bafuu@puripuri.dev' }))
    .toHaveAttribute('href', 'mailto:bafubafu-bafuu@puripuri.dev');
  await expect(footer).toContainText('© 2026 bafubafu-bafuu');
  await page.close();
});

test('toolbar input opens empty and page headers use the bundled icon', async () => {
  const source = await context.newPage();
  await source.goto(`${origin('plain.test')}/source`);
  const popup = await context.newPage();
  await popup.goto(`${extension}/popup.html`);
  await expect(popup.getByLabel('URL を開かずにチェック')).toHaveValue('');
  await expect(popup.locator('.findings')).toHaveCount(0);
  await expect(popup.locator('.brand img')).toHaveAttribute('src', `${extension}/icons/32.png`);
  await expect.poll(() => popup.locator('.brand img').evaluate((element) =>
    element instanceof HTMLImageElement && element.complete && element.naturalWidth === 32)).toBe(true);
  const opened = context.waitForEvent('page');
  await popup.getByRole('button', { name: '詳細設定を開く' }).click();
  const options = await opened;
  await expect(options).toHaveURL(`${extension}/options.html`);
  await options.close(); await popup.close(); await source.close();
});

test('server redirects are checked before reaching an IDN destination', async () => {
  const page = await context.newPage();
  await page.goto(`${origin('plain.test')}/redirect`);
  await expect(page.getByRole('button', { name: '移動をやめる', exact: true })).toBeVisible();
  expect(received.some((item) => item.path === '/redirect')).toBe(true);
  expect(received.some((item) => item.host.startsWith(hostileHost))).toBe(false);
  await page.close();
});

test('toolbar switch persists enabled state without overwriting other settings', async () => {
  const page = await context.newPage();
  await page.goto(`${extension}/options.html`);
  await page.locator('#rule-shortener').uncheck();
  await page.getByRole('button', { name: '変更を保存する' }).click();
  await expect(page.getByText('設定を保存して、保護ルールを適用しました。')).toBeVisible();
  await page.goto(`${extension}/popup.html`);
  const toggle = page.getByRole('switch', { name: 'リンクの検査', exact: true });
  await expect(toggle).toBeEnabled();
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect(page.getByText('リンク検査が無効です', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules()).length)).toBe(0);
  await page.reload();
  await expect(toggle).toBeEnabled();
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(page.getByText('リンク検査が有効です', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules()).length)).toBe(2);
  await page.goto(`${extension}/options.html`);
  await expect(page.locator('#enabled')).toBeChecked();
  await expect(page.locator('#rule-shortener')).not.toBeChecked();
  const input = page.locator('#protected-domain');
  await input.focus();
  const styles = await input.evaluate((element) => {
    const computed = getComputedStyle(element);
    const button = element.parentElement?.querySelector('button');
    if (!button) throw new Error('Missing add button');
    return {
      outline: computed.outlineStyle,
      border: computed.borderTopWidth,
      shadow: computed.boxShadow,
      gap: button.getBoundingClientRect().top - element.getBoundingClientRect().bottom,
    };
  });
  expect(styles.outline).toBe('none');
  expect(styles.border).toBe('1px');
  expect(styles.shadow).toBe('none');
  expect(styles.gap).toBeGreaterThanOrEqual(12);
  await page.close();
});

test('POST is not intercepted or replayed as GET', async () => {
  const page = await context.newPage();
  await page.goto(`${origin('plain.test')}/source`);
  await page.locator('#post').click();
  await expect(page).toHaveTitle('Destination');
  expect(received.filter((item) => item.path === '/post').map((item) => item.method)).toEqual(['POST']);
  await page.close();
});

test('settings persist, manual check performs no network requests, and unauthorized mutation is rejected', async () => {
  const options = await context.newPage();
  await options.goto(`${extension}/options.html`);
  await options.locator('#rule-confusable').uncheck();
  await options.locator('#protected-domain').fill('example.com');
  await options.getByRole('button', { name: '保護対象に追加' }).click();
  await options.getByRole('button', { name: '変更を保存する' }).click();
  await expect(options.getByText('設定を保存して、保護ルールを適用しました。')).toBeVisible();
  await options.reload();
  await expect(options.locator('#rule-confusable')).not.toBeChecked();
  await expect(options.getByText('example.com', { exact: true })).toBeVisible();
  const popup = await context.newPage();
  await popup.goto(`${extension}/popup.html`);
  received.length = 0;
  await popup.getByLabel('URL を開かずにチェック').fill(target());
  await popup.getByRole('button', { name: 'この URL を調べる' }).click();
  await expect(popup.locator('.domain')).toContainText(hostileHost);
  expect(received).toEqual([]);
  const gate = await context.newPage();
  await gate.goto(`${extension}/warning.html#${target()}`);
  const response = await gate.evaluate(async (settings) => chrome.runtime.sendMessage({ type: 'save', settings }), defaults());
  expect(response.ok).toBe(false);
  await options.close(); await popup.close(); await gate.close();
});

test('session tokens survive worker restart without granting an unconfirmed bypass', async () => {
  const gate = await context.newPage();
  await gate.goto(target());
  await expect(gate.getByRole('button', { name: '移動をやめる', exact: true })).toBeEnabled();
  const tokenUrl = gate.url();
  const session = await context.newCDPSession(gate);
  await session.send('ServiceWorker.enable');
  await session.send('ServiceWorker.stopAllWorkers');
  await gate.reload();
  await expect(gate.getByRole('button', { name: '移動をやめる', exact: true })).toBeEnabled();
  expect(gate.url()).toBe(tokenUrl);
  expect(received.some((item) => item.host.startsWith(hostileHost))).toBe(false);
  await gate.getByRole('button', { name: '危険性を理解して今回だけ進む' }).click();
  await expect(gate).toHaveTitle('Destination');
  await session.detach();
  await gate.close();
});

test('warning and settings remain operable in dark theme and enlarged text', async () => {
  const testInfo = test.info();
  const options = await context.newPage();
  await options.setViewportSize({ width: 1280, height: 800 });
  await options.goto(`${extension}/options.html`);
  await options.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expect(options.getByRole('button', { name: '変更を保存する' })).toBeInViewport();
  await options.emulateMedia({ colorScheme: 'dark' });
  await expect(options.getByRole('heading', { name: '詳細設定', exact: true })).toBeVisible();
  if (testInfo.project.name === 'chromium') {
    await options.evaluate(() => { document.documentElement.style.fontSize = ''; });
    await options.emulateMedia({ colorScheme: 'light' });
    await options.screenshot({ path: 'artifacts/screenshots/options.png' });
  }
  const gate = await context.newPage();
  await gate.setViewportSize({ width: 1280, height: 800 });
  await gate.goto(target());
  await expect(gate.getByRole('button', { name: '移動をやめる', exact: true })).toBeInViewport();
  await gate.emulateMedia({ colorScheme: 'dark' });
  await gate.getByRole('button', { name: '移動をやめる', exact: true }).focus();
  await expect(gate.getByRole('button', { name: '移動をやめる', exact: true })).toBeFocused();
  if (testInfo.project.name === 'chromium') {
    await gate.emulateMedia({ colorScheme: 'light' });
    await gate.screenshot({ path: 'artifacts/screenshots/warning.png' });
  }
  await options.close(); await gate.close();
});
