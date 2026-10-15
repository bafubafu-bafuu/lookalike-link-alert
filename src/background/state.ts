import { record } from '../shared/settings';

export interface Pending {
  token: string;
  tabId: number;
  url: string;
  text: string;
  rawHref: string;
  expires: number;
  source: 'dnr' | 'link';
  // True when the extension created the tab for this review, so cancelling may close it.
  opened: boolean;
}
export interface Bypass { id: number; tabId: number; url: string; expires: number }

export const HOST_ORIGINS = ['http://*/*', 'https://*/*'];
export const PENDING_TTL_MS = 10 * 60_000;
export const BYPASS_TTL_MS = 60_000;
export const MAX_PENDING = 200;
// Session rule IDs start above any dynamic rule ID so the two sets can never collide.
export const FIRST_BYPASS_ID = 10_000;

export function isPending(value: unknown): value is Pending {
  return record(value) && typeof value.token === 'string' && typeof value.tabId === 'number' &&
    typeof value.url === 'string' && typeof value.text === 'string' && typeof value.rawHref === 'string' && typeof value.expires === 'number' &&
    (value.source === 'dnr' || value.source === 'link') && typeof value.opened === 'boolean';
}
export function isBypass(value: unknown): value is Bypass {
  return record(value) && typeof value.id === 'number' && typeof value.tabId === 'number' &&
    typeof value.url === 'string' && typeof value.expires === 'number';
}

export function prunePending(entries: Pending[], now: number, tabId?: number): Pending[] {
  return entries.filter((item) => item.expires > now && item.tabId !== tabId);
}
export function splitBypasses(entries: Bypass[], now: number, tabId?: number): { keep: Bypass[]; removed: Bypass[] } {
  const removed = entries.filter((item) => item.expires <= now || item.tabId === tabId);
  return { keep: entries.filter((item) => !removed.includes(item)), removed };
}
export function nextBypassId(entries: Bypass[]): number {
  return Math.max(FIRST_BYPASS_ID, ...entries.map((item) => item.id + 1));
}
// When the queue is full, the oldest reviews are dropped so a burst of warning tabs cannot block new ones.
export function admitPending(entries: Pending[], entry: Pending, max = MAX_PENDING): Pending[] {
  const sorted = [...entries].sort((a, b) => a.expires - b.expires);
  return [...sorted.slice(Math.max(0, sorted.length - (max - 1))), entry];
}
export function findPending(entries: Pending[], token: string, tabId: number, now: number): Pending | undefined {
  return entries.find((item) => item.token === token && item.tabId === tabId && item.expires > now);
}
