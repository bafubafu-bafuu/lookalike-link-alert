import { request } from '../../shared/messages';
import { el, root, header, button, findingsView, notice, message } from '../../shared/ui';

const app = root();
app.append(header());
const main = el('main', 'warning-wrap');
const heading = el('h1', 'warning-heading', 'URL の警告');
main.append(heading);
const error = el('div');
error.hidden = true;
const content = el('div');
const actions = el('div', 'actions sticky-actions');
main.append(error, actions, content,
  el('p', 'footer', '端末内だけで検査しています。サイトの安全性を保証するものではありません。ページ内の情報は検査しません。'));
app.append(main);
heading.tabIndex = -1;
heading.focus();

async function load(): Promise<void> {
  if (window.top !== window) {
    notice(error, 'この画面は埋め込み表示では利用できません。');
    return;
  }
  try {
    const gate = await request({ type: 'gate', value: location.hash.slice(1) });
    // Replace the public URL payload with a session token; do not retain the target in page history.
    history.replaceState(null, '', `#token=${gate.token}`);
    content.append(findingsView(gate.result));
    if (!gate.result.warn && gate.result.status === 'checked' && gate.source === 'dnr' && gate.canProceed) {
      heading.textContent = '検査が完了しました';
      await request({ type: 'auto-continue', token: gate.token });
      return;
    }
    const cancel = button('移動をやめる', async () => {
      cancel.disabled = true;
      try { await request({ type: 'cancel', token: gate.token }); }
      catch (cause) { notice(error, message(cause)); cancel.disabled = false; }
    }, 'button primary');
    const proceed = button('危険性を理解して今回だけ進む', async () => {
      proceed.disabled = true;
      try { await request({ type: 'continue', token: gate.token }); }
      catch (cause) { notice(error, message(cause)); proceed.disabled = false; }
    });
    proceed.disabled = !gate.canProceed;
    actions.append(cancel, proceed);
    if (!gate.canProceed) content.append(el('p', 'notice error', 'ユーザー情報を含む URL にはこの画面から進めません。信頼できる方法で正規サイトを開いてください。'));
    const settingsLink = el('a', '', '例外・検査項目を設定する');
    settingsLink.href = chrome.runtime.getURL('options.html');
    settingsLink.target = '_blank';
    settingsLink.rel = 'noopener noreferrer';
    main.append(settingsLink);
  } catch (cause) {
    notice(error, message(cause));
    const back = button('前のページへ戻る', async () => {
      back.disabled = true;
      try { await request({ type: 'leave' }); }
      catch (leaveError) { notice(error, message(leaveError)); back.disabled = false; }
    }, 'button primary');
    actions.append(back);
  }
}
void load();
