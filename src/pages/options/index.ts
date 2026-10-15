import { defaults, parseSettings, importSettings, RULES, RULE_IDS, canonicalHost, MAX_SETTINGS_BYTES } from '../../shared/settings';
import { request } from '../../shared/messages';
import { el, root, header, button, notice, message } from '../../shared/ui';

const app = root();
app.append(header());
const main = el('main');
main.append(el('h1', '', '詳細設定'),
  el('p', 'lead', '検査項目と警告の条件を設定します。設定はこの端末に保存されます。'));
const status = el('div');
status.setAttribute('aria-live', 'polite');
const errors = el('div');
errors.hidden = true;
const body = el('div');
main.append(status, errors, body);
app.append(main);
let draft = defaults();
let dirty = false;
let saving = false;
const save = button('変更を保存する', saveSettings, 'button primary');
const saveStatus = el('span', 'muted', '変更は保存してから適用されます');
const actions = el('div', 'actions sticky-actions');
actions.append(save, saveStatus);
main.append(actions);
main.insertBefore(actions, body);
const footer = el('footer', 'footer');
const contact = el('section');
contact.append(el('h2', '', '問い合わせ'));
const email = el('a', '', 'bafubafu-bafuu@puripuri.dev');
email.href = 'mailto:bafubafu-bafuu@puripuri.dev';
contact.append(email);
footer.append(contact, el('p', 'copyright', '© 2026 bafubafu-bafuu'));
main.append(footer);
window.addEventListener('beforeunload', (event) => {
  if (dirty) { event.preventDefault(); event.returnValue = ''; }
});
function changed(): void {
  dirty = true;
  draft.mode = 'custom';
  saveStatus.textContent = '未保存の変更があります';
}
function section(title: string, description?: string): HTMLElement {
  const card = el('section', 'card');
  card.append(el('h2', '', title));
  if (description) card.append(el('p', 'muted', description));
  body.append(card);
  return card;
}
function toggle(id: string, label: string, description: string, checked: boolean, update: (value: boolean) => void): HTMLElement {
  const row = el('div', 'toggle-row');
  const input = el('input');
  input.type = 'checkbox'; input.id = id; input.checked = checked;
  input.addEventListener('change', () => { update(input.checked); changed(); });
  const text = el('label', '', label);
  text.htmlFor = id;
  text.append(el('span', 'muted', description));
  row.append(input, text);
  return row;
}
function render(): void {
  body.replaceChildren();
  const intro = section('検査の対象と制限');
  intro.append(el('p', '', '検査するのは URL の特徴です。詐欺サイトの網羅的な判定ではありません。警告が出なくても、安全とは限りません。'),
    el('p', 'muted', '通常のページ上のリンクを移動前に検査します。一部の国際化ドメインと @ を含む GET 遷移は Chrome のルールでも事前検査します。直接入力・右クリックメニュー・ページのスクリプト・POST・iframe など、同じ検査ができない経路があります。'),
    el('p', 'muted', 'HTTP / HTTPS のサイトアクセス権限は、リンクと URL を端末内で検査するために必要です。Cookie・ブックマーク・閲覧履歴の権限は要求しません。シークレットモードには対応していません。'));
  const protection = section('保護と警告の強さ');
  protection.append(toggle('enabled', 'リンクの検査を有効にする', '無効にすると、この拡張の自動警告と事前検査ルールが停止します。', draft.enabled, (value) => { draft.enabled = value; }));
  const presets = el('div', 'actions');
  for (const [mode, label] of [['normal', '通常に戻す'], ['careful', '慎重に確認する']] as const) {
    presets.append(button(label, () => {
      const preset = defaults(mode);
      draft = { ...preset, protectedDomains: draft.protectedDomains, exceptions: draft.exceptions };
      dirty = true; render(); saveStatus.textContent = `「${label}」を選択しました。保存すると適用されます`;
    }));
  }
  protection.append(presets, el('p', 'muted', '通常：要確認・強い注意を警告。慎重：参考情報も確認し、日本語 IDN 自体の確認も有効にします。保護対象とホスト例外はプリセットで消えません。'));
  const levelField = el('div', 'field');
  const levelLabel = el('label', '', '確認画面を表示する最低レベル');
  levelLabel.htmlFor = 'warn-level';
  const level = el('select'); level.id = 'warn-level';
  for (const [value, text] of [['1', '参考情報以上（慎重）'], ['2', '要確認以上（通常）'], ['3', '強い注意のみ']]) {
    const option = el('option', '', text); option.value = value!; level.append(option);
  }
  level.value = String(draft.warnLevel);
  level.addEventListener('change', () => {
    const value = Number(level.value);
    if (value === 1 || value === 2 || value === 3) { draft.warnLevel = value; changed(); }
  });
  levelField.append(levelLabel, level); protection.append(levelField);
  const checks = section('検査項目', '日本語 IDN の警告をオフにしても、類似文字・混在・保護対象の偽装などは独立して検査します。');
  for (const id of RULE_IDS) checks.append(toggle(`rule-${id}`, RULES[id][0], RULES[id][1], draft.rules[id], (value) => { draft.rules[id] = value; }));
  const thresholds = section('構造チェックの閾値', 'これらは単独では参考情報です。URL を解析できる上限は 8192 文字です。');
  for (const [key, label, min, max] of [
    ['maxLabels', 'ドメインのラベル数（これを超えると注意）', 3, 20],
    ['longUrlLength', 'URL の文字数（これを超えると注意）', 256, 8192],
  ] as const) {
    const field = el('div', 'field');
    const caption = el('label', '', label); caption.htmlFor = key;
    const input = el('input'); input.type = 'number'; input.id = key;
    input.min = String(min); input.max = String(max); input.step = '1'; input.value = String(draft[key]);
    input.addEventListener('input', () => { draft[key] = Number(input.value); changed(); });
    field.append(caption, input); thresholds.append(field);
  }
  domainSection();
  exceptionsSection();
  transferSection();
  const reset = section('設定をすべて初期化');
  reset.append(el('p', 'muted', '保護対象・ホスト例外を含む設定を初期状態に置き換えます。保存するまでは適用されません。'));
  const confirm = el('input'); confirm.type = 'checkbox'; confirm.id = 'confirm-reset';
  const label = el('label', '', '登録内容が消えることを確認しました'); label.htmlFor = confirm.id;
  const confirmation = el('div', 'toggle-row');
  confirmation.append(confirm, label);
  reset.append(confirmation, button('初期値に置き換える', () => {
    if (!confirm.checked) { notice(errors, '初期化の確認にチェックを入れてください。'); return; }
    draft = defaults(); dirty = true; render(); saveStatus.textContent = '初期化は未保存です';
  }));
}
function domainSection(): void {
  const card = section('保護したい正規ドメイン', 'よく使う銀行・買い物・ログイン先の正規ドメインを登録すると、似た綴りや偽装との比較に使えます。登録そのものが安全性の保証になるわけではありません。');
  const list = el('ul', 'list');
  for (const host of draft.protectedDomains) {
    const item = el('li'); item.append(el('bdi', '', host), button('削除', () => {
      draft.protectedDomains = draft.protectedDomains.filter((value) => value !== host); changed(); render();
    }, 'text-button')); list.append(item);
  }
  const field = el('div', 'field');
  const label = el('label', '', '追加する正規ドメイン'); label.htmlFor = 'protected-domain';
  const input = el('input'); input.type = 'text'; input.id = 'protected-domain'; input.placeholder = 'example.com'; input.maxLength = 253;
  field.append(label, input, button('保護対象に追加', () => {
    try {
      const host = canonicalHost(input.value);
      if (draft.protectedDomains.includes(host)) throw new Error('すでに登録されています。');
      if (draft.protectedDomains.length >= 100) throw new Error('保護対象は 100 件までです。');
      draft.protectedDomains.push(host); changed(); render();
    } catch (cause) { notice(errors, message(cause)); }
  }));
  card.append(list, field);
}
function exceptionsSection(): void {
  const card = section('警告を省略するホスト', '完全一致が既定です。登録したホストでは警告を省略しますが、手動チェックで理由を確認できます。');
  const list = el('ul', 'list');
  draft.exceptions.forEach((exception, index) => {
    const item = el('li');
    item.append(el('bdi', '', `${exception.host}${exception.subdomains ? '（サブドメインも含む）' : '（完全一致）'}`),
      button('削除', () => { draft.exceptions.splice(index, 1); changed(); render(); }, 'text-button'));
    list.append(item);
  });
  const label = el('label', '', '例外にするホスト'); label.htmlFor = 'exception-host';
  const input = el('input'); input.type = 'text'; input.id = 'exception-host'; input.maxLength = 253;
  const subdomains = el('input'); subdomains.type = 'checkbox'; subdomains.id = 'exception-subdomains';
  const sublabel = el('label', '', 'このホスト配下の全サブドメインも許可する（範囲が広がります）'); sublabel.htmlFor = subdomains.id;
  const field = el('div', 'field');
  const subdomainOption = el('div', 'toggle-row');
  subdomainOption.append(subdomains, sublabel);
  field.append(label, input, subdomainOption, button('例外に追加', () => {
    try {
      const host = canonicalHost(input.value);
      if (draft.exceptions.some((item) => item.host === host)) throw new Error('すでに例外に登録されています。');
      if (draft.exceptions.length >= 100) throw new Error('例外は 100 件までです。');
      draft.exceptions.push({ host, subdomains: subdomains.checked }); changed(); render();
    } catch (cause) { notice(errors, message(cause)); }
  }));
  card.append(list, field);
}
function transferSection(): void {
  const card = section('設定のバックアップ', 'URL の閲覧履歴は含みません。登録した保護対象・例外のドメイン名は含まれるので、公開しないでください。');
  card.append(button('設定を JSON で保存', () => {
    try {
      const data = parseSettings(draft);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = el('a'); link.href = url; link.download = 'lookalike-link-alert-settings.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { notice(errors, message(cause)); }
  }));
  const field = el('div', 'field');
  const label = el('label', '', '設定ファイルを選択'); label.htmlFor = 'import-file';
  const input = el('input'); input.type = 'file'; input.id = 'import-file'; input.accept = '.json,application/json';
  const preview = el('div');
  input.addEventListener('change', () => {
    void (async () => {
      try {
        const file = input.files?.[0];
        if (!file) return;
        if (file.size > MAX_SETTINGS_BYTES) throw new Error('設定ファイルは 100 KB 以下にしてください。');
        const imported = importSettings(await file.text());
        preview.replaceChildren(el('p', 'notice', `保護対象 ${imported.protectedDomains.length} 件 / 例外 ${imported.exceptions.length} 件。現在の設定を置き換えます。`),
          button('この内容を設定画面に取り込む', () => {
            draft = imported; dirty = true; render(); saveStatus.textContent = '取り込んだ設定は未保存です。内容を確認して保存してください。';
          }));
      } catch (cause) { preview.replaceChildren(); notice(errors, message(cause)); }
    })();
  });
  field.append(label, input, preview); card.append(field);
}
async function saveSettings(): Promise<void> {
  if (saving) return;
  saving = true; save.disabled = true; errors.hidden = true;
  try {
    const state = await request({ type: 'save', settings: parseSettings(draft) });
    draft = state.settings; dirty = false;
    notice(status, '設定を保存して、保護ルールを適用しました。', 'success');
    if (!state.hostAccess) notice(errors, 'サイトアクセス権限がないため、自動保護は利用できません。Chrome の拡張機能管理で権限を確認してください。');
    saveStatus.textContent = '保存済み';
  } catch (cause) { notice(errors, `未適用: ${message(cause)}`); }
  finally { saving = false; save.disabled = false; }
}
async function load(): Promise<void> {
  save.disabled = true;
  try {
    const state = await request({ type: 'state' });
    draft = state.settings;
    if (state.error) notice(errors, state.error);
    if (!state.hostAccess) notice(errors, 'サイトへのアクセス権限がありません。Chrome の拡張機能管理でサイトアクセスを確認してください。');
    render();
    save.disabled = false;
  } catch (cause) { notice(errors, message(cause)); }
}
void load();
