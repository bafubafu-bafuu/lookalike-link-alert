import { analyze, redactUrl, type Analysis } from '../core/analyze';
import { defaults, parseSettings, record } from '../shared/settings';
import { isContextInvalidated, request } from '../shared/messages';

let config = defaults();
let configError: string | null = null;
let errorBanner: HTMLElement | null = null;
let active: HTMLElement | null = null;
function showError(error: unknown): void {
  configError = isContextInvalidated(error)
    ? '拡張が更新されています。このページを再読み込みしてください。'
    : error instanceof Error ? error.message : '拡張と通信できません。';
  console.error('Lookalike Link Alert:', configError);
  if (!errorBanner) {
    errorBanner = document.createElement('div');
    errorBanner.setAttribute('role', 'alert');
    errorBanner.style.cssText = 'position:fixed;bottom:16px;right:16px;max-width:360px;z-index:2147483647;background:Canvas;color:CanvasText;border:1px solid GrayText;padding:12px;font:menu;line-height:1.6';
    (document.documentElement ?? document).append(errorBanner);
  }
  errorBanner.textContent = `Lookalike Link Alert: 検査機能にエラーがあります。拡張アイコンから状態を確認してください。${configError}`;
}
void request({ type: 'config' }).then((settings) => { config = parseSettings(settings); }).catch(showError);
chrome.runtime.onMessage.addListener((value: unknown, sender) => {
  if (sender.id !== chrome.runtime.id || sender.tab || !record(value) || value.type !== 'config-updated') return;
  try { config = parseSettings(value.settings); configError = null; errorBanner?.remove(); errorBanner = null; }
  catch (error) { showError(error); }
});

function node<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  return element;
}
// Inline so that no extension resource has to be web-accessible for the in-page dialog.
function brandIcon(): SVGSVGElement {
  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('aria-hidden', 'true');
  for (const [d, fill] of [
    ['M3.6 2.4h12.8V11L10 18 3.6 11z', '#1a5f5b'],
    ['M9.3 6h1.4v5H9.3zM9.3 12.8h1.4v1.4H9.3z', '#ffffff'],
  ]) {
    const path = document.createElementNS(svgNs, 'path');
    path.setAttribute('d', d!);
    path.setAttribute('fill', fill!);
    svg.append(path);
  }
  return svg;
}
function warn(url: string, text: string, rawHref: string, result: Analysis, newTab: boolean): void {
  active?.remove();
  const host = node('div');
  active = host;
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = node('style', `
    :host { all: initial; }
    dialog { --surface:#ffffff; --ink:#202124; --muted:#5f6368; --line:#dadce0; --danger:#b3261e; --amber:#806000;
      box-sizing:border-box; width:min(600px, calc(100vw - 32px)); max-height:calc(100vh - 40px); overflow:auto;
      color-scheme:light dark; border:1px solid var(--line); border-radius:6px; padding:0;
      background:var(--surface); color:var(--ink); box-shadow:0 4px 20px #0003;
      font:menu; font-size:14px; line-height:1.6; }
    @media (prefers-color-scheme:dark) {
      dialog { --surface:#202124; --ink:#e8eaed; --muted:#bdc1c6; --line:#5f6368; --danger:#f28b82; --amber:#fdd663; }
    }
    dialog::backdrop { background:#0006; }
    .brand { display:flex; align-items:center; gap:8px; margin:0; padding:14px 24px; border-bottom:1px solid var(--line); font-weight:600; }
    .brand svg { width:20px; height:20px; flex-shrink:0; }
    .title { margin:0; padding:18px 24px 0; font-size:22px; font-weight:500; line-height:1.4; }
    .body { padding:8px 24px 20px; }
    p { margin:0 0 12px; }
    bdi { display:block; margin:6px 0; overflow-wrap:anywhere; }
    .destination { padding:16px 0; margin:16px 0; border-bottom:1px solid var(--line); }
    .destination p { margin:0; color:var(--muted); font-size:13px; }
    .destination bdi { font-size:20px; font-weight:600; }
    .reason, article { border-left:2px solid var(--line); margin:20px 0; padding:4px 12px; }
    .level-3 { border-left-color:var(--danger); }
    .level-2 { border-left-color:var(--amber); }
    .level-tag { display:inline-block; font-size:12px; color:var(--muted); margin-right:10px; font-weight:normal; }
    .reason p, article p { margin:0 0 6px; }
    summary { cursor:pointer; padding:8px 0; }
    details { margin:16px 0 0; }
    h3 { font-size:14px; font-weight:600; margin:0 0 8px; }
    dl { display:grid; grid-template-columns:max-content minmax(0, 1fr); gap:4px 16px; font-size:13px; margin:12px 0 0; }
    dt { color:var(--muted); }
    dd { margin:0; overflow-wrap:anywhere; }
    dd bdi { margin:0; }
    .raw-url { white-space:pre-wrap; font-size:13px; }
    .actions { display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding:16px 24px;
      border-top:1px solid var(--line); }
    button { font:inherit; padding:4px 12px; min-height:30px; cursor:pointer; }
    button.primary { font-weight:600; }
    button:hover:not(:disabled) { filter:brightness(.94); }
    button:disabled { opacity:.55; cursor:default; }
    :focus-visible { outline:2px solid Highlight; outline-offset:2px; }
    .error:not(:empty) { color:var(--danger); border:1px solid var(--danger); padding:10px 12px; margin:12px 0; overflow-wrap:anywhere; }
    @media (max-width:480px) { dl { grid-template-columns:1fr; } }
  `);
  const dialog = node('dialog');
  dialog.setAttribute('aria-labelledby', 'll-title');
  const brand = node('div');
  brand.className = 'brand';
  brand.append(brandIcon(), document.createTextNode('Lookalike Link Alert'));
  const title = node('p', 'URL の警告');
  title.className = 'title';
  title.id = 'll-title';
  const destination = node('div');
  destination.className = 'destination';
  const domain = node('bdi', result.domain || '未検査の URL');
  domain.dir = 'ltr';
  destination.append(node('p', '実際の登録可能ドメイン'), domain);
  const primaryFinding = result.findings[0];
  const reason = node('div');
  reason.className = `reason level-${primaryFinding?.level ?? 1}`;
  const reasonTitle = node('h3');
  if (primaryFinding) {
    const level = node('span', primaryFinding.level === 3 ? '強い注意' : primaryFinding.level === 2 ? '要確認' : '参考情報');
    level.className = 'level-tag';
    reasonTitle.append(level);
  }
  reasonTitle.append(document.createTextNode(result.error ?? primaryFinding?.title ?? 'URL を検査できませんでした'));
  reason.append(reasonTitle);
  if (primaryFinding) reason.append(node('p', primaryFinding.detail));
  const errors = node('p'); errors.className = 'error'; errors.setAttribute('role', 'alert');
  if (configError) errors.textContent = `保護状態に問題があります: ${configError}`;
  const cancel = node('button', '移動をやめる'); cancel.className = 'primary';
  const inspectionDetails = node('details');
  inspectionDetails.append(node('summary', '検査の詳細'));
  for (const finding of result.findings) {
    const item = node('article');
    item.className = `level-${finding.level}`;
    const evidence = node('bdi', finding.evidence);
    evidence.dir = 'ltr';
    const title = node('h3');
    const level = node('span', finding.level === 3 ? '強い注意' : finding.level === 2 ? '要確認' : '参考情報');
    level.className = 'level-tag';
    title.append(level, document.createTextNode(finding.title));
    item.append(title, node('p', finding.detail), evidence);
    inspectionDetails.append(item);
  }
  const representations = node('dl');
  for (const [label, value] of [
    ['Unicode', result.unicodeHost],
    ['Punycode / ASCII', result.asciiHost],
  ]) {
    const data = node('bdi', value);
    data.dir = 'ltr';
    const description = node('dd');
    description.append(data);
    representations.append(node('dt', label), description);
  }
  inspectionDetails.insertBefore(representations, inspectionDetails.children[1] ?? null);
  const inspectedUrl = node('bdi', redactUrl(url));
  inspectedUrl.dir = 'ltr';
  inspectedUrl.className = 'raw-url';
  inspectionDetails.append(node('p', '検査した URL'), inspectedUrl);
  const review = node('button', '確認画面を開く');
  review.disabled = result.status === 'uninspected';
  const reload = node('button', 'ページを再読み込み');
  reload.hidden = true;
  reload.addEventListener('click', () => location.reload());
  const previous = document.activeElement;
  function close(): void {
    dialog.close(); host.remove(); active = null;
    if (previous instanceof HTMLElement) previous.focus();
  }
  cancel.addEventListener('click', close);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
  review.addEventListener('click', () => {
    review.disabled = true;
    void request({
      type: 'open-warning', url, text, rawHref, newTab,
    }).then(close).catch((error: unknown) => {
      if (isContextInvalidated(error)) {
        errors.textContent = '拡張が更新されています。確認画面を開くには、このページを再読み込みしてください。入力中の内容は失われる場合があります。';
        reload.hidden = false;
        review.disabled = true;
      } else {
        errors.textContent = error instanceof Error ? error.message : '警告ページを開けません。';
        review.disabled = false;
      }
    });
  });
  const body = node('div');
  body.className = 'body';
  body.append(destination, reason, inspectionDetails, errors);
  const actions = node('div'); actions.className = 'actions'; actions.append(cancel, reload, review);
  dialog.append(brand, title, body, actions);
  shadow.append(style, dialog);
  (document.documentElement ?? document).append(host);
  dialog.showModal();
  cancel.focus();
}
function onLink(event: MouseEvent): void {
  // Synthetic clicks would let the page probe which hosts are protected or excepted.
  if (!event.isTrusted || event.defaultPrevented || !config.enabled || (event.type === 'click' ? event.button !== 0 : event.button !== 1)) return;
  const anchor = event.composedPath().find((element): element is HTMLAnchorElement => element instanceof HTMLAnchorElement);
  if (!anchor || anchor.hasAttribute('download') || !['http:', 'https:'].includes(anchor.protocol)) return;
  // Same-document anchors are not new network navigations.
  const destination = new URL(anchor.href);
  const current = new URL(location.href);
  destination.hash = ''; current.hash = '';
  if (destination.href === current.href && anchor.hash) return;
  const text = (anchor.textContent ?? '').slice(0, 2000);
  const rawHref = anchor.getAttribute('href') ?? '';
  const result = analyze(anchor.href, config, text, rawHref);
  if (!result.warn) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  warn(anchor.href, text, rawHref, result, event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1 || anchor.target === '_blank');
}
document.addEventListener('click', onLink, true);
document.addEventListener('auxclick', onLink, true);
