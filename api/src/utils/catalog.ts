import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

export interface PlantDefinition {
  index: number; // 1 to 12
  id: string;
  name: string;
  category: 'economia' | 'pesca' | 'cassino' | 'waifus';
  seedPrice: number;
  sellPrice: number;
  growthTimeSeconds: number;
  witherTimeSeconds: number;
  coinReward: number;
  bonusType: string;
  bonusDescription: string;
  spriteBaseName: string;
  /** Limite de compra por dia na loja (padrão 10) */
  dailyLimit?: number;
  /** Pool da sacola diária: common (garantida), uncommon, rare, epic. null/false/'none' = nunca cai na sacola */
  dailyBagTier?: 'common' | 'uncommon' | 'rare' | 'epic' | 'none' | null | false;
}

export interface DecorationDefinition {
  index: number; // 13 to 30
  id: string;
  name: string;
  tier: 'simples' | 'medio' | 'complexo' | 'oculto';
  price: number;
  sellPrice: number;
  spriteName: string;
}

export interface ConsumableDefinition {
  index: number; // 31 to 39
  id: string;
  name: string;
  color: string;
  effect: string;
  description: string;
  price: number;
  dailyLimit: number;
  spriteName: string;
}

export const PLANTS: Record<string, PlantDefinition> = {};
export const DECORATIONS: Record<string, DecorationDefinition> = {};
export const CONSUMABLES: Record<string, ConsumableDefinition> = {};

function readJson<T>(file: string): T[] {
  return JSON.parse(fs.readFileSync(path.join(config.DATA_PATH, file), 'utf-8'));
}

/**
 * (Re)carrega plantas, enfeites e consumíveis dos JSONs em data/. Muta os objetos exportados
 * in-place, então todos os módulos que importam PLANTS/DECORATIONS/CONSUMABLES enxergam a mudança (hot-reload).
 */
export function loadCatalog(): void {
  const plants = readJson<PlantDefinition & { key?: string }>('plants.json');
  const decors = readJson<DecorationDefinition & { key?: string }>('decorations.json');
  const consumablesPath = path.join(config.DATA_PATH, 'consumables.json');
  const consumables = fs.existsSync(consumablesPath)
    ? readJson<ConsumableDefinition & { key?: string }>('consumables.json')
    : [];

  for (const k of Object.keys(PLANTS)) delete PLANTS[k];
  for (const k of Object.keys(DECORATIONS)) delete DECORATIONS[k];
  for (const k of Object.keys(CONSUMABLES)) delete CONSUMABLES[k];

  for (const { key, ...p } of plants) PLANTS[key ?? p.id] = p as PlantDefinition;
  for (const { key, ...d } of decors) DECORATIONS[key ?? d.id] = d as DecorationDefinition;
  for (const { key, ...c } of consumables) CONSUMABLES[key ?? c.id] = c as ConsumableDefinition;
}

loadCatalog();

function normalizeStr(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-_]/g, ' ')
    .trim();
}

export function findPlant(query: string | number): PlantDefinition | undefined {
  let qStr = String(query).trim().toLowerCase();
  if (qStr.startsWith('crop_')) {
    qStr = qStr.replace('crop_', '');
  }
  const qNorm = normalizeStr(qStr);
  const qNum = parseInt(qStr);

  if (!isNaN(qNum) && qNum >= 1) {
    for (const plant of Object.values(PLANTS)) {
      if (plant.index === qNum) return plant;
    }
  }

  for (const [key, plant] of Object.entries(PLANTS)) {
    const keyNorm = normalizeStr(key);
    const nameNorm = normalizeStr(plant.name);

    if (keyNorm === qNorm || nameNorm === qNorm) return plant;
    if (keyNorm.includes(qNorm) || nameNorm.includes(qNorm)) return plant;
  }
  return undefined;
}

export function findDecoration(query: string | number): DecorationDefinition | undefined {
  const qStr = String(query).trim().toLowerCase();
  const qNorm = normalizeStr(qStr);
  const qNum = parseInt(qStr);

  if (!isNaN(qNum) && qNum >= 13) {
    for (const decor of Object.values(DECORATIONS)) {
      if (decor.index === qNum) return decor;
    }
  }

  for (const [key, decor] of Object.entries(DECORATIONS)) {
    const keyNorm = normalizeStr(key);
    const nameNorm = normalizeStr(decor.name);
    // O id público (ex.: decor_30_fallen_angel_statues) pode diferir da key interna
    // (decor_18_fallen_angel_statues); ambos precisam resolver para o mesmo enfeite.
    const idNorm = normalizeStr(decor.id);

    if (keyNorm === qNorm || idNorm === qNorm || nameNorm === qNorm) return decor;
    if (keyNorm.includes(qNorm) || nameNorm.includes(qNorm)) return decor;
  }
  return undefined;
}

export function findConsumable(query: string | number): ConsumableDefinition | undefined {
  const qStr = String(query).trim().toLowerCase();
  const qNorm = normalizeStr(qStr);
  const qNum = parseInt(qStr);

  if (!isNaN(qNum) && qNum >= 31) {
    for (const consumable of Object.values(CONSUMABLES)) {
      if (consumable.index === qNum) return consumable;
    }
  }

  for (const [key, consumable] of Object.entries(CONSUMABLES)) {
    const keyNorm = normalizeStr(key);
    const nameNorm = normalizeStr(consumable.name);

    if (keyNorm === qNorm || nameNorm === qNorm) return consumable;
    if (keyNorm.includes(qNorm) || nameNorm.includes(qNorm)) return consumable;
  }
  return undefined;
}

export function findShopItem(query: string | number): {
  isPlant: boolean;
  isConsumable?: boolean;
  isDecoration?: boolean;
  item: PlantDefinition | DecorationDefinition | ConsumableDefinition;
} | undefined {
  const plant = findPlant(query);
  if (plant) return { isPlant: true, isConsumable: false, isDecoration: false, item: plant };

  const consumable = findConsumable(query);
  if (consumable) return { isPlant: false, isConsumable: true, isDecoration: false, item: consumable };

  const decor = findDecoration(query);
  if (decor) return { isPlant: false, isConsumable: false, isDecoration: true, item: decor };

  return undefined;
}

export function getBagPool(tier: 'common' | 'uncommon' | 'rare' | 'epic'): string[] {
  return Object.values(PLANTS)
    .filter((p) => p.dailyBagTier === tier)
    .map((p) => p.id);
}

/**
 * Resolve o itemId canônico para operações de inventário (preservando o prefixo crop_ para colheitas)
 */
export function resolveRealItemId(rawItemId: string | number): string {
  if (!rawItemId) return '';
  const trimmed = String(rawItemId).trim();
  const isCrop = trimmed.startsWith('crop_');
  const baseQuery = isCrop ? trimmed.replace(/^crop_/, '') : trimmed;

  const plant = findPlant(baseQuery);
  if (plant) {
    return isCrop ? `crop_${plant.id}` : plant.id;
  }

  const consumable = findConsumable(trimmed);
  if (consumable) return consumable.id;

  const decor = findDecoration(trimmed);
  if (decor) return decor.id;

  return trimmed;
}

