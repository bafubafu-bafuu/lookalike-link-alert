import { record, type Settings } from './settings';
import type { Analysis } from '../core/analyze';

export interface State {
  settings: Settings;
  error: string | null;
  hostAccess: boolean;
  initialized: boolean;
}
export interface Gate { token: string; result: Analysis; canProceed: boolean; source: 'dnr' | 'link' }
export type Request =
  | { type: 'config' }
  | { type: 'state' }
  | { type: 'save'; settings: Settings }
  | { type: 'set-enabled'; enabled: boolean }
  | { type: 'check'; url: string }
  | { type: 'open-warning'; url: string; text: string; rawHref: string; newTab: boolean }
  | { type: 'gate'; value: string }
  | { type: 'continue'; token: string }
  | { type: 'auto-continue'; token: string }
  | { type: 'cancel'; token: string }
  | { type: 'leave' };

export interface Responses {
  config: Settings;
  state: State;
  save: State;
  'set-enabled': State;
  check: Analysis;
  'open-warning': null;
  gate: Gate;
  continue: null;
  'auto-continue': null;
  cancel: null;
  leave: null;
}

export function isContextInvalidated(error: unknown): boolean {
  return error instanceof Error && error.message.includes('Extension context invalidated');
}

export async function request<T extends Request['type']>(
  message: Extract<Request, { type: T }>,
): Promise<Responses[T]> {
  const response: unknown = await chrome.runtime.sendMessage(message);
  if (!record(response) || typeof response.ok !== 'boolean') throw new Error('拡張の応答を確認できません。');
  if (!response.ok) throw new Error(typeof response.error === 'string' ? response.error : '拡張で処理できませんでした。');
  return response.value as Responses[T];
}
