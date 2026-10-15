import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

test('DNR redirects before GET, preserves query/fragment, and bypass is tab scoped', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lookalike-link-alert-spike-'));
  const received: string[] = [];
  const server = createServer((req, res) => {
    received.push(req.url ?? '');
    res.end('<title>Destination</title>local fixture');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  const target = `http://127.0.0.1:${address.port}/protected?q=%23%26&x=1#original`;
  await writeFile(join(root, 'manifest.json'), JSON.stringify({
    manifest_version: 3, name: 'Lookalike Link Alert navigation spike', version: '0.0.1',
    permissions: ['declarativeNetRequest'],
    host_permissions: ['http://127.0.0.1/*'],
    background: { service_worker: 'worker.js' },
    web_accessible_resources: [{ resources: ['gate.html'], matches: ['http://127.0.0.1/*'] }],
  }));
  await writeFile(join(root, 'worker.js'), `
    chrome.runtime.onInstalled.addListener(async () => {
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: [{
          id: 1, priority: 1,
          action: { type: 'redirect', redirect: { regexSubstitution: chrome.runtime.getURL('gate.html') + '#\\\\0' } },
          condition: { regexFilter: '^http://127\\\\.0\\\\.0\\\\.1:[0-9]+/protected.*', resourceTypes: ['main_frame'], requestMethods: ['get'] }
        }]
      });
    });
  `);
  await writeFile(join(root, 'gate.html'), '<title>Gate</title>');
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    await expect.poll(() => worker.evaluate(async () =>
      (await chrome.declarativeNetRequest.getDynamicRules()).length)).toBe(1);
    const page = await context.newPage();
    await page.goto(target);
    await expect(page).toHaveTitle('Gate');
    expect(received.filter((url) => url.startsWith('/protected'))).toEqual([]);
    const captured = new URL(page.url()).hash.slice(1);
    expect(captured).toBe(target);
    await worker.evaluate(async (url) => {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find((item) => item.url?.includes('gate.html'));
      if (tab?.id === undefined) throw new Error('Missing gate tab');
      await chrome.declarativeNetRequest.updateSessionRules({
        addRules: [{
          id: 100, priority: 100,
          action: { type: chrome.declarativeNetRequest.RuleActionType.ALLOW },
          condition: {
            tabIds: [tab.id], regexFilter: '^' + url.split('#')[0]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(#.*)?$',
            resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
            requestMethods: [chrome.declarativeNetRequest.RequestMethod.GET],
          },
        }],
      });
    }, target);
    await page.goto(target);
    await expect(page).toHaveTitle('Destination');
    expect(received.filter((url) => url.startsWith('/protected'))).toHaveLength(1);
    const other = await context.newPage();
    await other.goto(target);
    await expect(other).toHaveTitle('Gate');
    expect(received.filter((url) => url.startsWith('/protected'))).toHaveLength(1);
    console.log('SPIKE: pre-request redirect, fragment/query preservation, exact tab-scoped GET allow verified');
  } finally {
    await context.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
