import { readFileSync } from 'node:fs';
import type { EditorBinary } from './helpers.js';

export interface FixtureInventory {
  version: number;
  defaultModes: string[];
  defaultEditors: string[];
  editorOverrides: Record<string, string[]>;
  suites: Record<string, string[]>;
  headlessOnly: Record<string, string>;
  restart: string[];
  mediaOptIn: string[];
  excluded: Record<string, string>;
}
export const fixtureInventory = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8')) as FixtureInventory;
export function editorFixtures(suite: string, editor: EditorBinary): string[] {
  const key = editor.name === 'Neovim' ? 'nvim' : 'vim';
  return (fixtureInventory.suites[suite] ?? []).filter(name =>
    (fixtureInventory.editorOverrides[name] ?? fixtureInventory.defaultEditors).includes(key));
}
