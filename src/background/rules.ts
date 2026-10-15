import { type Settings } from '../shared/settings';

export function candidateRules(settings: Settings): chrome.declarativeNetRequest.Rule[] {
  if (!settings.enabled) return [];
  const idn = ['confusable', 'mixedScript', 'invisible', 'japaneseIdn', 'otherIdn', 'lookalike']
    .some((id) => settings.rules[id as keyof Settings['rules']]);
  const patterns: string[] = [];
  if (idn) patterns.push('^https?://[^/?#]*xn--[^/?#]*(/.*)?$');
  if (settings.rules.userinfo) patterns.push('^https?://[^/?#]*@[^/?#]*(/.*)?$');
  return patterns.map((regexFilter, index) => ({
    id: index + 1, priority: 1,
    action: {
      type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
      redirect: { regexSubstitution: `${chrome.runtime.getURL('warning.html')}#\\0` },
    },
    condition: {
      regexFilter,
      resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
      requestMethods: [chrome.declarativeNetRequest.RequestMethod.GET],
    },
  }));
}
