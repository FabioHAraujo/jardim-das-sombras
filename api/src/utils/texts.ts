import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

export type TextsTree = { [key: string]: string | TextsTree };

let texts: TextsTree = {};

export function loadTexts(): TextsTree {
  const file = path.join(config.DATA_PATH, 'texts.json');
  texts = JSON.parse(fs.readFileSync(file, 'utf-8'));
  return texts;
}

export function getTexts(): TextsTree {
  return texts;
}

export function saveTexts(newTexts: TextsTree): void {
  const file = path.join(config.DATA_PATH, 'texts.json');
  fs.writeFileSync(file, JSON.stringify(newTexts, null, 2), 'utf-8');
  texts = newTexts;
}

function lookup(key: string): string | undefined {
  let cur: any = texts;
  for (const part of key.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

/**
 * Resolve uma chave ("publicPage.title") substituindo {placeholders}.
 * {gameName}, {gameEmoji} e {ecosystem} são sempre disponíveis.
 */
export function t(key: string, vars: Record<string, string | number> = {}, fallback = ''): string {
  const base: Record<string, string | number> = {
    gameName: lookup('gameName') ?? 'Jardim das Sombras',
    gameEmoji: lookup('gameEmoji') ?? '🦇',
    ecosystem: lookup('ecosystem') ?? '',
    ...vars,
  };
  const raw = lookup(key) ?? fallback ?? key;
  return raw.replace(/\{(\w+)\}/g, (_, k) => (base[k] !== undefined ? String(base[k]) : `{${k}}`));
}

try {
  loadTexts();
} catch (err) {
  console.error('⚠️ Não foi possível carregar texts.json:', err);
}
