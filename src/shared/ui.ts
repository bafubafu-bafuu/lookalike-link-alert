import '../pages/style.css';
import type { Analysis } from '../core/analyze';

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, className = '', text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
export function root(): HTMLElement {
  const node = document.getElementById('app');
  if (!node) throw new Error('画面のルートがありません。');
  return node;
}
export function header(): HTMLElement {
  const bar = el('header', 'topbar');
  const brand = el('a', 'brand');
  const icon = el('img', 'brand-icon');
  icon.src = chrome.runtime.getURL('icons/32.png');
  icon.alt = '';
  icon.width = 20;
  icon.height = 20;
  brand.append(icon, document.createTextNode('Lookalike Link Alert'));
  brand.href = 'options.html';
  brand.target = '_blank';
  brand.rel = 'noopener noreferrer';
  bar.append(brand);
  return bar;
}
export function button(text: string, action: () => void | Promise<void>, className = 'button'): HTMLButtonElement {
  const node = el('button', className, text);
  node.type = 'button';
  node.addEventListener('click', () => { void action(); });
  return node;
}
export function notice(container: HTMLElement, message: string, kind: 'error' | 'success' = 'error'): void {
  container.replaceChildren();
  container.className = `notice ${kind}`;
  container.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  container.textContent = message;
  container.hidden = false;
}
export function message(error: unknown): string {
  return error instanceof Error ? error.message : '処理できませんでした。';
}
export function findingsView(result: Analysis, collapsed = false): HTMLElement {
  const panel = el('section', 'findings');
  if (result.status === 'uninspected') {
    panel.append(el('p', 'notice error', result.error ?? '未検査です。'));
    return panel;
  }
  const destination = el('div', 'destination');
  destination.append(el('p', 'eyebrow', '実際の登録可能ドメイン'));
  const domain = el('bdi', 'domain', result.domain);
  domain.dir = 'ltr';
  destination.append(domain);
  const representations = el('dl', 'representations');
  const inspectionDetails = el('details', 'inspection-details');
  inspectionDetails.open = !collapsed;
  inspectionDetails.append(el('summary', '', '検査の詳細'));
  for (const [name, value] of [['Unicode', result.unicodeHost], ['Punycode / ASCII', result.asciiHost]]) {
    const data = el('dd');
    const isolated = el('bdi', '', value);
    isolated.dir = 'ltr';
    data.append(isolated);
    representations.append(el('dt', '', name), data);
  }
  inspectionDetails.append(representations);
  panel.append(destination);
  if (result.excepted) panel.append(el('p', 'notice', 'このホストは利用者の例外設定に含まれています。安全性を保証する登録ではありません。'));
  if (!result.findings.length) {
    panel.append(el('p', 'notice success', '今回の検査項目では注意点は見つかりませんでした。サイトの安全性を保証するものではありません。'));
  }
  for (const finding of result.findings) {
    const item = el('article', `finding level-${finding.level}`);
    const title = el('h3');
    title.append(el('span', 'level-tag', finding.level === 3 ? '強い注意' : finding.level === 2 ? '要確認' : '参考情報'),
      document.createTextNode(finding.title));
    item.append(title, el('p', '', finding.detail));
    const evidence = el('bdi', 'evidence', finding.evidence);
    evidence.dir = 'ltr';
    item.append(evidence);
    inspectionDetails.append(item);
  }
  const details = el('details', 'url-details');
  details.append(el('summary', '', '検査した URL を見る'));
  const safeUrl = el('bdi', 'raw-url', result.url);
  safeUrl.dir = 'ltr';
  details.append(safeUrl, el('p', 'muted', 'ユーザー情報は伏せています。URL に個人情報が含まれる場合は共有しないでください。'));
  inspectionDetails.append(details);
  panel.append(inspectionDetails);
  return panel;
}
