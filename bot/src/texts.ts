// Textos/emojis editáveis via painel /super-admin (servidos pela API em GET /texts)
type Tree = { [k: string]: string | Tree };

let texts: Tree = {};
const API_URL = process.env.API_URL || 'http://localhost:3040';

export async function refreshTexts(): Promise<void> {
  try {
    const res = await fetch(`${API_URL}/texts`);
    if (res.ok) texts = (await res.json()) as Tree;
  } catch {
    /* mantém cache anterior */
  }
}

function lookup(key: string): string | undefined {
  let cur: any = texts;
  for (const part of key.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

export function t(key: string, vars: Record<string, string | number> = {}, fallback = ''): string {
  const base: Record<string, string | number> = {
    gameName: lookup('gameName') ?? 'Jardim das Sombras',
    gameEmoji: lookup('gameEmoji') ?? '🦇',
    ecosystem: lookup('ecosystem') ?? '',
    ...vars,
  };
  const raw = lookup(key) ?? fallback;
  return raw.replace(/\{(\w+)\}/g, (_, k) => (base[k] !== undefined ? String(base[k]) : `{${k}}`));
}

/** Emoji configurável: e('coins') */
export function e(name: string, fallback = ''): string {
  return lookup(`emojis.${name}`) ?? fallback;
}

refreshTexts();
setInterval(refreshTexts, 60_000).unref();
