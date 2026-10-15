export function networkUrl(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('HTTP / HTTPS の URL だけを扱えます。');
  if (url.username || url.password) throw new Error('ユーザー情報を含む URL への継続は許可しません。');
  url.hash = '';
  return url.href;
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function exactGetRule(id: number, tabId: number, url: string): chrome.declarativeNetRequest.Rule {
  return {
    id, priority: 100,
    action: { type: chrome.declarativeNetRequest.RuleActionType.ALLOW },
    condition: {
      regexFilter: `^${escapeRegex(networkUrl(url))}(#.*)?$`,
      isUrlFilterCaseSensitive: true,
      tabIds: [tabId],
      resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
      requestMethods: [chrome.declarativeNetRequest.RequestMethod.GET],
    },
  };
}
