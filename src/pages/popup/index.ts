import { request, type State } from '../../shared/messages';
import { redactUrl } from '../../core/analyze';
import { el, root, header, button, findingsView, notice, message } from '../../shared/ui';

const app = root();
app.append(header());
const main = el('main');
const protection = el('div', 'protection-control');
const protectionLabel = el('label', '', 'リンクの検査');
protectionLabel.htmlFor = 'protection-enabled';
const protectionSwitch = el('input', 'protection-switch');
protectionSwitch.type = 'checkbox';
protectionSwitch.id = 'protection-enabled';
protectionSwitch.setAttribute('role', 'switch');
protectionSwitch.disabled = true;
protection.append(protectionLabel, protectionSwitch);
const status = el('p', 'status', '保護状態を確認しています');
const error = el('div');
error.hidden = true;
const result = el('div');
status.setAttribute('aria-live', 'polite');
main.append(protection, status, error);
const form = el('form', 'card');
const label = el('label', '', 'URL を開かずにチェック');
label.htmlFor = 'url';
const input = el('input');
input.type = 'text'; input.id = 'url'; input.placeholder = 'https://example.com/'; input.maxLength = 8192;
input.autocomplete = 'off'; input.spellcheck = false;
const submit = el('button', 'button primary', 'この URL を調べる');
submit.type = 'submit';
form.append(label, input, el('div', 'actions'));
form.lastElementChild!.append(submit);
form.addEventListener('submit', (event) => {
  event.preventDefault();
  void check(input.value);
});
main.append(form, result, button('詳細設定を開く', async () => {
  try { await chrome.tabs.create({ url: chrome.runtime.getURL('options.html') }); }
  catch (cause) { notice(error, message(cause)); }
}, 'button'));
main.append(el('p', 'footer', 'URL の外部送信なし。検査結果は安全性の保証ではありません。'));
app.append(main);
let enabled = false;
function renderState(state: State): void {
  enabled = state.settings.enabled;
  protectionSwitch.checked = enabled;
  const disabled = !enabled || !state.hostAccess || state.error !== null;
  status.classList.toggle('off', disabled);
  status.textContent = state.error ? '保護にエラーがあります' : !enabled ? 'リンク検査が無効です' :
    !state.hostAccess ? 'サイトアクセス権限が不足しています' : 'リンク検査が有効です';
  if (state.error) notice(error, state.error);
}
protectionSwitch.addEventListener('change', () => {
  const next = protectionSwitch.checked;
  protectionSwitch.disabled = true;
  error.hidden = true;
  void request({ type: 'set-enabled', enabled: next }).then((state) => {
    renderState(state);
    result.replaceChildren();
  }).catch((cause: unknown) => {
    protectionSwitch.checked = enabled;
    notice(error, `切り替えできませんでした: ${message(cause)}`);
  }).finally(() => { protectionSwitch.disabled = false; });
});

async function check(url: string): Promise<void> {
  error.hidden = true; submit.disabled = true;
  try {
    result.replaceChildren(findingsView(await request({ type: 'check', url }), true));
    input.value = redactUrl(url);
  }
  catch (cause) { notice(error, message(cause)); }
  finally { submit.disabled = false; }
}
async function load(): Promise<void> {
  try {
    const state = await request({ type: 'state' });
    renderState(state);
    protectionSwitch.disabled = false;
  } catch (cause) { notice(error, message(cause)); }
}
void load();
